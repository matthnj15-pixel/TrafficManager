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
export const maxLaneShift = 4;

export function starterNetwork() {
  const nodes = [
    { id: "j1", x: 270, y: 180, control: "traffic_light" },
    { id: "j2", x: 270, y: 327, control: "priority" }
  ];
  const roads = [["north", "j1"], ["west", "j1"], ["j1", "east"], ["j1", "j2"], ["j2", "south"], ["j2", "school"]]
    .map(([a, b]) => ({ a, b, forward: 1, backward: 1, bend: 0 }));
  roads.push({ a: "pickup", b: "j2", forward: 1, backward: 0, bend: 0, controls: [368, 440, 270, 420], atB: "yield" });
  return { nodes, roads };
}

export function networkNodes(network) {
  return new Map([...Object.values(terminals), ...network.nodes].map(node => [node.id, node]));
}

export const movementKey = ({ from, to, fromLane, toLane }) => `${from}:${fromLane}>${to}:${toLane}`;
export const incomingLaneKey = (neighbor, lane) => `${neighbor}:${lane}`;

export function junctionLegs(network, id, nodes = networkNodes(network)) {
  return network.roads.flatMap((road, index) => {
    const atA = road.a === id;
    if (!atA && road.b !== id) return [];
    return [{
      neighbor: atA ? road.b : road.a, road, index, atA,
      incoming: atA ? road.backward : road.forward,
      outgoing: atA ? road.forward : road.backward,
      arrivalAnchor: atA ? undefined : road.laneB,
      departureAnchor: atA ? road.laneA : undefined,
      slip: !!(road.laneA || road.laneB),
      bearing: roadEndBearing(road, nodes, atA),
      rule: (atA ? road.atA : road.atB) ?? "default"
    }];
  });
}

export function junctionMovements(network, node, applyLaneRules = true) {
  const moves = node.movements ?? defaultJunctionMovements(network, node);
  if (!applyLaneRules || !node.laneRules) return moves;
  return moves.map(move => ({
    ...move, rule: node.laneRules[incomingLaneKey(move.from, move.fromLane)] ?? move.rule
  }));
}

function defaultJunctionMovements(network, node) {
  const legs = junctionLegs(network, node.id);
  return legs.flatMap(from => {
    if (!from.incoming) return [];
    const through = throughLeg(legs, from, "outgoing");
    const excess = excessJunctionLanes(legs, from, "incoming");
    const exitingLanes = new Set(legs.filter(leg => leg.departureAnchor?.neighbor === from.neighbor)
      .map(leg => leg.departureAnchor.lane).filter(lane => excess.includes(lane)));
    return legs.filter(to => to !== from && to.outgoing).flatMap(to =>
      Array.from({ length: from.incoming }, (_, fromLane) => {
        const move = {
          from: from.neighbor, to: to.neighbor, fromLane,
          toLane: from.arrivalAnchor?.lane ?? clamp(fromLane + (to === through ? throughLaneDelta(from, to) :
            Math.max(0, to.outgoing - from.incoming)), 0, to.outgoing - 1),
          rule: from.rule
        };
        if ((exitingLanes.has(fromLane) && !to.departureAnchor) || !fitsLaneAnchors(move, from, to)) return undefined;
        return move;
      }).filter(Boolean));
  });
}

function fitsLaneAnchors(move, from, to) {
  return (!from.arrivalAnchor || from.arrivalAnchor.neighbor === move.to && from.arrivalAnchor.lane === move.toLane) &&
    (!to.departureAnchor || to.departureAnchor.neighbor === move.from && to.departureAnchor.lane === move.fromLane);
}

function roadEndBearing(road, nodes, atA) {
  const { start, end, a, b } = roadControlPoints(road, nodes);
  const tip = atA ? start : end, handle = atA ? a : b;
  return Math.atan2(handle.y - tip.y, handle.x - tip.x);
}

function throughLeg(legs, leg, direction) {
  let best, alignment = -.72;
  for (const candidate of legs) {
    if (candidate === leg || !candidate[direction] || candidate.slip) continue;
    const dot = Math.cos(candidate.bearing - leg.bearing);
    if (dot < alignment) {
      best = candidate;
      alignment = dot;
    }
  }
  return best;
}

export function excessJunctionLanes(legs, leg, direction) {
  if (leg.slip) return [];
  const opposite = direction === "incoming" ? "outgoing" : "incoming";
  const through = throughLeg(legs, leg, opposite);
  if (!through) return [];
  const delta = direction === "incoming" ? throughLaneDelta(leg, through) : -throughLaneDelta(through, leg);
  return Array.from({ length: leg[direction] }, (_, lane) => lane)
    .filter(lane => lane + delta < 0 || lane + delta >= through[opposite]);
}

function throughLaneDelta(from, to) {
  const fromShift = (from.road.laneShift ?? 0) * (from.atA ? -1 : 1);
  const toShift = (to.road.laneShift ?? 0) * (to.atA ? 1 : -1);
  return to.outgoing - from.incoming + toShift - fromShift;
}

