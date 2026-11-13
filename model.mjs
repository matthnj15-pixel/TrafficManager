export const baseline = Object.freeze({ node: 310, entry: 82, exit: 58, lanes: 1, mergeEnd: 224 });
export const world = Object.freeze({
  start: { x: 448, y: 440 }, inner: 261, outer: 280, auxiliary: 302,
  signal: 180, south: 590, north: 90
});
export const duration = 210;
export const step = 0.2;
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
    (design.mergeEnd === undefined || (Number.isFinite(design.mergeEnd) &&
      design.mergeEnd >= mergeEndBounds(design.node)[0] && design.mergeEnd <= mergeEndBounds(design.node)[1]));
}

export function mergeTaper(design) {
  const end = design.mergeEnd ?? clamp(baseline.mergeEnd, ...mergeEndBounds(design.node));
  const start = end + 38;
  const third = (start - end) / 3;
  return { start, end, path: `M ${world.auxiliary} ${design.node} V ${start} C ${world.auxiliary} ${start - third} ${world.outer} ${end + third} ${world.outer} ${end}` };
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

const roadPosition = y => (world.south - y) * scale;

function auxiliaryPose(taper, position) {
  const y = world.south - position / scale;
  const t = clamp((taper.start - y) / (taper.start - taper.end), 0, 1);
  const x = world.auxiliary + (world.outer - world.auxiliary) * t * t * (3 - 2 * t);
  const dx = (world.outer - world.auxiliary) * 6 * t * (1 - t);
  return { x, y, angle: Math.atan2(taper.end - taper.start, dx) };
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

export function signalIsGreen(time) {
  return time % 34 < 21;
}

function arrivals() {
  const trips = [];
  for (let i = 0; i < 48; i++) {
    trips.push({ time: 1 + i * 4.0 + (i % 3) * 0.28, kind: i % 12 === 5 ? "bus" : "car", origin: i % 4 === 0 ? "inner" : "outer" });
  }
  for (let i = 0; i < 40; i++) {
    trips.push({ time: 12 + i * 3.85 + (i % 4) * 0.21, kind: "pickup", origin: "ramp", pickupIndex: i });
  }
  return trips.sort((a, b) => a.time - b.time).map((trip, id) => ({ ...trip, id }));
}

// A swept footprint encloses both ends of the replay interpolation, with a
// margin for the corners' rotation between samples. Use it for every move,
// including when two lanes share pavement or their paths cross.
function sweep(from, to, { length, width }) {
  const halfLength = length / scale / 2;
  const halfWidth = width / scale / 2;
  const turn = Math.atan2(Math.sin(to.angle - from.angle), Math.cos(to.angle - from.angle));
  const padding = Math.hypot(halfLength, halfWidth) * (1 - Math.cos(turn / 2));
  const points = [];
  for (const { x, y, angle } of [from, to]) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const l of [-halfLength, halfLength]) {
      for (const w of [-halfWidth, halfWidth]) points.push([x + l * c - w * s, y + l * s + w * c]);
    }
  }
  return {
    points, angles: [from.angle, to.angle, Math.atan2(to.y - from.y, to.x - from.x)], padding,
    minX: Math.min(...points.map(p => p[0])) - padding, maxX: Math.max(...points.map(p => p[0])) + padding,
    minY: Math.min(...points.map(p => p[1])) - padding, maxY: Math.max(...points.map(p => p[1])) + padding
  };
}

function conflicts(a, b) {
  if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) return false;
  const margin = a.padding + b.padding;
  for (const angle of [...a.angles, ...b.angles]) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const [x, y] of [[c, s], [-s, c]]) {
      const first = a.points.map(p => p[0] * x + p[1] * y);
      const second = b.points.map(p => p[0] * x + p[1] * y);
      if (Math.max(...first) + margin <= Math.min(...second) || Math.max(...second) + margin <= Math.min(...first)) return false;
    }
  }
  return true;
}

function gapAt(vehicles, lane, position, speed, car) {
  return vehicles.every(other => {
    if (other === car || other.lane !== lane) return true;
    const separation = other.position - position;
    const bumperGap = Math.abs(separation) - (other.size.length + car.size.length) / 2;
    return bumperGap >= 2 + (separation >= 0 ? speed * .55 : other.speed * .7);
  });
}

