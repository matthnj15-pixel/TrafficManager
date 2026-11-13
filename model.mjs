export const baseline = Object.freeze({ node: 310, entry: 82, exit: 58, lanes: 1, mergeEnd: 224, taperLength: 38, green: 21, slipStart: 0, slipEnd: 0, slipBend: 42, slipYield: true, pickupYield: false, taperYield: false, signalRight: true, schoolRight: true, schoolAccess: true, network: null, road: null, slipLane: 1, pickupLane: 1 });
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

export function mergeEndBounds(node, slipStart = 0) {
  return [Math.max(world.signal + 22, slipStart + 8), node - 54];
}

export function validate(design) {
  return !!design &&
    Number.isFinite(design.node) && design.node >= 275 && design.node <= 375 &&
    Number.isFinite(design.entry) && design.entry >= 25 && design.entry <= 125 &&
    Number.isFinite(design.exit) && design.exit >= 20 && design.exit <= 125 &&
    ([1, 2, 3].includes(design.lanes) || design.lanes === 0 && Array.isArray(design.road)) &&
    validRoad(design.road) && validNetwork(design.network) &&
    ["slipLane", "pickupLane"].every(key => design[key] === undefined ||
      Number.isInteger(design[key]) && design[key] >= 1 && design[key] <= 4) &&
    ["slipYield", "pickupYield", "taperYield", "signalRight", "schoolRight", "schoolAccess"].every(key => design[key] === undefined || typeof design[key] === "boolean") &&
    (design.slipBend === undefined || Number.isInteger(design.slipBend) && design.slipBend >= 16 && design.slipBend <= 70) &&
    ((design.slipStart ?? 0) === 0 && (design.slipEnd ?? 0) === 0 ||
      Number.isInteger(design.slipStart) && design.slipStart >= 205 && design.slipStart <= slipStartMax(design) &&
      Number.isInteger(design.slipEnd) && design.slipEnd >= 348 && design.slipEnd <= 430) &&
    (design.green === undefined || Number.isInteger(design.green) && design.green >= greenBounds[0] && design.green <= greenBounds[1]) &&
    (design.taperLength === undefined || Number.isInteger(design.taperLength) && design.taperLength >= 24 && design.taperLength <= taperLengthBounds(design)[1]) &&
    (design.mergeEnd === undefined || (Number.isFinite(design.mergeEnd) &&
      design.mergeEnd >= mergeEndBounds(design.node, design.lanes & 2 ? design.slipStart : 0)[0] && design.mergeEnd <= mergeEndBounds(design.node)[1]));
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
  const end = { x: lane === 1 ? avenueLaneX("north", selectedLane(design, "pickup")) : world.auxiliary, y: design.node };
  const a = { x: start.x - design.entry, y: start.y };
  const b = { x: end.x, y: Math.min(start.y, end.y + design.exit) };
  return cubic(start, a, b, end);
}

function cubic(start, a, b, end) {
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

export function slipStartMax(design) {
  return design.lanes & 2 ? (design.mergeEnd ?? baseline.mergeEnd) - 8 : Math.min(265, design.node - 12);
}

export function slipGeometry(design) {
  const start = { x: avenueLaneX("north", selectedLane(design, "slip")), y: design.slipStart };
  const end = { x: design.slipEnd, y: world.signal };
  const a = { x: start.x, y: start.y - (start.y - end.y) * .65 };
  const b = { x: end.x - design.slipBend, y: end.y };
  return cubic(start, a, b, end);
}

export function schoolEntry() {
  const start = { x: world.outer, y: world.start.y + 58 };
  const end = { x: world.start.x, y: world.start.y + 17 };
  return cubic(start, { x: start.x, y: start.y - 28 },
    { x: end.x - 95, y: end.y }, end);
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
    trips.push({ time: 1 + i * 4.0 + (i % 3) * 0.28, kind: i % 12 === 5 ? "bus" : "car", origin: i % 4 === 0 ? "inner" : "outer",
      destination: i % 12 === 2 ? "school" : i % 12 === 6 || i % 12 === 9 ? "east" : "north" });
  }
  for (let i = 0; i < 40; i++) {
    trips.push({ time: 12 + i * 3.85 + (i % 4) * 0.21, kind: "pickup", origin: "ramp", pickupIndex: i, destination: i % 3 === 0 ? "east" : "north" });
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
    green: design.green ?? baseline.green,
    slipStart: design.slipStart ?? 0, slipEnd: design.slipEnd ?? 0,
    slipBend: design.slipBend ?? baseline.slipBend,
    slipYield: design.slipYield ?? baseline.slipYield, pickupYield: design.pickupYield ?? baseline.pickupYield,
    taperYield: design.taperYield ?? design.pickupYield ?? baseline.taperYield,
    network: design.network ?? null, road: design.road ?? null, slipLane: design.slipLane ?? 1, pickupLane: design.pickupLane ?? 1,
    schoolAccess: design.schoolAccess ?? baseline.schoolAccess,
    signalRight: design.signalRight ?? baseline.signalRight, schoolRight: design.schoolRight ?? baseline.schoolRight
  };
}