function laneDropCount(legs) {
  const through = legs.filter(leg => !leg.slip);
  return through.length === 2 ? Math.max(...through.map(leg => excessJunctionLanes(through, leg, "incoming").length)) : 0;
}

export function isLaneDrop(network, node) {
  if (node.control !== "priority" || node.movements || node.laneRules) return false;
  const legs = junctionLegs(network, node.id);
  return legs.length === 2 && laneDropCount(legs) === 1;
}

export function junctionLanePose(leg, nodes, direction, lane, setback = 0) {
  const geometry = networkRoadGeometry(leg.road, nodes);
  const distance = Math.min(setback * scale, geometry.length * .6);
  const tip = pointOnCurve(geometry, leg.atA ? distance : geometry.length - distance);
  const reverse = leg.atA === (direction === "incoming");
  return roadLanePosition({ ...tip, angle: tip.angle + (reverse ? Math.PI : 0) }, leg[direction], lane,
    (leg.road.laneShift ?? 0) * (reverse ? -1 : 1));
}

function validIncomingRule(key, rule, legs) {
  const [neighbor, lane, extra] = key.split(":");
  return extra === undefined && /^(0|[1-3])$/.test(lane) && Number(lane) < legs.get(neighbor)?.incoming &&
    ["stop", "yield"].includes(rule);
}

function validMovement(movement, legs) {
  if (!movement || movement.from === movement.to || !["default", "priority", "stop", "yield"].includes(movement.rule)) return false;
  const from = legs.get(movement.from), to = legs.get(movement.to);
  return Number.isInteger(movement.fromLane) && movement.fromLane >= 0 && movement.fromLane < from?.incoming &&
    Number.isInteger(movement.toLane) && movement.toLane >= 0 && movement.toLane < to?.outgoing &&
    fitsLaneAnchors(movement, from, to);
}

function validLaneAnchor(anchor, road, atA, network) {
  if (anchor === undefined) return true;
  if (!anchor || road.forward !== 1 || road.backward !== 0 || !Number.isInteger(anchor.lane) || anchor.lane < 0) return false;
  const host = network.roads.find(item => item !== road &&
    (item.a === (atA ? road.a : road.b) && item.b === anchor.neighbor ||
     item.b === (atA ? road.a : road.b) && item.a === anchor.neighbor));
  if (!host || host.laneA || host.laneB) return false;
  const from = atA ? anchor.neighbor : road.b;
  return anchor.lane < (host.a === from ? host.forward : host.backward);
}

export function reconcileJunctionMovements(network) {
  let changed = false;
  const released = [];
  const roads = network.roads.map(road => {
    const badStart = !validLaneAnchor(road.laneA, road, true, network);
    const badEnd = !validLaneAnchor(road.laneB, road, false, network);
    if (!badStart && !badEnd) return road;
    changed = true;
    if (badStart) released.push([road.a, road.laneA]);
    return { ...road, ...(badStart ? { laneA: undefined } : {}), ...(badEnd ? { laneB: undefined } : {}) };
  });
  if (changed) network = released.reduce((next, [id, anchor]) => restoreReleasedLane(next, id, anchor), { ...network, roads });
  const nodes = network.nodes.map(node => {
    if (!node.movements && !node.laneRules) return node;
    const legs = new Map(junctionLegs(network, node.id).map(leg => [leg.neighbor, leg]));
    const movements = node.movements?.filter(movement => validMovement(movement, legs));
    const rules = Object.entries(node.laneRules ?? {});
    const remainingRules = rules.filter(([key, rule]) => validIncomingRule(key, rule, legs));
    if (movements?.length === node.movements?.length && remainingRules.length === rules.length) return node;
    changed = true;
    return { ...node, movements, laneRules: remainingRules.length ? Object.fromEntries(remainingRules) : undefined };
  });
  return changed ? { ...network, nodes } : network;
}

function roadControlPoints(road, nodes) {
  const start = nodes.get(road.a), end = nodes.get(road.b);
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const ox = -dy * road.bend / length, oy = dx * road.bend / length;
  const base = road.controls ?? [start.x + dx / 3, start.y + dy / 3, end.x - dx / 3, end.y - dy / 3];
  const a = { x: base[0] + ox, y: base[1] + oy };
  const b = { x: base[2] + ox, y: base[3] + oy };
  return { start, a, b, end };
}

export function networkRoadGeometry(road, nodes) {
  const { start, a, b, end } = roadControlPoints(road, nodes);
  const geometry = cubic(start, a, b, end);
  return { ...geometry, speed: road.bend || road.controls ? geometry.speed : 12 };
}

export function roadLanePosition(pose, count, lane, shift = 0) {
  const offset = (count - lane - .5 + shift) * networkLaneWidth;
  return { ...pose, x: pose.x - Math.sin(pose.angle) * offset, y: pose.y + Math.cos(pose.angle) * offset };
}

