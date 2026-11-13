export const baseline = Object.freeze({ node: 310, entry: 82, exit: 58, lanes: 1, mergeEnd: 224, taperLength: 38, green: 21 });
export const world = Object.freeze({
  start: { x: 448, y: 440 }, inner: 261, outer: 280, auxiliary: 302,
  signal: 180, south: 590, north: 90
});
export const duration = 210;
export const step = 0.2;
export const signalCycle = 40;
export const greenBounds = [14, 26];
export const scale = 0.8; // Metres per map unit.
const lateralAcceleration = 1.5;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function mergeEndBounds(node) {
  return [world.signal + 22, node - 54];
}

export function validate(design) {
  return !!design &&
    Number.isFinite(design.node) && design.node >= 275 && design.node <= 375 &&
    Number.isFinite(design.entry) && design.entry >= 25 && design.entry <= 125 &&
    Number.isFinite(design.exit) && design.exit >= 20 && design.exit <= 125 &&
    [1, 2, 3].includes(design.lanes) &&
    (design.green === undefined || Number.isInteger(design.green) && design.green >= greenBounds[0] && design.green <= greenBounds[1]) &&
    (design.taperLength === undefined || Number.isInteger(design.taperLength) && design.taperLength >= 24 && design.taperLength <= taperLengthBounds(design)[1]) &&
    (design.mergeEnd === undefined || (Number.isFinite(design.mergeEnd) &&
      design.mergeEnd >= mergeEndBounds(design.node)[0] && design.mergeEnd <= mergeEndBounds(design.node)[1]));
}

export function taperLengthBounds(design) {
  return [24, Math.min(80, design.node - (design.mergeEnd ?? mergeEndBounds(design.node)[1]) - 8)];
}

export function mergeTaper(design) {
  const end = design.mergeEnd ?? clamp(baseline.mergeEnd, ...mergeEndBounds(design.node));
  const length = design.taperLength ?? baseline.taperLength;
  const start = end + length;
  const width = (world.auxiliary - world.outer) * scale;
  const radius = (length * scale) ** 2 / (6 * width);
  const speed = Math.min(14, Math.sqrt(lateralAcceleration * radius));
  const third = (start - end) / 3;
  return { start, end, radius, speed, path: `M ${world.auxiliary} ${design.node} V ${start} C ${world.auxiliary} ${start - third} ${world.outer} ${end + third} ${world.outer} ${end}` };
}

export function replayMarkers(frames, time) {
  const index = Math.min(time / step, frames.length - 1);
  const frame = frames[Math.floor(index)];
  const fraction = index % 1;
  const next = frames[Math.ceil(index)];
  if (!fraction) return frame.markers;
  const nextById = new Map(next.markers.map(car => [car.id, car]));
  return frame.markers.map(car => {
    const following = nextById.get(car.id);
    return following ? { ...car, ...interpolatePose(car, following, fraction) } : car;
  });
}

export function vehicleDimensions(kind) {
  return kind === "bus" ? { length: 11, width: 2.55 } : { length: 4.6, width: 1.85 };
}

export function interpolatePose(a, b, t) {
  const angle = b.angle - a.angle;
  const turn = Math.atan2(Math.sin(angle), Math.cos(angle));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: a.angle + turn * t };
}

export function curve(design, lane = 1) {
  const start = world.start;
  const end = { x: lane === 1 ? world.outer : world.auxiliary, y: design.node };
  const a = { x: start.x - design.entry, y: start.y };
  const b = { x: end.x, y: Math.min(start.y, end.y + design.exit) };
  const samples = [];
  let length = 0;
  let radius = Infinity;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const u = 1 - t;
    const x = u ** 3 * start.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * end.x;
    const y = u ** 3 * start.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * end.y;
    const dx = 3 * (u * u * (a.x - start.x) + 2 * u * t * (b.x - a.x) + t * t * (end.x - b.x));
    const dy = 3 * (u * u * (a.y - start.y) + 2 * u * t * (b.y - a.y) + t * t * (end.y - b.y));
    const ddx = 6 * (u * (b.x - 2 * a.x + start.x) + t * (end.x - 2 * b.x + a.x));
    const ddy = 6 * (u * (b.y - 2 * a.y + start.y) + t * (end.y - 2 * b.y + a.y));
    const previous = samples.at(-1);
    if (previous) length += Math.hypot(x - previous.x, y - previous.y) * scale;
    const curvatureRadius = scale * Math.hypot(dx, dy) ** 3 / Math.abs(dx * ddy - dy * ddx);
    radius = Math.min(radius, curvatureRadius);
    samples.push({ x, y, length, angle: Math.atan2(dy, dx) });
  }
  return { start, a, b, end, samples, length, radius,
    speed: Math.min(12, Math.sqrt(lateralAcceleration * radius)),
    path: `M ${start.x} ${start.y} C ${a.x} ${a.y} ${b.x} ${b.y} ${end.x} ${end.y}` };
}

export function pointOnCurve(geometry, distance) {
  const points = geometry.samples;
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle].length < distance) low = middle;
    else high = middle;
  }
  const a = points[low];
  const b = points[high];
  const t = clamp((distance - a.length) / (b.length - a.length), 0, 1);
  return interpolatePose(a, b, t);
}

export function arrivals() {
  const trips = [];
  for (let i = 0; i < 48; i++) {
    trips.push({ time: 1 + i * 4.0 + (i % 3) * 0.28, kind: i % 12 === 5 ? "bus" : "car", origin: i % 4 === 0 ? "inner" : "outer" });
  }
  for (let i = 0; i < 40; i++) {
    trips.push({ time: 12 + i * 3.85 + (i % 4) * 0.21, kind: "pickup", origin: "ramp", pickupIndex: i });
  }
  for (let i = 0; i < 28; i++) {
    trips.push({ time: 3 + i * 6.2 + (i % 3) * .37, kind: "car", origin: "cross" });
  }
  return trips.sort((a, b) => a.time - b.time).map((trip, id) => ({ ...trip, id }));
}

export function normalizeDesign(design) {
  const mergeEnd = mergeTaper(design).end;
  return {
    node: design.node, entry: design.entry, exit: Math.min(design.exit, world.start.y - design.node),
    lanes: design.lanes, mergeEnd,
    taperLength: Math.min(design.taperLength ?? baseline.taperLength, taperLengthBounds({ ...design, mergeEnd })[1]),
    green: design.green ?? baseline.green
  };
}
