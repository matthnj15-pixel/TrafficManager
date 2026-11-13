export const baseline = Object.freeze({ node: 310, entry: 82, exit: 58, lanes: 1 });
export const world = Object.freeze({
  start: { x: 448, y: 440 }, inner: 261, outer: 280, auxiliary: 302,
  auxiliaryEnd: 224, signal: 180, south: 590, north: 90
});
export const duration = 210;
export const step = 0.2;
const scale = 0.8; // Metres per map unit.
const lateralAcceleration = 1.5;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function validate(design) {
  return !!design &&
    Number.isFinite(design.node) && design.node >= 275 && design.node <= 375 &&
    Number.isFinite(design.entry) && design.entry >= 25 && design.entry <= 125 &&
    Number.isFinite(design.exit) && design.exit >= 20 && design.exit <= 125 &&
    [1, 2, 3].includes(design.lanes);
}

export function curve(design, lane = 1) {
  const start = world.start;
  const end = { x: lane === 1 ? world.outer : world.auxiliary, y: design.node };
  const a = { x: start.x - design.entry, y: start.y };
  const b = { x: end.x, y: end.y + design.exit };
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
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), angle: a.angle + t * (b.angle - a.angle) };
}

export function signalIsGreen(time) {
  return time % 34 < 21;
}

function arrivals() {
  const trips = [];
  for (let i = 0; i < 48; i++) {
    trips.push({ time: 1 + i * 4.0 + (i % 3) * 0.28, kind: i % 12 === 5 ? "bus" : "car", origin: i % 4 === 0 ? "inner" : "outer" });
  }
  for (let i = 0; i < 40; i++) {
    trips.push({ time: 12 + i * 3.85 + (i % 4) * 0.21, kind: "pickup", origin: "ramp" });
  }
  return trips.sort((a, b) => a.time - b.time).map((trip, id) => ({ ...trip, id }));
}

export function simulate(design) {
  if (!validate(design)) throw new TypeError("Invalid corridor design");
  const geometry = { 1: curve(design, 1), 2: curve(design, 2) };
  const north = (world.south - world.north) * scale;
  const stop = (world.south - world.signal) * scale;
  const merge = (world.south - design.node) * scale;
  const taper = (world.south - world.auxiliaryEnd) * scale;
  const schedule = arrivals();
  const vehicles = [];
  const pending = [];
  const frames = [];
  let next = 0;
  let finished = 0;
  let busDelay = 0;
  let longestQueue = 0;
  const size = vehicle => vehicle.kind === "bus" ? 11 : 4.6;
  const gapAt = (lane, position, speed, vehicle) => vehicles.every(other => {
    if (other.lane !== lane) return true;
    const separation = other.position - position;
    return separation >= 0
      ? separation >= size(other) / 2 + size(vehicle) / 2 + 2 + speed * 0.65
      : -separation >= size(other) / 2 + size(vehicle) / 2 + 2 + other.speed * 0.8 + Math.max(0, other.speed - speed) * 1.2;
  });
  for (let tick = 0; tick <= duration / step; tick++) {
    const time = tick * step;
    while (next < schedule.length && schedule[next].time <= time) pending.push(schedule[next++]);
    for (let i = 0; i < pending.length;) {
      const trip = pending[i];
      const lane = trip.origin === "ramp" ? ((design.lanes & 1) && (!(design.lanes & 2) || trip.id % 2 === 0) ? "r1" : "r2") : trip.origin;
      if (!gapAt(lane, 0, 0, trip) || (lane.startsWith("r") && !gapAt(lane === "r1" ? "r2" : "r1", 0, 0, trip))) {
        i++;
        continue;
      }
      vehicles.push({ ...trip, lane, position: 0, speed: 0, reason: "" });
      pending.splice(i, 1);
    }

    const sorted = [...vehicles].sort((a, b) => b.position - a.position || a.id - b.id);
    for (const car of sorted) {
      const ramp = car.lane.startsWith("r") ? Number(car.lane[1]) : 0;
      const isAux = car.lane === "auxiliary";
      const end = ramp ? geometry[ramp].length : isAux ? taper : north;
      const target = ramp === 2 ? "auxiliary" : "outer";
      const join = ramp ? merge : taper;
      const needsMerge = ramp || isAux;
      const mayMerge = needsMerge && gapAt(target, join, car.speed, car);
      const limit = ramp ? geometry[ramp].speed : car.kind === "bus" ? 12 : 14;
      const green = signalIsGreen(time);
      const signalStop = !needsMerge && !green && car.position < stop - 0.01;
      const signalBarrier = stop - 0.15;
      let barrier = signalStop ? signalBarrier : Infinity;
      let reason = signalStop ? "Red signal" : "";
      if (needsMerge && !mayMerge && end < barrier) {
        barrier = end;
        reason = "Waiting for a merge gap";
      }
      for (const other of vehicles) {
        const otherRamp = other.lane === "r1" || other.lane === "r2";
        if (car === other || (other.lane !== car.lane && !(ramp && otherRamp))) continue;
        const position = ramp && otherRamp ? other.position * geometry[ramp].length / geometry[Number(other.lane[1])].length : other.position;
        if (position <= car.position) continue;
        const back = position - (size(other) + size(car)) / 2 - 2;
        if (back < barrier) {
          barrier = back;
          reason = "Queue ahead";
        }
      }
      const gap = Math.max(0, barrier - car.position);
      const acceleration = car.kind === "bus" ? 1.05 : 2.1;
      const followingSpeed = Math.max(0, Math.sqrt(3 * gap + 2.25) - 1.5);
      car.speed = Math.min(limit, car.speed + acceleration * step, followingSpeed);
      car.position += Math.min(car.speed * step, gap);
      car.reason = car.speed < 2.2 ? reason : "";
      // A vehicle stopped just before the stop line must continue to obey red.
      if (signalStop && car.position >= signalBarrier - 0.03) car.speed = 0;
      if (needsMerge && mayMerge && car.position >= end) {
        car.lane = target;
        car.position = join;
      }
      if (!needsMerge && car.position >= north) {
        vehicles.splice(vehicles.indexOf(car), 1);
        finished++;
        if (car.kind === "bus") busDelay += Math.max(0, time - car.time - (north / 12 + 12 / (2 * 1.05)));
      }
    }
    const queued = {};
    const markers = vehicles.map(car => {
      const queueLane = car.lane.startsWith("r") ? "ramp" : car.lane;
      if (car.reason) queued[queueLane] = (queued[queueLane] ?? 0) + size(car) + 2;
      const point = car.lane.startsWith("r")
        ? pointOnCurve(geometry[Number(car.lane[1])], car.position)
        : { x: world[car.lane], y: world.south - car.position / scale, angle: -Math.PI / 2 };
      return { ...point, id: car.id, kind: car.kind, speed: car.speed, reason: car.reason };
    });
    const waiting = pending.length + vehicles.length;
    longestQueue = Math.max(longestQueue, ...Object.values(queued));
    frames.push({ markers, green: signalIsGreen(time), finished, waiting, longestQueue, busDelay });
  }
  // Include delay already incurred by buses that are still on the map or waiting to enter.
  for (const bus of [...pending, ...vehicles].filter(car => car.kind === "bus")) {
    busDelay += Math.max(0, duration - bus.time - ((bus.position ?? 0) / 12 + 12 / (2 * 1.05)));
  }
  return { frames, results: { finished, waiting: schedule.length - finished, longestQueue, busDelay: busDelay / 4 } };
}