export function laneDropTaper(network, road, nodes, forward) {
  const id = forward ? road.b : road.a;
  const node = nodes.get(id);
  if (node.control !== "priority" || node.movements || node.laneRules) return [];
  const legs = junctionLegs(network, id, nodes);
  const leg = legs.find(item => item.road === road);
  if (!leg || !laneDropCount(legs)) return [];
  const excess = excessJunctionLanes(legs, leg, "incoming");
  if (!(leg.road.laneShift || throughLeg(legs, leg, "outgoing")?.road.laneShift) &&
      legs.some(item => item.departureAnchor?.neighbor === leg.neighbor && excess.includes(item.departureAnchor.lane))) return [];
  return excess.filter(lane =>
    !legs.some(item => item.departureAnchor?.neighbor === leg.neighbor && item.departureAnchor.lane === lane));
}

export function networkLaneSamples(road, network, nodes, forward, lane, geometry = networkRoadGeometry(road, nodes)) {
  const count = forward ? road.forward : road.backward;
  const path = forward ? geometry.samples : [...geometry.samples].reverse().map(p => ({ ...p, angle: p.angle + Math.PI }));
  const drops = count > 1 ? laneDropTaper(network, road, nodes, forward) : [];
  const shift = (road.laneShift ?? 0) * (forward ? 1 : -1);
  const retained = Array.from({ length: count }, (_, i) => i).filter(i => !drops.includes(i));
  const nearest = retained.reduce((best, i) =>
    Math.abs(i - lane) < Math.abs(best - lane) ? i : best, retained[0] ?? lane);
  const legacyOuterDrop = drops.length > 1 && drops.every((drop, index) => drop === index);
  const mergeOffset = !drops.includes(lane) ? 0 : legacyOuterDrop ? .62 * (drops.length - lane) / drops.length : Math.sign(nearest - lane) * .62;
  const reach = Math.min(geometry.length * .45, 30 * scale);
  const points = path.filter((_, index) => index % 5 === 0).map(p => {
    if (!mergeOffset) return roadLanePosition(p, count, lane, shift);
    const remaining = forward ? geometry.length - p.length : p.length;
    const t = 1 - clamp(remaining / reach, 0, 1);
    return roadLanePosition(p, count, lane + mergeOffset * t * t * (3 - 2 * t), shift);
  });
  if (!forward || !road.laneA && !road.laneB) return points;
  for (const [atStart, anchor] of [[true, road.laneA], [false, road.laneB]]) {
    if (!anchor) continue;
    const end = atStart ? road.a : road.b;
    const leg = junctionLegs(network, end, nodes).find(item => item.neighbor === anchor.neighbor);
    if (!leg) continue;
    const target = junctionLanePose(leg, nodes, atStart ? "incoming" : "outgoing", anchor.lane);
    const current = points[atStart ? 0 : points.length - 1];
    const dx = target.x - current.x, dy = target.y - current.y;
    const reach = Math.min(geometry.length * .46, 26 * scale);
    for (const p of points) {
      const distance = atStart ? p.length : geometry.length - p.length;
      const weight = 1 - clamp(distance / reach, 0, 1);
      const smooth = weight * weight * (3 - 2 * weight);
      p.x += dx * smooth;
      p.y += dy * smooth;
    }
  }
  return points;
}

export function networkMergeSamples(network, from, to, nodes, fromLane, toLane) {
  const lane = (leg, forward, index) => networkLaneSamples(leg.road, network, nodes, forward, index);
  const arrival = lane(from, !from.atA, fromLane);
  const departure = lane(to, to.atA, toLane);
  const start = arrival.at(-2), end = departure[1];
  const length = Math.hypot(end.x - start.x, end.y - start.y) / 3;
  const handle = (point, shift) => ({
    x: point.x + Math.cos(point.angle) * shift, y: point.y + Math.sin(point.angle) * shift
  });
  return cubic(start, handle(start, length), handle(end, -length), end).samples.filter((_, i) => i % 20 === 0);
}

export function roadCurveFromPull(start, end, delta) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 16) return undefined;
  const nx = -dy / length, ny = dx / length;
  const limit = Math.min(70, length * .45);
  const bend = clamp(delta.x * nx + delta.y * ny, -limit, limit) * 4 / 3;
  if (Math.abs(bend) < 3) return undefined;
  return [start.x + dx / 3 + nx * bend, start.y + dy / 3 + ny * bend,
    end.x - dx / 3 + nx * bend, end.y - dy / 3 + ny * bend];
}

export function roadDraftControls(points, tangents = []) {
  const vector = (a, b) => ({ x: b.x - a.x, y: b.y - a.y });
  return points.slice(1).map((end, index) => {
    const start = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const control = (anchor, at, sign) => {
      const edited = tangents[at];
      const direction = edited ?? vector(points[Math.max(0, at - 1)], points[Math.min(at + 1, points.length - 1)]);
      const magnitude = Math.hypot(direction.x, direction.y);
      const reach = edited?.reach === undefined ? length / 3 : clamp(edited.reach, 4, length * 1.25);
      const factor = magnitude ? sign * reach / magnitude : 0;
      return [anchor.x + direction.x * factor, anchor.y + direction.y * factor];
    };
    return [...control(start, index, 1), ...control(end, index + 1, -1)];
  });
}

