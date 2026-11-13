import { arrivals, baseline, curve, duration, mergeTaper, scale, step, validate, vehicleDimensions, world } from "./model.mjs";

export function sumoRequest(design) {
  if (!validate(design)) throw new Error("Invalid corridor design.");
  const layout = config => {
    const taper = mergeTaper(config);
    return {
      design: { node: config.node, entry: config.entry, exit: config.exit, lanes: config.lanes, mergeEnd: taper.end },
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
    schema: "traffic-manager.sumo-request.v1", world, scale, step, duration,
    signal: { green: 21, cycle: 34 },
    types: { car: vehicleDimensions("car"), bus: vehicleDimensions("bus"), pickup: vehicleDimensions("pickup") },
    trips: arrivals(),
    original: layout(baseline), edited: layout(design)
  };
}

export function readSumoComparison(data, design) {
  if (data?.schema !== "traffic-manager.sumo-comparison.v1" || typeof data.version !== "string") {
    throw new Error("Choose a Traffic Manager SUMO results file.");
  }
  const keys = Object.keys(baseline);
  const matches = (a, b) => a && keys.every(key => a[key] === b[key]);
  if (!matches(data.original?.design, baseline) || !matches(data.edited?.design, design)) {
    throw new Error("These SUMO results are for a different road design.");
  }
  const nonnegative = value => Number.isFinite(value) && value >= 0;
  const validMarker = marker => marker && Number.isInteger(marker.id) && marker.id >= 0 &&
    ["car", "bus", "pickup"].includes(marker.kind) && [marker.x, marker.y, marker.angle].every(Number.isFinite) &&
    nonnegative(marker.speed) && typeof marker.reason === "string";
  for (const run of [data.original, data.edited]) {
    if (!run.results || !["finished", "waiting", "longestQueue", "busDelay", "collisions"].every(key => nonnegative(run.results[key])) ||
      !Array.isArray(run.frames) || run.frames.length !== duration / step + 1 ||
      !run.frames.every(frame => frame && typeof frame.green === "boolean" && nonnegative(frame.finished) &&
        nonnegative(frame.longestQueue) && Array.isArray(frame.markers) && frame.markers.length <= 100 &&
        frame.markers.every(validMarker))) {
      throw new Error("This SUMO results file is incomplete or damaged.");
    }
  }
  return data;
}
