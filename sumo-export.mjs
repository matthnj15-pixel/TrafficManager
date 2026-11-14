import { baseline, curve, duration, levelStart, levelTrips, mergeTaper, normalizeDesign, scale, schoolEntry, signalCycle, slipGeometry, step, validate, vehicleDimensions, world } from "./model.mjs";

export function sumoRequest(design, levelId) {
  if (!validate(design)) throw new Error("Invalid corridor design.");
  const points = geometry => geometry.samples.map(({ x, y }) => [x, y]);
  const layout = input => {
    const config = normalizeDesign(input);
    const taper = mergeTaper(config);
    const slip = config.slipStart ? slipGeometry(config) : undefined;
    return {
      design: config,
      taperSpeed: taper.speed,
      slip: slip ? points(slip) : [],
      slipSpeed: slip?.speed ?? 0,
      schoolEntry: points(schoolEntry()),
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
  const initial = levelId ? levelStart(levelId) : baseline;
  const trips = levelTrips(levelId, design);
  return {
    schema: "traffic-manager.sumo-request.v2", world, scale, step, duration,
    signalCycle,
    types: { car: vehicleDimensions("car"), bus: vehicleDimensions("bus"), pickup: vehicleDimensions("pickup") },
    trips,
    original: layout(initial), edited: layout(design)
  };
}

export function readSumoComparison(data, design, levelId) {
  if (data?.schema !== "traffic-manager.sumo-comparison.v2" || typeof data.version !== "string") {
    throw new Error("SUMO returned an invalid comparison.");
  }
  const keys = Object.keys(baseline);
  const matches = (a, b) => a && keys.every(key => JSON.stringify(a[key]) === JSON.stringify(b[key]));
  const initial = levelId ? levelStart(levelId) : baseline;
  const levelTripsCount = levelTrips(levelId, design).length;
  if (!matches(data.original?.design, initial) || !matches(data.edited?.design, normalizeDesign(design))) {
    throw new Error("SUMO returned results for a different road design.");
  }
  const nonnegative = value => Number.isFinite(value) && value >= 0;
  const validMarker = marker => marker && Number.isInteger(marker.id) && marker.id >= 0 &&
    ["car", "bus", "pickup"].includes(marker.kind) && [marker.x, marker.y, marker.angle].every(Number.isFinite) &&
    (marker.grade === undefined || [-1, 1].includes(marker.grade)) &&
    nonnegative(marker.speed) && typeof marker.reason === "string" && typeof marker.zone === "string";
  for (const run of [data.original, data.edited]) {
    if (!run.results || !["finished", "waiting", "longestQueue", "peakFrame", "busDelay", "crossDelay", "crossFinished", "northFinished", "pickupFinished", "slipFinished", "unserved", "collisions"].every(key => nonnegative(run.results[key])) ||
      !Number.isInteger(run.results.peakFrame) || run.results.peakFrame > duration / step ||
      !Array.isArray(run.frames) || run.frames.length !== duration / step + 1 ||
      !run.frames.every(frame => frame && ["avenue", "avenue-yellow", "cross", "cross-yellow", "all-red"].includes(frame.phase) && typeof frame.queueZone === "string" && nonnegative(frame.finished) &&
        nonnegative(frame.longestQueue) && Array.isArray(frame.markers) && frame.markers.length <= levelTripsCount &&
        frame.markers.every(validMarker))) {
      throw new Error("SUMO returned incomplete results.");
    }
  }
  return data;
}