export const laneSpacing = 19;
export const roadPresets = [
  ["1 lane ↑", 1, 0], ["2 lanes ↕", 1, 1], ["3 lanes ↕", 2, 1], ["4 lanes ↕", 2, 2]
];

function validRoad(road) {
  if (road == null) return true;
  return Array.isArray(road) && road.length <= 30 && road.every((segment, index) => {
    const { top, bottom, north, south, bend } = segment ?? {};
    return [top, bottom, north, south, bend].every(Number.isInteger) &&
      top >= world.north && bottom <= world.south && bottom - top >= 8 &&
      north >= 0 && north <= 4 && south >= 0 && south <= 4 && north + south > 0 &&
      Math.abs(bend) <= 24 && (index === 0 || road[index - 1].bottom <= top);
  });
}

export function avenueAnchors(design) {
  return [...new Set([world.north, world.signal, design.slipStart, design.lanes & 2 ? design.mergeEnd : 0,
    design.lanes ? design.node : 0, design.schoolAccess === false ? 0 : schoolEntry().start.y, world.south].filter(Boolean))].sort((a, b) => a - b);
}

export function avenueSegments(design) {
  const anchors = avenueAnchors(design);
  return design.road ?? anchors.slice(1).map((bottom, i) => ({
    top: anchors[i], bottom, north: 2, south: 1, bend: 0
  }));
}

export function avenueSegmentAt(design, y) {
  return avenueSegments(design).find(segment => segment.top <= y && y < segment.bottom);
}

export function selectedLane(design, movement) {
  if (design.road == null) return 1;
  const pickup = movement === "pickup";
  const segment = avenueSegmentAt(design, pickup ? design.node - .01 : design.slipStart + .01);
  return Math.min(design[pickup ? "pickupLane" : "slipLane"] ?? 1, segment?.north || 1);
}

export function avenueLaneX(direction, number) {
  return direction === "north" ? world.outer + (number - 1) * laneSpacing : world.inner - laneSpacing - (number - 1) * laneSpacing;
}

// Bend each uninterrupted section independently so every junction retains its straight tangent.
export function avenuePieces(design) {
  const anchors = avenueAnchors(design);
  return avenueSegments(design).flatMap(segment => {
    const bounds = [segment.top, ...anchors.filter(y => y > segment.top && y < segment.bottom), segment.bottom];
    return bounds.slice(1).map((bottom, i) => ({ ...segment, top: bounds[i], bottom }));
  });
}

export function avenueLanePath(piece, x, north = true) {
  const { top, bottom, bend } = piece;
  const start = { x, y: north ? bottom : top };
  const end = { x, y: north ? top : bottom };
  const delta = (end.y - start.y) / 3;
  // Two smooth curves meet at the center of the segment.
  const mid = { x: x + bend, y: (start.y + end.y) / 2 };
  const first = cubic(start, { x, y: start.y + delta / 2 }, { x: mid.x, y: mid.y - delta / 2 }, mid);
  const second = cubic(mid, { x: mid.x, y: mid.y + delta / 2 }, { x, y: end.y - delta / 2 }, end);
  return { path: first.path + second.path.replace(/^M [^ ]+ [^ ]+ /, ""),
    samples: [...first.samples.filter((_, i) => i % 10 === 0), ...second.samples.filter((_, i) => i > 0 && i % 10 === 0)],
    speed: bend ? Math.min(14, first.speed, second.speed) : 14 };
}

export const terminals = Object.freeze({
  north: { id: "north", name: "North", x: 270, y: 90, dx: 0, dy: -24 },
  south: { id: "south", name: "South", x: 270, y: 590, dx: 0, dy: 24 },
  west: { id: "west", name: "West", x: 40, y: 180, dx: -24, dy: 0 },
  east: { id: "east", name: "East", x: 470, y: 180, dx: 24, dy: 0 },
  school: { id: "school", name: "School access", x: 155, y: 327, dx: 0, dy: -25 },
  pickup: { id: "pickup", name: "Pickup loop", x: 448, y: 440, dx: 25, dy: 0 }
});

export const trees = [[31,118],[44,142],[191,121],[211,151],[38,282],[66,299],[178,285],[207,267],
  [432,179],[457,192],[431,221],[451,230],[394,301],[423,310],[458,348],
  [186,375],[204,397],[153,426],[78,433],[40,470],[418,551],[449,569],[464,580],[54,552]]
  .filter(([x, y]) => !(x > 420 && y < 200));