export function freeformBendControls(start, end, delta) {
  const handle = { x: (start.x + end.x) / 2 + delta.x * 2, y: (start.y + end.y) / 2 + delta.y * 2 };
  const control = point => [point.x + (handle.x - point.x) * 2 / 3, point.y + (handle.y - point.y) * 2 / 3];
  return [...control(start), ...control(end)];
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
  const geometry = networkRoadGeometry(road, nodes);
  const { samples, speed } = geometry;
  if (!Number.isFinite(speed)) return "Keep the curve handles clear of their endpoints.";
  const clearance = Math.max(road.forward, road.backward) * networkLaneWidth + 2;
  const offset = (road.laneShift ?? 0) * networkLaneWidth;
  for (const point of samples) {
    const center = { x: point.x - Math.sin(point.angle) * offset, y: point.y + Math.cos(point.angle) * offset };
    const obstacle = footprintAt(center, clearance);
    if (obstacle) return `This road would cross ${obstacle}.`;
    if (center.x < 8 || center.x > 492 || center.y < 68 || center.y > 622) return "Keep roads inside the map.";
  }
  if (road.forward === 1 && road.backward === 0 && (road.laneA || road.laneB)) {
    for (const point of networkLaneSamples(road, network, nodes, true, 0, geometry)) {
      const obstacle = footprintAt(point, networkLaneWidth / 2 + 2);
      if (obstacle) return `This lane would cross ${obstacle}.`;
      if (point.x < 8 || point.x > 492 || point.y < 68 || point.y > 622) return "Keep lanes inside the map.";
    }
  }
  for (const [index, other] of network.roads.entries()) {
    if (index === ignore) continue;
    if ([other.a, other.b].every(id => id === road.a || id === road.b)) return "These nodes already share a road.";
    if (roadCrossings(road, other, nodes).length) return "Roads must meet at a shared junction.";
  }
}

function roadCrossings(road, other, nodes) {
  const first = networkRoadGeometry(road, nodes);
  const second = networkRoadGeometry(other, nodes);
  const controls = ({ start, a, b, end }) => [start, a, b, end];
  for (const axis of ["x", "y"]) {
    const a = controls(first).map(point => point[axis]);
    const b = controls(second).map(point => point[axis]);
    if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return [];
  }
  const { samples } = first;
  const otherSamples = second.samples;
  const shared = [road.a, road.b].filter(id => id === other.a || id === other.b).map(id => nodes.get(id));
  const cross = (ax, ay, bx, by) => ax * by - ay * bx;
  const hits = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const rx = b.x - a.x, ry = b.y - a.y;
    for (let j = 1; j < otherSamples.length; j++) {
      const c = otherSamples[j - 1], d = otherSamples[j];
      if (Math.max(a.x, b.x) + 1e-7 < Math.min(c.x, d.x) || Math.max(c.x, d.x) + 1e-7 < Math.min(a.x, b.x) ||
          Math.max(a.y, b.y) + 1e-7 < Math.min(c.y, d.y) || Math.max(c.y, d.y) + 1e-7 < Math.min(a.y, b.y)) continue;
      const sx = d.x - c.x, sy = d.y - c.y;
      const qx = c.x - a.x, qy = c.y - a.y;
      const determinant = cross(rx, ry, sx, sy);
      if (Math.abs(determinant) < 1e-8) {
        if (Math.abs(cross(qx, qy, rx, ry)) > 1e-7) continue;
        const squared = rx * rx + ry * ry;
        const projections = [qx * rx + qy * ry, (d.x - a.x) * rx + (d.y - a.y) * ry].map(value => value / squared);
        if (Math.min(1, Math.max(...projections)) - Math.max(0, Math.min(...projections)) > 1e-7) {
          return [{ overlap: true }];
        }
        continue;
      }
      const t = cross(qx, qy, sx, sy) / determinant;
      const u = cross(qx, qy, rx, ry) / determinant;
      if (Math.min(t, u) < -1e-7 || Math.max(t, u) > 1 + 1e-7) continue;
      const x = a.x + t * rx, y = a.y + t * ry;
      if (shared.some(node => Math.hypot(node.x - x, node.y - y) < .1) ||
          hits.some(hit => Math.hypot(hit.x - x, hit.y - y) < .1)) continue;
      hits.push({ x, y, t: (i - 1 + t) / 100, u: (j - 1 + u) / 100 });
    }
  }
  return hits;
}

export function nextNetworkNode(network, point) {
  const used = new Set(network.nodes.map(node => node.id));
  let number = 1;
  while (used.has(`j${number}`)) number++;
  return { id: `j${number}`, x: point.x, y: point.y, control: "priority" };
}

