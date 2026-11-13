import { arrivals, baseline, curve, duration, mergeTaper, normalizeDesign, scale, signalCycle, step, validate, vehicleDimensions, world } from "./model.mjs";

export function sumoRequest(design) {
  if (!validate(design)) throw new Error("Invalid corridor design.");
  const layout = input => {
    const config = normalizeDesign(input);
    const taper = mergeTaper(config);
    return {
      design: config,
      taperSpeed: taper.speed,
      curves: [1, 2].map(lane => {
        const path = curve(config, lane);
        return { speed: path.speed, points: path.samples.map(({ x, y }) => [x, y]) };
      }),
      taper: Array.from({ length: 39 }, (_, i) => {
        const t = i / 38;
        return [
          world.auxiliary + (world.outer - world.auxiliary) * t * t * (3 - 2 * t),
          taper.start + (taper.end - taper.start) * t
        ];
      })
    };
  };
  return {
    schema: "traffic-manager.sumo-request.v2", world, scale, step, duration,
    signalCycle,
    types: { car: vehicleDimensions("car"), bus: vehicleDimensions("bus"), pickup: vehicleDimensions("pickup") },
    trips: arrivals(),
    original: layout(baseline), edited: layout(design)
  };
}

export function readSumoComparison(data, design) {
  if (data?.schema !== "traffic-manager.sumo-comparison.v2" || typeof data.version !== "string") {
    throw new Error("SUMO returned an invalid comparison.");
  }
  const keys = Object.keys(baseline);
  const matches = (a, b) => a && keys.every(key => a[key] === b[key]);
  if (!matches(data.original?.design, baseline) || !matches(data.edited?.design, normalizeDesign(design))) {
    throw new Error("SUMO returned results for a different road design.");
  }
  const nonnegative = value => Number.isFinite(value) && value >= 0;
  const validMarker = marker => marker && Number.isInteger(marker.id) && marker.id >= 0 &&
    ["car", "bus", "pickup"].includes(marker.kind) && [marker.x, marker.y, marker.angle].every(Number.isFinite) &&
    nonnegative(marker.speed) && typeof marker.reason === "string" && typeof marker.zone === "string";
  for (const run of [data.original, data.edited]) {
    if (!run.results || !["finished", "waiting", "longestQueue", "peakFrame", "busDelay", "crossDelay", "crossFinished", "pickupFinished", "collisions"].every(key => nonnegative(run.results[key])) ||
      !Number.isInteger(run.results.peakFrame) || run.results.peakFrame > duration / step ||
      !Array.isArray(run.frames) || run.frames.length !== duration / step + 1 ||
      !run.frames.every(frame => frame && ["avenue", "avenue-yellow", "cross", "cross-yellow", "all-red"].includes(frame.phase) && typeof frame.queueZone === "string" && nonnegative(frame.finished) &&
        nonnegative(frame.longestQueue) && Array.isArray(frame.markers) && frame.markers.length <= 116 &&
        frame.markers.every(validMarker))) {
      throw new Error("SUMO returned incomplete results.");
    }
  }
  return data;
}