export const siteFootprints = [
  { name: "the school", x: 48, y: 190, w: 83, h: 26 },
  { name: "the school", x: 143, y: 200, w: 56, h: 37 },
  { name: "the playing field", x: 52, y: 228, w: 92, h: 57 },
  { name: "a house", x: 36, y: 540, w: 90, h: 64 },
  { name: "a house", x: 358, y: 116, w: 48, h: 48 },
  { name: "a house", x: 371, y: 254, w: 60, h: 29 }
];

export function scheduledTrips(withSouthbound) {
  const trips = arrivals();
  if (withSouthbound) {
    for (let i = 0; i < 12; i++) trips.push({ id: trips.length, time: 6 + i * 14, kind: "car", origin: "southbound" });
    trips.sort((a, b) => a.time - b.time);
  }
  return trips;
}

export function tripTerminals(trip) {
  if (trip.origin === "cross") return ["west", "east"];
  if (trip.origin === "southbound") return ["north", "south"];
  return [trip.origin === "ramp" ? "pickup" : "south", trip.destination];
}

export const networkLaneWidth = 6;

export function networkNodes(network) {
  return new Map([...Object.values(terminals), ...network.nodes].map(node => [node.id, node]));
}

export function networkRoadGeometry(road, nodes) {
  const start = nodes.get(road.a), end = nodes.get(road.b);
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const ox = -dy * road.bend / length, oy = dx * road.bend / length;
  const a = { x: start.x + dx / 3 + ox, y: start.y + dy / 3 + oy };
  const b = { x: end.x - dx / 3 + ox, y: end.y - dy / 3 + oy };
  const geometry = cubic(start, a, b, end);
  return { ...geometry, speed: road.bend ? geometry.speed : 12 };
}

function footprintAt(point, clearance) {
  const { x, y } = point;
  const building = siteFootprints.find(site =>
    Math.hypot(Math.max(site.x - x, 0, x - site.x - site.w), Math.max(site.y - y, 0, y - site.y - site.h)) < clearance);
  if (building) return building.name;
  if (trees.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < clearance + 6)) return "a tree";
}

export function networkNodeIssue(point) {
  const obstacle = footprintAt(point, 2);
  if (obstacle) return `This junction would overlap ${obstacle}.`;
  if (point.x < 8 || point.x > 492 || point.y < 68 || point.y > 622) return "Keep junctions inside the map.";
}

export function networkRoadIssue(network, road, ignore = -1) {
  const nodes = networkNodes(network);
  const start = nodes.get(road.a), end = nodes.get(road.b);
  if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < 16) return "Choose a point farther away.";
  const { samples } = networkRoadGeometry(road, nodes);
  const clearance = Math.max(road.forward, road.backward) * networkLaneWidth + 2;
  for (const point of samples) {
    const obstacle = footprintAt(point, clearance);
    if (obstacle) return `This road would cross ${obstacle}.`;
    if (point.x < 8 || point.x > 492 || point.y < 68 || point.y > 622) return "Keep roads inside the map.";
  }
  const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  for (const [index, other] of network.roads.entries()) {
    if (index === ignore) continue;
    if ([other.a, other.b].every(id => id === road.a || id === road.b)) return "These nodes already share a road.";
    const shared = [other.a, other.b].find(id => id === road.a || id === road.b);
    const origin = nodes.get(shared);
    const otherSamples = networkRoadGeometry(other, nodes).samples;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      for (let j = 1; j < otherSamples.length; j++) {
        const c = otherSamples[j - 1], d = otherSamples[j];
        if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
            Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) continue;
        if (cross(a, b, c) * cross(a, b, d) > 0 || cross(c, d, a) * cross(c, d, b) > 0) continue;
        if (origin && [a, b, c, d].every(p => Math.hypot(p.x - origin.x, p.y - origin.y) < 4)) continue;
        return "Add a junction before connecting across this road.";
      }
    }
  }
}

function validNetwork(network) {
  if (network == null) return true;
  if (!Array.isArray(network.nodes) || !Array.isArray(network.roads) || network.nodes.length > 60 || network.roads.length > 90) return false;
  const ids = new Set(Object.keys(terminals));
  for (const node of network.nodes) {
    if (!node || !/^j\d+$/.test(node.id) || ids.has(node.id) ||
        !Number.isFinite(node.x) || !Number.isFinite(node.y) || networkNodeIssue(node) || !["priority", "allway_stop", "traffic_light"].includes(node.control)) return false;
    ids.add(node.id);
  }
  return network.roads.every((road, index) => road && ids.has(road.a) && ids.has(road.b) &&
    [road.forward, road.backward].every(count => Number.isInteger(count) && count >= 0 && count <= 4) &&
    road.forward + road.backward > 0 && Number.isFinite(road.bend) && Math.abs(road.bend) <= 32 &&
    !networkRoadIssue(network, road, index));
}