function splitRoad(road, nodes, cuts) {
  if (!cuts.length) return [road];
  const geometry = networkRoadGeometry(road, nodes);
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  let [p0, p1, p2, p3] = [geometry.start, geometry.a, geometry.b, geometry.end];
  let previous = { node: nodes.get(road.a), t: 0 };
  const parts = [];
  const part = (a, b, c1, c2, first, last) => ({
    a: a.id, b: b.id, forward: road.forward, backward: road.backward, bend: 0,
    ...(road.laneShift ? { laneShift: road.laneShift } : {}),
    ...(road.controls || road.bend ? { controls: [c1.x, c1.y, c2.x, c2.y] } : {}),
    ...(first && road.atA ? { atA: road.atA } : {}), ...(last && road.atB ? { atB: road.atB } : {}),
    ...(first && road.laneA ? { laneA: road.laneA } : {}), ...(last && road.laneB ? { laneB: road.laneB } : {})
  });
  for (const cut of cuts.sort((a, b) => a.t - b.t)) {
    const t = (cut.t - previous.t) / (1 - previous.t);
    const a = mix(p0, p1, t), b = mix(p1, p2, t), c = mix(p2, p3, t);
    const d = mix(a, b, t), e = mix(b, c, t);
    parts.push(part(previous.node, cut.node, a, d, previous.t === 0, false));
    [p0, p1, p2] = [cut.node, e, c];
    previous = cut;
  }
  parts.push(part(previous.node, nodes.get(road.b), p1, p2, false, true));
  return parts;
}

export function splitNetworkRoad(network, index, node, t) {
  const nodes = networkNodes(network);
  const parts = splitRoad(network.roads[index], nodes, [{ node, t }]);
  const roads = network.roads.flatMap((road, i) => i === index ? parts : road);
  return checkNetworkEdit(remapSplitReferences({ nodes: [...network.nodes, node], roads }, network.roads[index], parts), network.roads);
}

export function commitRoadDraft(network, points, lanes, controls) {
  const added = [...network.nodes];
  const originalNodes = networkNodes(network);
  const cuts = new Map();
  const anchors = [];
  // Resolve all taps against the unchanged network so two taps on the same
  // road split it together. Publish the edited graph only after every span fits.
  for (const point of points) {
    if (point.id) {
      anchors.push(point);
      continue;
    }
    const issue = networkNodeIssue(point);
    if (issue) return { issue };
    const node = nextNetworkNode({ nodes: added }, point);
    added.push(node);
    anchors.push(node);
    if (point.index !== undefined) {
      if (!cuts.has(point.index)) cuts.set(point.index, []);
      cuts.get(point.index).push({ node, t: point.t });
    }
  }
  const splits = new Map([...cuts].map(([index, hits]) => [network.roads[index], splitRoad(network.roads[index], originalNodes, hits)]));
  const anchorHosts = new Map();
  let next = { nodes: added, roads: network.roads.flatMap(road => splits.get(road) ?? [road]) };
  for (const [road, parts] of splits) {
    anchorHosts.set(`${road.a}:${road.b}`, parts[0].b);
    anchorHosts.set(`${road.b}:${road.a}`, parts.at(-1).a);
    next = remapSplitReferences(next, road, parts);
  }
  const anchored = points.some(point => point.anchor);
  for (let index = 0; index < anchors.length - 1; index++) {
    const a = anchors[index], b = anchors[index + 1];
    const road = { a: a.id, b: b.id, ...(anchored ? { forward: 1, backward: 0 } : lanes), bend: 0,
      ...(controls[index] ? { controls: controls[index] } : {}) };
    for (const [point, atStart, key] of [[a, true, "laneA"], [b, false, "laneB"]]) {
      if (!point.anchor) continue;
      const lookup = `${point.id}:${point.anchor.neighbor}`;
      const neighbor = anchorHosts.get(lookup) ?? point.anchor.neighbor;
      road[key] = { ...point.anchor, neighbor };
      if (!validLaneAnchor(road[key], road, atStart, next)) return { issue: "Choose a lane flowing in the right direction." };
    }
    const result = connectNetworkRoad(next, road);
    if (!result.network) return result;
    next = road.laneA || road.laneB ? refreshLaneConnections(result.network, road) : result.network;
  }
  const result = checkNetworkEdit(next, network.roads);
  return result.network ? { network: result.network, last: anchors.at(-1) } : result;
}