// When both approaches are queued, release one vehicle at a time, alternating
// approaches. Traffic already past the main-lane yield point gets to clear.
function updateMerge(gate, vehicles) {
  if (gate.owner && (gate.owner.lane === gate.feeder ||
    gate.owner.position < gate.end + gate.owner.size.length / 2 + 2)) return;
  gate.owner = undefined;
  const lead = (lane, min, max) => vehicles.reduce((best, car) =>
    car.lane === lane && car.position >= min && car.position <= max &&
      (!best || car.position > best.position) ? car : best, undefined);
  const feeder = lead(gate.feeder, gate.hold - 4, Infinity);
  const main = lead("outer", gate.mainHold - 9, gate.mainHold + .02);
  gate.waiting = !!feeder;
  if (!feeder) return;
  const clearing = lead("outer", gate.mainHold + .02, gate.end + 3);
  if (clearing) return;
  if (main && gate.last === "feeder") {
    gate.owner = main;
    gate.last = "main";
  } else {
    gate.owner = feeder;
    gate.last = "feeder";
  }
}

export function simulate(design) {
  if (!validate(design)) throw new TypeError("Invalid corridor design");
  const paths = { r1: curve(design, 1), r2: curve(design, 2) };
  const taper = mergeTaper(design);
  const north = roadPosition(world.north);
  const stop = roadPosition(world.signal);
  const merge = roadPosition(design.node);
  const taperEnd = roadPosition(taper.end);
  const directHold = paths.r1.samples.findLast(p => p.x >= world.outer + 7);
  const directMainHold = roadPosition(directHold.y) - 13;
  const auxiliaryEntryHold = paths.r2.samples.findLast(p => p.x >= world.auxiliary + 7).length;
  const gates = [];
  if (design.lanes & 1) gates.push({ feeder: "r1", hold: directHold.length, mainHold: directMainHold, end: merge });
  if (design.lanes & 2) gates.push({ feeder: "auxiliary", hold: roadPosition(taper.start), mainHold: roadPosition(taper.start) - 5, end: taperEnd });
  const pose = (lane, position) => {
    if (paths[lane]) return pointOnCurve(paths[lane], position);
    if (lane === "auxiliary") return auxiliaryPose(taper, position);
    return { x: world[lane], y: world.south - position / scale, angle: -Math.PI / 2 };
  };
  const schedule = arrivals();
  const vehicles = [];
  const pending = [];
  const frames = [];
  let next = 0;
  let finished = 0;
  let busDelay = 0;
  let longestQueue = 0;
  const freeBusTime = distance => distance / 12 + 12 / (2 * 1.05);
  for (let tick = 0; tick <= duration / step; tick++) {
    const time = tick * step;
    const green = signalIsGreen(time);
    while (next < schedule.length && schedule[next].time <= time) pending.push(schedule[next++]);
    const blockedOrigins = new Set();
    for (let i = 0; i < pending.length;) {
      const trip = pending[i];
      const lane = trip.origin === "ramp" ? ((design.lanes & 1) && (!(design.lanes & 2) || trip.pickupIndex % 2 === 0) ? "r1" : "r2") : trip.origin;
      const car = { ...trip, lane, position: 0, speed: 0, reason: "", size: vehicleDimensions(trip.kind) };
      const start = pose(lane, 0);
      car.footprint = sweep(start, start, car.size);
      if (blockedOrigins.has(trip.origin) || !gapAt(vehicles, lane, 0, 0, car) ||
          vehicles.some(other => conflicts(car.footprint, other.footprint))) {
        blockedOrigins.add(trip.origin);
        i++;
        continue;
      }
      vehicles.push(car);
      pending.splice(i, 1);
    }

    for (const gate of gates) updateMerge(gate, vehicles);
    const order = car => paths[car.lane] ? merge + car.position - paths[car.lane].length : car.position;
    const sorted = [...vehicles].sort((a, b) => order(b) - order(a) || a.id - b.id);
    for (const car of sorted) {
      const ramp = paths[car.lane];
      const isAux = car.lane === "auxiliary";
      const end = ramp?.length ?? (isAux ? taperEnd : north);
      const target = car.lane === "r2" ? "auxiliary" : "outer";
      const join = isAux ? taperEnd : merge;
      const limit = ramp?.speed ?? (isAux ? 8 : car.kind === "bus" ? 12 : 14);
      let barrier = Infinity;
      let reason = "";
      const stopAt = (position, why) => {
        if (position < barrier) {
          barrier = position;
          reason = why;
        }
      };
      if (!ramp && !isAux && !green && car.position < stop - car.size.length / 2) {
        stopAt(stop - car.size.length / 2 - .15, "Red signal");
      }
      for (const gate of gates) {
        if (car.lane === gate.feeder && car !== gate.owner && car.position <= gate.hold) {
          stopAt(gate.hold, "Waiting for a merge gap");
        } else if (car.lane === "outer" && gate.waiting && car !== gate.owner && car.position <= gate.mainHold) {
          stopAt(gate.mainHold, "Yielding at the merge");
        }
      }
      if (car.lane === "r2" && !gapAt(vehicles, target, join, car.speed, car)) {
        stopAt(car.position <= auxiliaryEntryHold ? auxiliaryEntryHold : end, "Queue ahead");
      }
      for (const other of vehicles) {
        if (car === other) continue;
        const otherRamp = paths[other.lane];
        if (car.lane !== other.lane && !(ramp && otherRamp)) continue;
        const position = ramp && otherRamp ? other.position * ramp.length / otherRamp.length : other.position;
        if (position <= car.position) continue;
        stopAt(position - (other.size.length + car.size.length) / 2 - 2, "Queue ahead");
      }
      const gap = Math.max(0, barrier - car.position);
      const acceleration = car.kind === "bus" ? 1.05 : 2.1;
      const desired = Math.min(limit, car.speed + acceleration * step, Math.sqrt(3 * gap + 2.25) - 1.5);
      const from = pose(car.lane, car.position);
      const travel = Math.min(desired * step, gap);
      const candidate = distance => {
        let lane = car.lane;
        let position = car.position + distance;
        if ((ramp || isAux) && position > end) {
          lane = target;
          position = join + position - end;
        }
        return { lane, position, footprint: sweep(from, pose(lane, position), car.size) };
      };
      const clear = move => vehicles.every(other => other === car || !conflicts(move.footprint, other.footprint));
      let distance = travel;
      let move = candidate(distance);
      if (!clear(move)) {
        reason = "Yielding to nearby traffic";
        let low = 0;
        let high = travel;
        for (let i = 0; i < 8; i++) {
          const middle = (low + high) / 2;
          if (clear(candidate(middle))) low = middle;
          else high = middle;
        }
        distance = low;
        move = candidate(distance);
      }
      car.lane = move.lane;
      car.position = move.position;
      car.footprint = move.footprint;
      car.speed = distance / step;
      car.reason = car.speed < 2.2 ? reason : "";
      if (!paths[car.lane] && car.lane !== "auxiliary" && car.position >= north) {
        finished++;
        if (car.kind === "bus") busDelay += Math.max(0, time - car.time - freeBusTime(north));
        car.finished = true;
      }
    }
    const queued = {};
    for (let i = vehicles.length - 1; i >= 0; i--) {
      const car = vehicles[i];
      if (car.finished) {
        vehicles.splice(i, 1);
        continue;
      }
      const point = pose(car.lane, car.position);
      car.footprint = sweep(point, point, car.size);
      const queueLane = paths[car.lane] ? "ramp" : car.lane;
      if (car.reason) queued[queueLane] = (queued[queueLane] ?? 0) + car.size.length + 2;
    }
    const markers = vehicles.map(car => ({ ...pose(car.lane, car.position), id: car.id,
      kind: car.kind, lane: car.lane, speed: car.speed, reason: car.reason }));
    longestQueue = Math.max(longestQueue, ...Object.values(queued));
    frames.push({ markers, green, finished, waiting: pending.length + vehicles.length, longestQueue, busDelay });
  }
  for (const bus of [...pending, ...vehicles].filter(car => car.kind === "bus")) {
    busDelay += Math.max(0, duration - bus.time - freeBusTime(bus.position ?? 0));
  }
  return { frames, results: { finished, waiting: schedule.length - finished, longestQueue, busDelay: busDelay / 4 } };
}