export function shiftNetworkRoad(network, index, laneShift) {
  const road = network.roads[index];
  if (!road || laneShift === (road.laneShift ?? 0)) return { network };
  if (!Number.isInteger(laneShift) || Math.abs(laneShift) > maxLaneShift) return { issue: "Choose a lane within range." };
  const shifted = { ...road, laneShift: laneShift || undefined };
  const touches = (other, end, anchor) => anchor && (other[end] === road.a && anchor.neighbor === road.b ||
    other[end] === road.b && anchor.neighbor === road.a);
  const roads = network.roads.map(other => other === road ? shifted :
    touches(other, "a", other.laneA) || touches(other, "b", other.laneB) ? { ...other } : other);
  const next = { ...network, roads };
  const checked = checkNetworkEdit(next, network.roads);
  if (checked.issue) return checked;
  const nodes = networkNodes(next);
  const offset = (pose, shift) => ({
      x: pose.x - Math.sin(pose.angle) * shift * networkLaneWidth,
      y: pose.y + Math.cos(pose.angle) * shift * networkLaneWidth
  });
  const shape = item => networkRoadGeometry(item, nodes).samples.filter((_, i) => i % 2 === 0)
    .map(pose => offset(pose, item.laneShift ?? 0));
  const before = shape(road);
  const after = shape(shifted);
  for (const other of next.roads) {
    if (other === shifted || [other.a, other.b].some(id => id === road.a || id === road.b)) continue;
    const otherCenter = shape(other);
    const clearance = (shifted.forward + shifted.backward + other.forward + other.backward) * networkLaneWidth / 2;
    // Only reject newly created overlaps. A shift can also pull two previously
    // close roads apart, and roads sharing a junction have lane-to-lane links.
    const overlaps = points => points.some(point => otherCenter.some(pose => Math.hypot(pose.x - point.x, pose.y - point.y) < clearance));
    if (overlaps(after) && !overlaps(before)) return { issue: "This shift would overlap another road." };
  }
  return checked;
}

function remapJunctionNeighbor(network, id, before, after) {
  if (before === after) return network;
  const nodes = network.nodes.map(node => {
    if ((!node.movements && !node.laneRules) || node.id !== id) return node;
    const laneRules = node.laneRules && Object.fromEntries(Object.entries(node.laneRules).map(([key, rule]) => {
      const [neighbor, lane] = key.split(":");
      return [incomingLaneKey(neighbor === before ? after : neighbor, lane), rule];
    }));
    return { ...node, laneRules, movements: node.movements?.map(move => ({
      ...move, from: move.from === before ? after : move.from, to: move.to === before ? after : move.to
    })) };
  });
  const roads = network.roads.map(road => {
    if (road.a === id && road.laneA?.neighbor === before) return { ...road, laneA: { ...road.laneA, neighbor: after } };
    if (road.b === id && road.laneB?.neighbor === before) return { ...road, laneB: { ...road.laneB, neighbor: after } };
    return road;
  });
  return { ...network, nodes, roads };
}

function remapSplitReferences(network, road, parts) {
  if (parts.length === 1) return network;
  const next = remapJunctionNeighbor(network, road.a, road.b, parts[0].b);
  return remapJunctionNeighbor(next, road.b, road.a, parts.at(-1).a);
}

export function moveNetworkNode(network, id, point, targetId, roadTarget) {
  const node = network.nodes.find(item => item.id === id);
  if (!node) return { issue: "This connection is fixed." };
  if (id === targetId || !targetId && !roadTarget && point.x === node.x && point.y === node.y) return { network };
  const target = targetId ? networkNodes(network).get(targetId) : point;
  const issue = targetId ? undefined : networkNodeIssue(target);
  if (issue) return { issue };
  const attached = network.roads.filter(road => road.a === id || road.b === id);
  const movedAnchorIds = road => {
    if (!targetId) return road;
    return {
      ...road,
      ...(road.laneA?.neighbor === id ? { laneA: { ...road.laneA, neighbor: targetId } } : {}),
      ...(road.laneB?.neighbor === id ? { laneB: { ...road.laneB, neighbor: targetId } } : {})
    };
  };
  let next = {
    nodes: network.nodes.flatMap(item => item.id !== id ? [item] : targetId ? [] : [{ ...node, x: target.x, y: target.y }]),
    roads: network.roads.filter(road => !attached.includes(road))
  };
  if (roadTarget) {
    const road = network.roads[roadTarget.index];
    const parts = splitRoad(road, networkNodes(network), [{ node: { ...node, ...point }, t: roadTarget.t }]);
    next.roads = next.roads.flatMap(item => item === road ? parts : item);
    next = remapSplitReferences(next, road, parts);
    const result = checkNetworkEdit(next, network.roads);
    if (result.issue) return result;
  }
  for (const road of attached) {
    const atStart = road.a === id;
    const moved = { ...movedAnchorIds(road), [atStart ? "a" : "b"]: targetId ?? id };
    if (targetId) {
      const other = atStart ? road.b : road.a;
      next = remapJunctionNeighbor(next, other, id, targetId);
    }
    if (road.controls) {
      moved.controls = [...road.controls];
      const offset = atStart ? 0 : 2;
      moved.controls[offset] += target.x - node.x;
      moved.controls[offset + 1] += target.y - node.y;
    }
    const result = connectNetworkRoad(next, moved);
    if (result.issue) return result;
    next = result.network;
  }
  return { network: next };
}

function checkNetworkEdit(network, previousRoads) {
  if (network.nodes.length > 60 || network.roads.length > 90) return { issue: "This map is full." };
  for (const [index, road] of network.roads.entries()) {
    if (previousRoads.includes(road)) continue;
    const issue = networkRoadIssue(network, road, index);
    if (issue) return { issue };
  }
  return { network };
}

export function moveRoadLaneAnchor(network, index, end, target) {
  const road = network.roads[index];
  const atA = end === "a", key = atA ? "laneA" : "laneB";
  if (!road || road.forward !== 1 || road.backward !== 0) return { issue: "Use a one-way lane to attach a slip road." };
  const anchor = target.anchor;
  const id = target.id;
  if (id === road[end] && anchor?.neighbor === road[key]?.neighbor && anchor?.lane === road[key]?.lane) return { network, road };
  let next = network;
  const nodes = networkNodes(network);
  let destination = id;
  if (!destination) {
    const issue = networkNodeIssue(target);
    if (issue) return { issue };
    const node = nextNetworkNode(next, target);
    if (target.index !== undefined) {
      if (target.index === index) return { issue: "Connect to another road." };
      const result = splitNetworkRoad(next, target.index, node, target.t);
      if (!result.network) return result;
      next = result.network;
    } else next = { ...next, nodes: [...next.nodes, node] };
    destination = node.id;
  }
  const moved = { ...road, [end]: destination, [key]: anchor };
  if (anchor && !validLaneAnchor(anchor, moved, atA, next)) return { issue: "Choose a lane flowing in the right direction." };
  if (road.controls) {
    const previous = nodes.get(road[end]), point = networkNodes(next).get(destination);
    moved.controls = [...road.controls];
    const offset = atA ? 0 : 2;
    moved.controls[offset] += point.x - previous.x;
    moved.controls[offset + 1] += point.y - previous.y;
  }
  const replace = next.roads.findIndex(item => item.a === road.a && item.b === road.b);
  const result = connectNetworkRoad(next, moved, replace);
  if (!result.network) return result;
  if (destination !== road[end] && result.network.roads.some(item => item.a === moved.a && item.b === moved.b)) {
    const other = atA ? road.b : road.a;
    result.network = remapJunctionNeighbor(result.network, other, road[end], destination);
    if (road.laneA && atA) result.network = restoreReleasedLane(result.network, road.a, road.laneA);
  }
  const oldNode = destination !== road[end] && result.network.nodes.find(node => node.id === road[end]);
  if (oldNode && !result.network.roads.some(item => item.a === oldNode.id || item.b === oldNode.id)) {
    result.network = { ...result.network, nodes: result.network.nodes.filter(node => node !== oldNode) };
  }
  return { ...result, network: refreshLaneConnections(result.network, moved, road), road: moved };
}

function restoreReleasedLane(network, id, anchor) {
  const node = network.nodes.find(item => item.id === id);
  if (!node?.movements || !anchor) return network;
  const legs = junctionLegs(network, id);
  const host = legs.find(leg => leg.neighbor === anchor.neighbor);
  if (!host || !excessJunctionLanes(legs, host, "incoming").includes(anchor.lane)) return network;
  const through = throughLeg(legs, host, "outgoing");
  const move = defaultJunctionMovements(network, node)
    .find(item => item.from === anchor.neighbor && item.fromLane === anchor.lane && item.to === through.neighbor);
  if (!move || node.movements.some(item => movementKey(item) === movementKey(move))) return network;
  const movements = [...node.movements, move];
  return { ...network, nodes: network.nodes.map(item => item === node ? { ...item, movements } : item) };
}

export function removeNetworkRoad(network, index) {
  const road = network.roads[index];
  const next = { ...network, roads: network.roads.filter((_, i) => i !== index) };
  return road?.laneA ? restoreReleasedLane(next, road.a, road.laneA) : next;
}

export function refreshLaneConnections(network, road, previous) {
  let next = network;
  for (const [end, other, anchor] of [["a", "b", "laneA"], ["b", "a", "laneB"]]) {
    if (!road[anchor] && !previous?.[anchor]) continue;
    const id = road[end];
    const node = next.nodes.find(item => item.id === id);
    if (!node?.movements || !network.roads.some(item => item.a === road.a && item.b === road.b)) continue;
    const field = end === "a" ? "to" : "from";
    const defaults = defaultJunctionMovements(next, node);
    const added = defaults.filter(move => move[field] === road[other]);
    const host = road[anchor];
    const legs = junctionLegs(next, id);
    const leg = legs.find(item => item.neighbor === host?.neighbor);
    const drop = end === "a" && leg && excessJunctionLanes(legs, leg, "incoming").includes(host.lane);
    const released = end === "a" && previous?.laneA && previous.a === id &&
      (previous.laneA.neighbor !== host?.neighbor || previous.laneA.lane !== host?.lane) ? previous.laneA : undefined;
    const existing = new Map(node.movements.map(move => [movementKey(move), move]));
    const kept = node.movements.filter(move => move[field] !== road[other] &&
      !(drop && move.from === host.neighbor && move.fromLane === host.lane));
    const movements = [...new Map([...kept, ...added.map(move => existing.get(movementKey(move)) ?? move)]
      .map(move => [movementKey(move), move])).values()];
    next = { ...next, nodes: next.nodes.map(item => item === node ? { ...item, movements } : item) };
    if (released) next = restoreReleasedLane(next, id, released);
  }
  return reconcileJunctionMovements(next);
}

export function connectNetworkRoad(network, road, replace = -1) {
  const nodes = networkNodes(network);
  const start = nodes.get(road.a), end = nodes.get(road.b);
  if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < 16) return { issue: "Choose a point farther away." };
  if (network.roads.some((other, index) => index !== replace &&
      (road.a === other.a && road.b === other.b || road.a === other.b && road.b === other.a))) {
    return { issue: "These nodes already share a road." };
  }
  const addedNodes = [...network.nodes];
  const cuts = [], otherCuts = new Map();
  const endpoint = (item, t) => t < 1e-6 ? nodes.get(item.a) : t > 1 - 1e-6 ? nodes.get(item.b) : undefined;
  for (const [index, other] of network.roads.entries()) {
    if (index === replace) continue;
    for (const hit of roadCrossings(road, other, nodes)) {
      if (hit.overlap) return { issue: "These roads overlap. Draw a different path." };
      const existing = endpoint(road, hit.t) ?? endpoint(other, hit.u) ??
        addedNodes.find(node => Math.hypot(node.x - hit.x, node.y - hit.y) < .1);
      const node = existing ?? nextNetworkNode({ nodes: addedNodes }, hit);
      if (!existing) addedNodes.push(node);
      if (!endpoint(road, hit.t) && !cuts.some(cut => cut.node.id === node.id)) cuts.push({ node, t: hit.t });
      if (!endpoint(other, hit.u)) {
        if (!otherCuts.has(index)) otherCuts.set(index, []);
        otherCuts.get(index).push({ node, t: hit.u });
      }
    }
  }
  const splits = [];
  const split = (item, hits) => {
    const parts = splitRoad(item, nodes, hits);
    if (parts.length > 1) splits.push([item, parts]);
    return parts;
  };
  const roads = network.roads.flatMap((other, i) => i === replace ? split(road, cuts) : split(other, otherCuts.get(i) ?? []));
  if (replace < 0) roads.push(...split(road, cuts));
  const next = splits.reduce((graph, [item, parts]) => remapSplitReferences(graph, item, parts), { nodes: addedNodes, roads });
  return checkNetworkEdit(next, network.roads);
}

function validNetwork(network) {
  if (network == null) return true;
  if (!Array.isArray(network.nodes) || !Array.isArray(network.roads) || network.nodes.length > 60 || network.roads.length > 90) return false;
  const ids = new Set(Object.keys(terminals));
  for (const node of network.nodes) {
    if (!node || !/^j\d+$/.test(node.id) || ids.has(node.id) ||
        !Number.isFinite(node.x) || !Number.isFinite(node.y) || networkNodeIssue(node) || !["priority", "allway_stop", "traffic_light", "yield"].includes(node.control)) return false;
    ids.add(node.id);
  }
  const validRoads = network.roads.every((road, index) => road && ids.has(road.a) && ids.has(road.b) &&
    [road.forward, road.backward].every(count => Number.isInteger(count) && count >= 0 && count <= 4) &&
    road.forward + road.backward > 0 && Number.isFinite(road.bend) && Math.abs(road.bend) <= 32 &&
    (road.laneShift === undefined || Number.isInteger(road.laneShift) && Math.abs(road.laneShift) <= maxLaneShift) &&
    (road.controls === undefined || Array.isArray(road.controls) && road.controls.length === 4 && road.controls.every(Number.isFinite)) &&
    [road.atA, road.atB].every(rule => rule === undefined || ["default", "priority", "yield", "stop"].includes(rule)) &&
    validLaneAnchor(road.laneA, road, true, network) && validLaneAnchor(road.laneB, road, false, network) &&
    !networkRoadIssue(network, road, index));
  return validRoads && network.nodes.every(node => {
    const legs = new Map(junctionLegs(network, node.id).map(leg => [leg.neighbor, leg]));
    if (node.laneRules !== undefined && (!node.laneRules || typeof node.laneRules !== "object" || Array.isArray(node.laneRules) ||
      !Object.entries(node.laneRules).every(([key, rule]) => validIncomingRule(key, rule, legs)))) return false;
    return node.movements === undefined || Array.isArray(node.movements) && node.movements.length <= 256 &&
      node.movements.every(movement => validMovement(movement, legs)) &&
      new Set(node.movements.map(movementKey)).size === node.movements.length;
  });
}
