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
    const curvature = (dx * ddy - dy * ddx) / Math.hypot(dx, dy) ** 3;
    const curvatureRadius = scale / Math.abs(curvature);
    radius = Math.min(radius, curvatureRadius);
    samples.push({ x, y, length, angle: Math.atan2(dy, dx), curvature });
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
  if (trip.from && trip.to) return [trip.from, trip.to];
  if (trip.origin === "cross") return [trip.from ?? "west", trip.destination ?? "east"];
  if (trip.origin === "southbound") return [trip.from ?? "north", trip.destination ?? "south"];
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

const terminal = (id, name, x, y, dx, dy) => ({ id, name, x, y, dx, dy });
const place = (name, x, y, w, h, color) => ({ name, x, y, w, h, color });

export const maps = {
  "school-pickup": { terminals, trees, buildings: siteFootprints },
  "four-way-backup": {
    terminals: {
      west: terminal("west", "Market West", 35, 352, -24, 0),
      east: terminal("east", "High Street", 468, 285, 24, 0),
      north: terminal("north", "Old Town", 200, 93, 0, -23),
      south: terminal("south", "Park Gate", 308, 596, 0, 24)
    },
    grass: "#e0d7bc", plots: "#ddd0ac", foliage: "#829364", water: "#b8c7b2",
    parcels: ["M24 121H162V271H24Z M305 112H469V231H333L298 156Z", "M40 428H234V560H40Z M347 381H468V566H347Z"],
    buildings: [place("Market Hall", 65, 218, 96, 54, "#bc7c61"), place("Old Town", 276, 139, 70, 54, "#b98f77"),
      place("High Street shops", 381, 350, 56, 92, "#b08963"), place("Park Pavilion", 114, 457, 61, 40, "#b9a17c")],
    trees: [[81, 125], [138, 159], [385, 163], [428, 193], [72, 458], [200, 498], [383, 507], [443, 495]]
  },
  "short-merge": {
    terminals: {
      north: terminal("north", "North Highway", 393, 99, 8, -23),
      west: terminal("west", "West Highway", 35, 216, -23, -3),
      south: terminal("south", "Ferry Terminal", 134, 584, 0, 24),
      east: terminal("east", "Cargo Yard", 458, 392, 24, 0)
    },
    grass: "#c4d1c4", plots: "#b6c5b3", foliage: "#6d897e", water: "#719aa0",
    parcels: ["M12 291H163V525H12Z M217 96H333V183H217Z", "M228 409H480V566H228Z"],
    waterPath: "M395 511 450 495 484 446H560V740H-25V622H100L166 605 249 586 317 564Z",
    buildings: [place("Ferry sheds", 57, 509, 51, 36, "#9a9f88"), place("Harbor Warehouse", 272, 435, 108, 43, "#8c9c94"),
      place("Cargo offices", 394, 440, 65, 34, "#a49278")],
    trees: [[63,315],[90,373],[99,441],[233,137],[275,151],[353,539],[408,512]]
  },
  "bus-bottleneck": {
    terminals: {
      west: terminal("west", "Bus Depot", 37, 441, -23, 0),
      north: terminal("north", "Rail Station", 400, 97, 0, -23),
      south: terminal("south", "South Estate", 397, 595, 0, 24),
      east: terminal("east", "Civic Center", 468, 370, 24, 0)
    },
    grass: "#d8d4c8", plots: "#c7c1ad", foliage: "#8e987f", water: "#a7b1ba",
    parcels: ["M23 115H279V242H23Z M28 286H160V385H28Z", "M291 118H368V277H291Z M242 454H357V594H242Z"],
    railPath: "M-20 138H225Q290 138 349 119T526 119",
    buildings: [place("Station concourse", 288, 151, 75, 58, "#a98076"), place("Depot garage", 47, 299, 93, 57, "#8e8f9c"),
      place("Civic Library", 298, 500, 59, 56, "#b1947c"), place("Station shops", 167, 193, 78, 38, "#b7a28d")],
    trees: [[68,172],[103,217],[146,248],[99,500],[118,541],[271,575],[457,498],[456,229]]
  },
  "cross-town-rush": {
    terminals: {
      west: terminal("west", "West Interchange", 31, 225, -23, 0),
      east: terminal("east", "East Interchange", 470, 430, 23, 0),
      north: terminal("north", "North District", 387, 91, 5, -23),
      south: terminal("south", "South District", 128, 593, -6, 23)
    },
    grass: "#ccd8cb", plots: "#bdcebe", foliage: "#6d9080", water: "#8fb2a6",
    parcels: ["M30 96H229V172H30Z M271 114H345V190H271Z", "M424 167H478V342H400Z M48 320H136V494H48Z", "M298 492H480V580H298Z"],
    buildings: [place("West Business Park", 66, 126, 92, 46, "#9e9e8c"), place("North District offices", 420, 208, 44, 69, "#a9948a"),
      place("South District offices", 60, 390, 57, 74, "#9e9693"), place("East Business Park", 315, 508, 105, 51, "#90a399")],
    trees: [[59,279],[82,295],[201,117],[305,169],[352,551],[448,548],[116,503],[59,553],[432,324]]
  }
};

export const levels = [
  { id: "school-pickup", name: "School Pickup", problem: "The pickup exit backs up at a stop sign.", goal: "Get more pickup trips through.",
    metric: "pickupFinished", accent: "#a2d8be" },
  { id: "four-way-backup", name: "Market Square", problem: "Four busy streets meet at an all-way stop.", goal: "Move more traffic through the square.",
    metric: "finished", accent: "#f1d38e" },
  { id: "short-merge", name: "Harbor Merge", problem: "Ferry and highway traffic share a short merge.", goal: "Get more vehicles onto the north highway.",
    metric: "northFinished", accent: "#a8cfe9" },
  { id: "bus-bottleneck", name: "Station Bottleneck", problem: "Buses detour through a tight service road.", goal: "Reduce bus delay.",
    metric: "busDelay", accent: "#d8bee5" },
  { id: "cross-town-rush", name: "Cross-Town Rush", problem: "Two heavy through routes share one signal.", goal: "Complete more trips across town.",
    metric: "finished", accent: "#edbd9d" }
];

export function levelStart(id) {
  if (!maps[id] || id === "school-pickup") {
    const network = starterNetwork();
    Object.assign(network.roads.at(-1), { controls: [396, 440, 270, 377], atB: "stop" });
    return { ...baseline, network };
  }
  const junction = (number, x, y, control = "priority") => ({ id: `j${number}`, x, y, control });
  const road = (a, b, options) => ({ a, b, forward: 1, backward: 1, bend: 0, ...options });
  let nodes, roads;
  if (id === "four-way-backup") {
    nodes = [junction(1, 257, 316, "allway_stop")];
    roads = [road("west", "j1", { controls: [115, 350, 184, 329] }),
      road("j1", "east", { controls: [335, 302, 394, 285] }),
      road("north", "j1", { controls: [198, 162, 227, 238] }),
      road("j1", "south", { controls: [288, 396, 309, 512] })];
  } else if (id === "short-merge") {
    nodes = [junction(1, 231, 272), junction(2, 311, 249)];
    roads = [
      road("west", "j1", { forward: 2, backward: 0, controls: [96, 215, 165, 278] }),
      road("south", "j1", { backward: 0, atB: "yield", controls: [148, 432, 141, 314] }),
      road("j1", "j2", { backward: 0, controls: [264, 260, 292, 258] }),
      road("j2", "north", { backward: 0, controls: [354, 229, 376, 166] }),
      road("j2", "east", { backward: 0, controls: [350, 268, 366, 393] })
    ];
  } else if (id === "bus-bottleneck") {
    nodes = [junction(1, 191, 441), junction(2, 264, 353), junction(3, 397, 344, "traffic_light")];
    nodes[1].laneRules = { "j1:0": "stop" };
    roads = [
      road("west", "j1"),
      road("j1", "j2", { controls: [240, 441, 219, 372] }),
      road("j2", "j3", { controls: [294, 337, 349, 344] }),
      road("j3", "north", { controls: [402, 263, 400, 183] }),
      road("south", "j3"),
      road("j3", "east")
    ];
  } else {
    nodes = [junction(1, 252, 323, "traffic_light"), junction(2, 134, 262), junction(3, 331, 176), junction(4, 175, 484), junction(5, 382, 404)];
    roads = [
      road("west", "j2"), road("j2", "j1"), road("j1", "j5"), road("j5", "east"),
      road("north", "j3"), road("j3", "j1"), road("j1", "j4"), road("j4", "south")
    ].map(road => ({ ...road, forward: 2, backward: 2 }));
  }
  return { ...baseline, network: { map: id, nodes, roads } };
}

export function levelTrips(id, design) {
  if (!maps[id] || id === "school-pickup") {
    const trips = scheduledTrips(design.road != null || design.network != null);
    if (id === "school-pickup") for (const trip of trips) {
      if (trip.origin === "ramp") trip.time = 18 + trip.pickupIndex * 2.45;
    }
    return trips.sort((a, b) => a.time - b.time || a.id - b.id);
  }
  const trips = [];
  const flow = (from, to, count, first, spacing, { kind = "car", origin = "cross" } = {}) => {
    for (let i = 0; i < count; i++) trips.push({ id: trips.length, from, to, time: first + i * spacing, kind, origin });
  };
  if (id === "four-way-backup") {
    flow("west", "south", 27, 3, 5.7);
    flow("south", "east", 29, 2, 5.4);
    flow("east", "north", 26, 4, 5.8);
    flow("north", "west", 27, 6, 5.6);
    flow("south", "north", 20, 6, 7.9);
    flow("east", "west", 15, 4, 10);
    flow("west", "east", 13, 2, 12);
  } else if (id === "short-merge") {
    flow("west", "north", 62, 3, 2.45);
    flow("south", "north", 36, 31, 3.15, { kind: "pickup", origin: "ramp" });
    flow("west", "east", 21, 13, 6.7);
    flow("south", "east", 11, 51, 8);
  } else if (id === "bus-bottleneck") {
    flow("west", "north", 16, 5, 9.2, { kind: "bus", origin: "outer" });
    flow("west", "east", 26, 9, 5);
    flow("south", "north", 36, 4, 4.4, { origin: "southbound" });
    flow("east", "south", 24, 8, 6.5);
    flow("north", "west", 20, 10, 7.8);
  } else {
    flow("west", "east", 45, 2, 3.65);
    flow("east", "west", 36, 5, 4.55);
    flow("north", "south", 45, 3, 3.6, { origin: "southbound" });
    flow("south", "north", 36, 6, 4.4, { origin: "southbound" });
  }
  return trips.sort((a, b) => a.time - b.time || a.id - b.id);
}

export function networkMap(network) {
  return Object.hasOwn(maps, network?.map) ? maps[network.map] : maps["school-pickup"];
}

export function networkTerminals(network) {
  return networkMap(network).terminals;
}

export function networkNodes(network) {
  return new Map([...Object.values(networkTerminals(network)), ...network.nodes].map(node => [node.id, node]));
}

export const movementKey = ({ from, to, fromLane, toLane }) => `${from}:${fromLane}>${to}:${toLane}`;
export const incomingLaneKey = (neighbor, lane) => `${neighbor}:${lane}`;
export const roadGrade = road => road.grade ?? 0;

export function roundaboutLoops(network) {
  const loops = new Map();
  for (const road of network.roads) {
    if (!road.roundabout) continue;
    if (!loops.has(road.roundabout)) loops.set(road.roundabout, []);
    loops.get(road.roundabout).push(road);
  }
  return loops;
}

export function networkNodeElevation(network, id) {
  if (networkTerminals(network)[id]) return 0;
  const node = network.nodes.find(n => n.id === id);
  if (Number.isFinite(node?.rampElevation)) return node.rampElevation;
  const connected = network.roads.filter(road => road.a === id || road.b === id);
  const hosts = connected.filter(road => !road.rampId);
  const attached = hosts.length ? hosts : connected;
  if (attached.length < 2) return 0;
  const grade = roadGrade(attached[0]);
  return attached.every(road => roadGrade(road) === grade) ? grade * 5.5 : 0;
}

export function roadElevationProfile(network, road, length) {
  if (road.rampHost && roadGrade(road)) {
    const { source,from,to } = road.rampHost;
    const nodes = networkNodes(network);
    if (nodes.has(source.a) && nodes.has(source.b)) {
      const full = networkRoadGeometry(source,nodes);
      const start = full.samples[Math.round(from * 100)].length, end = full.samples[Math.round(to * 100)].length;
      const elevation = roadElevationProfile(network,source,full.length);
      return distance => elevation(start + (end - start) * clamp(distance / length,0,1));
    }
  }
  if (road.rampId) {
    const z0 = road.rampProfile?.z0 ?? networkNodeElevation(network,road.a), z1 = road.rampProfile?.z1 ?? networkNodeElevation(network,road.b), z = roadGrade(road) * 5.5;
    const total = road.rampProfile?.length ?? length;
    const run = Math.min(52,total / 2);
    const smooth = t => { const u = clamp(t,0,1); return u * u * (3 - 2 * u); };
    return distance => {
      const d = (road.rampProfile?.offset ?? 0) + distance;
      return z + (z0 - z) * (1 - smooth(d/run)) + (z1 - z) * (1 - smooth((total-d)/run));
    };
  }
  if (!roadGrade(road)) return () => 0;
  const startsAtLevel = !!networkNodeElevation(network, road.a);
  const endsAtLevel = !!networkNodeElevation(network, road.b);
  const ramp = Math.min(52, length * .35);
  return distance => {
    const rise = clamp(Math.min(startsAtLevel ? length : distance, endsAtLevel ? length : length - distance) / ramp, 0, 1);
    return road.grade * 5.5 * rise * rise * (3 - 2 * rise);
  };
}

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
      slip: !!(road.rampId || road.laneA || road.laneB),
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
  const mergeOffsets = oneWayMergeOffsets(legs);
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
          toLane: from.arrivalAnchor?.lane ?? clamp(fromLane + (mergeOffsets.get(from) ??
            (to === through ? throughLaneDelta(from, to) : Math.max(0, to.outgoing - from.incoming))), 0, to.outgoing - 1),
          rule: from.rule
        };
        if ((exitingLanes.has(fromLane) && !to.departureAnchor) || !fitsLaneAnchors(move, from, to)) return undefined;
        return move;
      }).filter(Boolean));
  });
}

function oneWayMergeOffsets(legs) {
  if (legs.length !== 3 || legs.some(leg => leg.slip || leg.road.roundabout || leg.road.laneShift || leg.incoming && leg.outgoing)) return new Map();
  const exits = legs.filter(leg => leg.outgoing);
  if (exits.length !== 1) return new Map();
  const [exit] = exits;
  const feeders = legs.filter(leg => leg.incoming);
  if (feeders.reduce((count, feeder) => count + feeder.incoming, 0) > exit.outgoing) return new Map();
  // Lanes are numbered from the right edge. Allocate separate lanes when
  // the merge has enough room for both approaches side by side.
  const side = leg => Math.sin(leg.bearing - exit.bearing);
  feeders.sort((a, b) => side(b) - side(a));
  return new Map([[feeders[0], 0], [feeders[1], feeders[0].incoming]]);
}

function fitsLaneAnchors(move, from, to) {
  return (!from.arrivalAnchor || from.arrivalAnchor.neighbor === move.to && from.arrivalAnchor.lane === move.toLane) &&
    (!to.departureAnchor || to.departureAnchor.neighbor === move.from && to.departureAnchor.lane === move.fromLane);
}

function roadEndBearing(road, nodes, atA) {
  const { start, end, a, b } = road.rampCurve ? rampGeometry(road.rampCurve) : roadControlPoints(road, nodes);
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
  if (!anchor || roadGrade(road) && !road.rampId || road.roundabout || road.forward !== 1 || road.backward !== 0 || !Number.isInteger(anchor.lane) || anchor.lane < 0) return false;
  const host = network.roads.find(item => item !== road &&
    (item.a === (atA ? road.a : road.b) && item.b === anchor.neighbor ||
     item.b === (atA ? road.a : road.b) && item.a === anchor.neighbor));
  if (!host || host.rampId || host.laneA || host.laneB || roadGrade(host) && !road.rampId || host.roundabout) return false;
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
  if (road.rampCurve) return rampGeometry(road.rampCurve);
  const { start, a, b, end } = roadControlPoints(road, nodes);
  const geometry = cubic(start, a, b, end);
  return { ...geometry, speed: road.bend || road.controls ? geometry.speed : 12 };
}

export function roadLanePosition(pose, count, lane, shift = 0) {
  const offset = (count - lane - .5 + shift) * networkLaneWidth;
  return { ...pose, x: pose.x - Math.sin(pose.angle) * offset, y: pose.y + Math.cos(pose.angle) * offset };
}

function networkRoadEdgeSamples(road, geometry, side) {
  const distance = ((road.laneShift ?? 0) + (side === "right" ? road.forward : -road.backward)) * networkLaneWidth;
  return geometry.samples.map(point => offsetRoadPose(point, distance));
}

function offsetRoadPose(point, offset) {
  return { ...point, x: point.x - Math.sin(point.angle) * offset, y: point.y + Math.cos(point.angle) * offset };
}

// The visible lane ports sit back from the junction for easier tapping. The
// actual lane joins sit at the junction and carry the host lane's travel heading.
export function laneAnchoredCurve(road, network, nodes, geometry = networkRoadGeometry(road, nodes)) {
  if (road.rampCurve) return geometry;
  if (!road.laneA && !road.laneB) return;
  const shift = road.laneShift ?? 0;
  const endpoint = (atStart, anchor) => {
    const pose = atStart ? geometry.samples[0] : geometry.samples.at(-1);
    const nominal = roadLanePosition(pose, 1, 0, shift);
    const id = atStart ? road.a : road.b;
    const leg = anchor && junctionLegs(network, id, nodes).find(item => !item.slip && item.neighbor === anchor.neighbor);
    return leg ? junctionLanePose(leg, nodes, atStart ? "incoming" : "outgoing", anchor.lane) : nominal;
  };
  const start = endpoint(true, road.laneA), end = endpoint(false, road.laneB);
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (chord < 1) return;
  const arm = (start, center, control, direction, anchored) => {
    const dx = Math.cos(start.angle) * direction, dy = Math.sin(start.angle) * direction;
    const reach = anchored ? (control.x - center.x) * dx + (control.y - center.y) * dy :
      Math.hypot(control.x - center.x, control.y - center.y);
    const length = clamp(reach > 1 ? reach : chord * .46, chord * .17, chord * .82);
    return { x: start.x + dx * length, y: start.y + dy * length };
  };
  return cubic(start, arm(start, geometry.start, geometry.a, 1, road.laneA),
    arm(end, geometry.end, geometry.b, -1, road.laneB), end);
}

export function curveHandleControls(road, network, nodes, handle, point, allowAngle = false) {
  const graph = networkRoadGeometry(road, nodes);
  const lane = laneAnchoredCurve(road, network, nodes, graph);
  const shown = lane ?? graph;
  const anchor = handle === 0 ? shown.start : shown.end;
  const tip = handle === 0 ? shown.a : shown.b;
  const fixed = !!lane || !allowAngle;
  const angle = fixed ? Math.atan2(tip.y - anchor.y, tip.x - anchor.x) : Math.atan2(point.y - anchor.y, point.x - anchor.x);
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const length = Math.hypot(shown.end.x - shown.start.x, shown.end.y - shown.start.y);
  const reach = clamp((point.x - anchor.x) * dx + (point.y - anchor.y) * dy, length * .17, length * .82);
  const base = handle === 0 ? graph.start : graph.end;
  const controls = [graph.a.x, graph.a.y, graph.b.x, graph.b.y];
  controls[handle * 2] = base.x + dx * reach;
  controls[handle * 2 + 1] = base.y + dy * reach;
  return controls;
}

export function trafficShapeSamples(samples) {
  if (samples.length < 3) return samples;
  const selected = [samples[0]];
  for (let index = 1; index < samples.length - 1; index++) {
    const from = selected.at(-1), current = samples[index], next = samples[index + 1];
    const dx = next.x - from.x, dy = next.y - from.y;
    const error = Math.abs(dx * (current.y - from.y) - dy * (current.x - from.x)) / (Math.hypot(dx, dy) || 1);
    if (error >= .055 || Math.abs(Math.sin(current.angle - from.angle)) >= .047 || Math.hypot(dx, dy) > 12) {
      selected.push(current);
    }
  }
  selected.push(samples.at(-1));
  return selected;
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
  const anchored = forward && laneAnchoredCurve(road, network, nodes, geometry);
  if (anchored) return anchored.samples;
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
  const points = path.map(p => {
    if (!mergeOffset) return roadLanePosition(p, count, lane, shift);
    const remaining = forward ? geometry.length - p.length : p.length;
    const t = 1 - clamp(remaining / reach, 0, 1);
    return roadLanePosition(p, count, lane + mergeOffset * t * t * (3 - 2 * t), shift);
  });
  if (mergeOffset) {
    let length = 0;
    for (const [index, point] of points.entries()) {
      const previous = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)];
      if (index) length += Math.hypot(point.x - previous.x, point.y - previous.y) * scale;
      point.angle = Math.atan2(next.y - previous.y, next.x - previous.x);
      point.length = forward ? length : geometry.length - length;
    }
  }
  return points;
}

export function networkMergeSamples(network, from, to, nodes, fromLane, toLane) {
  const lane = (leg, forward, index) => networkLaneSamples(leg.road, network, nodes, forward, index);
  const arrival = lane(from, !from.atA, fromLane);
  const departure = lane(to, to.atA, toLane);
  const approach = (points, end) => {
    const tip = end ? points.at(-1) : points[0];
    const span = Math.abs(points.at(-1).length - points[0].length);
    const setback = Math.min(span * .25, networkLaneWidth * scale);
    return (end ? [...points].reverse() : points).find(point => Math.abs(point.length - tip.length) >= setback) ?? tip;
  };
  const start = approach(arrival, true), end = approach(departure, false);
  const length = Math.hypot(end.x - start.x, end.y - start.y) / 3;
  const handle = (point, shift) => ({
    x: point.x + Math.cos(point.angle) * shift, y: point.y + Math.sin(point.angle) * shift
  });
  return trafficShapeSamples(cubic(start, handle(start, length), handle(end, -length), end).samples);
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

function footprintAt(point, clearance, network) {
  const { x, y } = point;
  const { buildings, trees: mapTrees } = networkMap(network);
  const building = buildings.find(site =>
    Math.hypot(Math.max(site.x - x, 0, x - site.x - site.w), Math.max(site.y - y, 0, y - site.y - site.h)) < clearance);
  if (building) return building.name;
  if (mapTrees.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < clearance + 6)) return "a tree";
}

export function networkNodeIssue(point, network) {
  const obstacle = footprintAt(point, 2, network);
  if (obstacle) return `This junction would overlap ${obstacle}.`;
  if (point.x < 8 || point.x > 492 || point.y < 68 || point.y > 622) return "Keep junctions inside the map.";
}

export function networkRoadIssue(network, road, ignore = -1, checkElevation = true) {
  const nodes = networkNodes(network);
  const start = nodes.get(road.a), end = nodes.get(road.b);
  if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < (road.rampId ? 3 : 16)) return "Choose a point farther away.";
  const geometry = networkRoadGeometry(road, nodes);
  const { samples, speed } = geometry;
  const laneCurve = laneAnchoredCurve(road, network, nodes, geometry);
  if (!Number.isFinite(laneCurve?.speed ?? speed)) return "Keep the curve handles clear of their endpoints.";
  const clearance = (laneCurve ? 1 : road.forward + road.backward) * networkLaneWidth / 2 + 2;
  const offset = ((road.laneShift ?? 0) + (road.forward - road.backward) / 2) * networkLaneWidth;
  for (const point of laneCurve?.samples ?? samples) {
    const center = laneCurve ? point : { x: point.x - Math.sin(point.angle) * offset, y: point.y + Math.cos(point.angle) * offset };
    const obstacle = footprintAt(center, clearance, network);
    if (obstacle) return `This road would cross ${obstacle}.`;
    if (center.x < 8 + (road.rampId ? clearance - 2 : 0) || center.x > 492 - (road.rampId ? clearance - 2 : 0) || center.y < 68 + (road.rampId ? clearance - 2 : 0) || center.y > 622 - (road.rampId ? clearance - 2 : 0)) return "Keep roads inside the map.";
  }
  for (const [index, other] of network.roads.entries()) {
    if (index === ignore) continue;
    if ([other.a, other.b].every(id => id === road.a || id === road.b)) return "These nodes already share a road.";
    const sameLevel = roadGrade(road) === roadGrade(other);
    if (!sameLevel && !checkElevation) continue;
    const crossings = roadCrossings(road, other, nodes);
    if (!crossings.length) continue;
    if (sameLevel) return "Roads must meet at a shared junction.";
    const crossing = networkRoadGeometry(other, nodes);
    const height = roadElevationProfile(network, road, geometry.length);
    const otherHeight = roadElevationProfile(network, other, crossing.length);
    const distanceAt = (path, t) => {
      const i = t * (path.samples.length - 1);
      const before = path.samples[Math.floor(i)].length, after = path.samples[Math.ceil(i)].length;
      return before + (after - before) * (i % 1);
    };
    if (crossings.some(hit => hit.overlap || Math.abs(height(distanceAt(geometry, hit.t)) - otherHeight(distanceAt(crossing, hit.u))) < 4.5)) {
      return "Give the ramps more room on both sides of the crossing.";
    }
  }
}

export function roadShapeIssue(network, road, nodes) {
  if (!road.rampCurve && !road.controls && !road.bend && !road.laneShift && !road.laneA && !road.laneB) return;
  const geometry = networkRoadGeometry(road, nodes);
  const lane = laneAnchoredCurve(road, network, nodes, geometry);
  const shift = road.laneShift ?? 0;
  const insideRight = lane ? networkLaneWidth / 2 : Math.max(0, road.forward + shift) * networkLaneWidth;
  const insideLeft = lane ? networkLaneWidth / 2 : Math.max(0, road.backward - shift) * networkLaneWidth;
  if ((lane ?? geometry).samples.some(point => !Number.isFinite(point.curvature) ||
      (point.curvature > 0 ? insideRight : insideLeft) * Math.abs(point.curvature) >= .92)) {
    return "This bend is too tight for its lanes. Widen the curve or use fewer lanes.";
  }
}

export function roadSurfaceSamples(road, network, nodes, geometry = networkRoadGeometry(road, nodes)) {
  const lane = laneAnchoredCurve(road, network, nodes, geometry);
  const edge = (side, count, forward) => {
    if (lane) return lane.samples.map(point => offsetRoadPose(point, (forward ? 1 : -1) * networkLaneWidth / 2));
    if (!count) return networkRoadEdgeSamples(road, geometry, side);
    const samples = networkLaneSamples(road, network, nodes, forward, 0, geometry);
    return (forward ? samples : [...samples].reverse()).map(point => offsetRoadPose(point, networkLaneWidth / 2));
  };
  const left = edge("left", road.backward, false);
  const right = edge("right", road.forward, true);
  return { left, right, geometry: lane ?? geometry };
}

function roadCrossings(road, other, nodes) {
  const first = networkRoadGeometry(road, nodes);
  const second = networkRoadGeometry(other, nodes);
  const controls = curve => curve.samples;
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
      if (shared.some(node => Math.hypot(node.x - x, node.y - y) < (road.rampId || other.rampId ? networkLaneWidth * 2 : .1)) ||
          hits.some(hit => Math.hypot(hit.x - x, hit.y - y) < .1)) continue;
      hits.push({ x, y, t: (i - 1 + t) / (samples.length - 1), u: (j - 1 + u) / (otherSamples.length - 1) });
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
  if (road.rampCurve) return splitRampCurve(road, cuts);
  const geometry = networkRoadGeometry(road, nodes);
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  let [p0, p1, p2, p3] = [geometry.start, geometry.a, geometry.b, geometry.end];
  let previous = { node: nodes.get(road.a), t: 0 };
  const parts = [];
  const part = (a, b, c1, c2, first, last) => ({
    a: a.id, b: b.id, forward: road.forward, backward: road.backward, bend: 0,
    ...(roadGrade(road) ? { grade: road.grade } : {}),
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
  if (road.rampHost) {
    const { source, from, to } = road.rampHost;
    const stations = [from, ...cuts.map(cut => from + cut.t * (to - from)), to];
    parts.forEach((item, i) => { item.rampHost = { source, from: stations[i], to: stations[i + 1] }; });
  }
  return parts;
}

export function splitNetworkRoad(network, index, node, t) {
  if (network.roads[index].rampId) return { issue: "Edit this ramp using its lane endpoints and curve handle." };
  if (network.roads[index].roundabout) return { issue: "Connect at an existing roundabout entry." };
  const nodes = networkNodes(network);
  const parts = splitRoad(network.roads[index], nodes, [{ node, t }]);
  const roads = network.roads.flatMap((road, i) => i === index ? parts : road);
  return checkNetworkEdit(remapSplitReferences({ ...network, nodes: [...network.nodes, node], roads }, network.roads[index], parts), network.roads);
}

function draftedRoad(points, index, anchored, lanes, controls, grade) {
  const a = points[index], b = points[index + 1];
  return { a: a.id, b: b.id, ...(anchored ? { forward: 1, backward: 0 } : lanes), bend: 0,
    ...(grade ? { grade } : {}),
    ...(a.anchor ? { laneA: a.anchor } : {}), ...(b.anchor ? { laneB: b.anchor } : {}),
    ...(controls[index] ? { controls: controls[index] } : {}) };
}

export function previewRoadDraft(network, points, lanes, controls, grade = 0) {
  const resolved = points.map((point, index) => point.id ? point : { ...point, id: `preview-${index}`, control: "priority" });
  const graph = { ...network, nodes: [...network.nodes, ...resolved.filter(point => point.id.startsWith("preview-"))] };
  const nodes = networkNodes(graph);
  const anchored = points.some(point => point.anchor);
  const roads = resolved.slice(1).map((_, index) => draftedRoad(resolved, index, anchored, lanes, controls, grade));
  graph.roads = [...network.roads, ...roads];
  return { graph, nodes, roads, issue: roads.map(road => roadShapeIssue(graph, road, nodes)).find(Boolean) };
}

export function commitRoadDraft(network, points, lanes, controls, grade = 0) {
  if (grade && points.some(point => point.anchor)) return { issue: "Start elevated and tunnel roads from a junction or a free point." };
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
    const issue = networkNodeIssue(point, network);
    if (issue) return { issue };
    const node = nextNetworkNode({ nodes: added }, point);
    added.push(node);
    anchors.push(node);
    if (point.index !== undefined) {
      if (network.roads[point.index].roundabout) return { issue: "Connect at an existing roundabout entry." };
      if (!cuts.has(point.index)) cuts.set(point.index, []);
      cuts.get(point.index).push({ node, t: point.t });
    }
  }
  const splits = new Map([...cuts].map(([index, hits]) => [network.roads[index], splitRoad(network.roads[index], originalNodes, hits)]));
  const anchorHosts = new Map();
  let next = { ...network, nodes: added, roads: network.roads.flatMap(road => splits.get(road) ?? [road]) };
  for (const [road, parts] of splits) {
    anchorHosts.set(`${road.a}:${road.b}`, parts[0].b);
    anchorHosts.set(`${road.b}:${road.a}`, parts.at(-1).a);
    next = remapSplitReferences(next, road, parts);
  }
  const anchored = points.some(point => point.anchor);
  for (let index = 0; index < anchors.length - 1; index++) {
    const a = anchors[index], b = anchors[index + 1];
    const road = draftedRoad(anchors, index, anchored, lanes, controls, grade);
    for (const [point, atStart, key] of [[a, true, "laneA"], [b, false, "laneB"]]) {
      if (!point.anchor) continue;
      const lookup = `${point.id}:${point.anchor.neighbor}`;
      const neighbor = anchorHosts.get(lookup) ?? point.anchor.neighbor;
      road[key] = { ...point.anchor, neighbor };
      if (!validLaneAnchor(road[key], road, atStart, next)) return { issue: "Choose a lane flowing in the right direction." };
    }
    const result = connectNetworkRoad(next, road, -1, { checkElevation: false });
    if (!result.network) return result;
    next = road.laneA || road.laneB ? refreshLaneConnections(result.network, road) : result.network;
  }
  const result = checkNetworkEdit(next, network.roads);
  if (result.network) {
    const nodes = networkNodes(next);
    const issue = next.roads.filter(road => !network.roads.includes(road)).map(road => roadShapeIssue(next, road, nodes)).find(Boolean);
    if (issue) return { issue };
  }
  return result.network ? { network: result.network, last: anchors.at(-1) } : result;
}

export function editNetworkCurve(network, index, controls) {
  if (network.roads[index].rampId) return { issue: "Edit this ramp using its lane endpoints and curve handle." };
  if (network.roads[index].roundabout) return { issue: "The roundabout uses a circular lane." };
  const road = { ...network.roads[index], controls, bend: 0 };
  const issue = roadShapeIssue(network, road, networkNodes(network));
  return issue ? { issue } : connectNetworkRoad(network, road, index);
}

export function slideJoinOptions(network, index, end, nodes = networkNodes(network)) {
  const road = network.roads[index];
  const id = road?.[end];
  if (!id || networkTerminals(network)[id] || (end === "a" ? !road.laneA : !road.laneB)) return;
  const legs = junctionLegs(network, id, nodes).filter(leg => leg.road !== road);
  if (legs.length !== 2 || legs.some(leg => leg.slip) || Math.cos(legs[0].bearing - legs[1].bearing) > -.72) return;
  return { road, node: nodes.get(id), legs };
}

export function roadJoinDraft(network, index, end, point) {
  const nodes = networkNodes(network);
  const options = slideJoinOptions(network, index, end, nodes);
  if (!options) return network;
  const { road, node, legs } = options;
  let best, nearest = Math.hypot(point.x - node.x, point.y - node.y);
  for (const leg of legs) {
    const path = networkRoadGeometry(leg.road, nodes);
    for (const [sample, pose] of path.samples.entries()) {
      if (Math.abs(pose.length - (leg.atA ? path.length : 0)) < 18 * scale) continue;
      const gap = Math.hypot(point.x - pose.x, point.y - pose.y);
      if (gap >= nearest) continue;
      nearest = gap;
      best = { leg, pose, t: sample / (path.samples.length - 1) };
    }
  }
  if (!best || Math.hypot(best.pose.x - node.x, best.pose.y - node.y) < .9) return network;
  const moved = { ...node, x: best.pose.x, y: best.pose.y };
  const chosen = best.leg.road;
  const split = splitRoad(chosen, nodes, [{ node: moved, t: best.t }]);
  const shortened = best.leg.atA ? split[1] : split[0];
  const extended = legs.find(leg => leg.road !== chosen);
  const away = best.pose.angle + (best.leg.atA ? Math.PI : 0);
  const update = item => {
    if (item === chosen) return { ...item, controls: shortened.controls, bend: shortened.bend };
    const geometry = networkRoadGeometry(item, nodes);
    const atStart = item.a === node.id;
    const near = atStart ? geometry.a : geometry.b;
    const far = atStart ? geometry.end : geometry.start;
    let control = { x: near.x + moved.x - node.x, y: near.y + moved.y - node.y };
    if (item === extended.road) {
      const size = Math.hypot(far.x - moved.x, far.y - moved.y) / 3;
      control = { x: moved.x + Math.cos(away) * size, y: moved.y + Math.sin(away) * size };
    }
    const [a, b] = atStart ? [control, geometry.b] : [geometry.a, control];
    return { ...item, controls: [a.x, a.y, b.x, b.y], bend: 0 };
  };
  return { ...network, nodes: network.nodes.map(item => item === node ? moved : item),
    roads: network.roads.map(item => item === road || legs.some(leg => item === leg.road) ? update(item) : item) };
}

export function applyRoadJoin(network, next) {
  const result = checkNetworkEdit(next, network.roads);
  if (!result.network || next === network) return result;
  const nodes = networkNodes(next);
  const issue = next.roads.filter(road => !network.roads.includes(road)).map(road => roadShapeIssue(next, road, nodes)).find(Boolean);
  return issue ? { issue } : result;
}

export function shiftNetworkRoad(network, index, laneShift) {
  const road = network.roads[index];
  if (!road || laneShift === (road.laneShift ?? 0)) return { network };
  if (road.roundabout) return { issue: "The roundabout uses a circular lane." };
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
  const shapeIssue = roadShapeIssue(next, shifted, nodes);
  if (shapeIssue) return { issue: shapeIssue };
  const offset = (pose, shift) => ({
      x: pose.x - Math.sin(pose.angle) * shift * networkLaneWidth,
      y: pose.y + Math.cos(pose.angle) * shift * networkLaneWidth
  });
  const shape = item => {
    const curve = laneAnchoredCurve(item, next, nodes);
    return curve ? curve.samples.filter((_, i) => i % 2 === 0) :
      networkRoadGeometry(item, nodes).samples.filter((_, i) => i % 2 === 0)
        .map(pose => offset(pose, (item.laneShift ?? 0) + (item.forward - item.backward) / 2));
  };
  const before = shape(road);
  const after = shape(shifted);
  for (const other of next.roads) {
    if (other === shifted || roadGrade(other) !== roadGrade(road) || [other.a, other.b].some(id => id === road.a || id === road.b)) continue;
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
  const issue = targetId ? undefined : networkNodeIssue(target, network);
  if (issue) return { issue };
  const attached = network.roads.filter(road => road.a === id || road.b === id);
  if (attached.some(road => road.roundabout) || network.roads[roadTarget?.index]?.roundabout) return { issue: "Connect at an existing roundabout entry." };
  const movedAnchorIds = road => {
    if (!targetId) return road;
    return {
      ...road,
      ...(road.laneA?.neighbor === id ? { laneA: { ...road.laneA, neighbor: targetId } } : {}),
      ...(road.laneB?.neighbor === id ? { laneB: { ...road.laneB, neighbor: targetId } } : {})
    };
  };
  let next = {
    ...network,
    nodes: network.nodes.flatMap(item => item.id !== id ? [item] : targetId ? [] : [{ ...node, x: target.x, y: target.y }]),
    roads: network.roads.filter(road => !attached.includes(road))
  };
  if (roadTarget) {
    const road = network.roads[roadTarget.index];
    const parts = splitRoad(road, networkNodes(network), [{ node: { ...node, ...point }, t: roadTarget.t }]);
    next.roads = next.roads.flatMap(item => item === road ? parts : item);
    next = remapSplitReferences(next, road, parts);
    const result = checkNetworkEdit(next, network.roads, false);
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
    const result = connectNetworkRoad(next, moved, -1, { checkElevation: false });
    if (result.issue) return result;
    next = result.network;
  }
  return checkNetworkEdit(next, network.roads);
}

function checkNetworkEdit(network, previousRoads, checkElevation = true) {
  if (network.nodes.length > 60 || network.roads.length > 90) return { issue: "This map is full." };
  for (const [index, road] of network.roads.entries()) {
    if (previousRoads.includes(road) && (!checkElevation || !roadGrade(road))) continue;
    const issue = networkRoadIssue(network, road, index, checkElevation);
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
    const issue = networkNodeIssue(target, network);
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
  const shapeIssue = roadShapeIssue(result.network, moved, networkNodes(result.network));
  if (shapeIssue) return { issue: shapeIssue };
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

function excludingRoads(network, removed) {
  const rings = new Set(removed.flatMap(road => road.roundabout ? [road.roundabout] : []));
  const next = { ...network, roads: network.roads.filter(road => !removed.includes(road) && !rings.has(road.roundabout)) };
  return removed.reduce((graph, road) => road.laneA ? restoreReleasedLane(graph, road.a, road.laneA) : graph, next);
}

export function removeNetworkRoad(network, index) {
  const road = network.roads[index];
  if (!road) return network;
  if (road.rampId) return removeRamp(network, road.rampId);
  return excludingRoads(network, [road]);
}

export function removeNetworkNode(network, id) {
  const roads = network.roads.filter(road => road.a === id || road.b === id);
  const next = excludingRoads(network, roads);
  return checkNetworkEdit({ ...next, nodes: next.nodes.filter(node => node.id !== id) }, network.roads);
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

export function connectNetworkRoad(network, road, replace = -1, { checkElevation = true } = {}) {
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
    if (index === replace || roadGrade(road) !== roadGrade(other)) continue;
    for (const hit of roadCrossings(road, other, nodes)) {
      if (hit.overlap) return { issue: "These roads overlap. Draw a different path." };
      if (other.roundabout && !endpoint(other, hit.u)) return { issue: "Connect at an existing roundabout entry." };
      const existing = endpoint(road, hit.t) ?? endpoint(other, hit.u) ??
        cuts.find(({ node }) => Math.hypot(node.x - hit.x, node.y - hit.y) < .1)?.node;
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
  const next = splits.reduce((graph, [item, parts]) => remapSplitReferences(graph, item, parts), { ...network, nodes: addedNodes, roads });
  return checkNetworkEdit(next, network.roads, checkElevation);
}

export function setNetworkRoadGrade(network, index, grade) {
  const road = network.roads[index];
  if (!road || ![-1, 0, 1].includes(grade)) return { issue: "Choose a road and an elevation." };
  if (roadGrade(road) === grade) return { network };
  if (road.roundabout || road.laneA || road.laneB || network.roads.some(item =>
    item.a === road.a && item.laneA?.neighbor === road.b || item.b === road.a && item.laneB?.neighbor === road.b ||
    item.a === road.b && item.laneA?.neighbor === road.a || item.b === road.b && item.laneB?.neighbor === road.a)) {
    return { issue: "Use a road with junction endpoints and no lane attachments." };
  }
  return connectNetworkRoad(network, { ...road, grade: grade || undefined }, index);
}

export function junctionCrossingAxes(network, id) {
  const legs = junctionLegs(network, id);
  if (legs.length !== 4 || legs.some(leg => leg.slip || roadGrade(leg.road) || leg.road.roundabout)) return [];
  const sorted = [...legs].sort((a, b) => a.bearing - b.bearing);
  const axes = [[sorted[0], sorted[2]], [sorted[1], sorted[3]]];
  return axes.every(([a, b]) => Math.cos(a.bearing - b.bearing) < -.62) ? axes : [];
}

export function separateNetworkJunction(network, id, neighbor, grade) {
  const axes = junctionCrossingAxes(network, id);
  if (axes.length !== 2 || !axes.flat().some(leg => leg.neighbor === neighbor) || ![-1, 1].includes(grade)) {
    return { issue: "Choose a four-way junction with two through roads." };
  }
  if (axes.some(([a, b]) => a.incoming !== b.outgoing || a.outgoing !== b.incoming || a.road.laneShift || b.road.laneShift)) {
    return { issue: "Match the lane counts and center the segments on each through road." };
  }
  const nodes = networkNodes(network);
  const legs = axes.flat();
  let next = { ...network, nodes: network.nodes.filter(node => node.id !== id),
    roads: network.roads.filter(road => !legs.some(leg => leg.road === road)) };
  const joined = axes.map(([a, b]) => {
    const from = networkRoadGeometry(a.road, nodes), to = networkRoadGeometry(b.road, nodes);
    const chord = Math.hypot(from.start.x - from.end.x, from.start.y - from.end.y) +
      Math.hypot(to.start.x - to.end.x, to.start.y - to.end.y);
    const handle = (geometry, atA) => {
      const tip = atA ? geometry.end : geometry.start;
      const control = atA ? geometry.b : geometry.a;
      const reach = chord / (3 * Math.hypot(tip.x - control.x, tip.y - control.y));
      return [tip.x + (control.x - tip.x) * reach, tip.y + (control.y - tip.y) * reach];
    };
    next = remapJunctionNeighbor(next, a.neighbor, id, b.neighbor);
    next = remapJunctionNeighbor(next, b.neighbor, id, a.neighbor);
    return { a: a.neighbor, b: b.neighbor, forward: a.incoming, backward: a.outgoing, bend: 0,
      controls: [...handle(from, a.atA), ...handle(to, b.atA)],
      atA: a.atA ? a.road.atB : a.road.atA, atB: b.atA ? b.road.atB : b.road.atA,
      ...(a.neighbor === neighbor || b.neighbor === neighbor ? { grade } : {}) };
  });
  if (!roadCrossings(joined[0], joined[1], nodes).length) return { issue: "Align both through roads to meet at the crossing." };
  return applyRoadJoin(network, { ...next, roads: [...next.roads, ...joined] });
}

export function buildNetworkRoundabout(network, id, radius = 34) {
  const nodes = networkNodes(network);
  const center = nodes.get(id);
  const legs = junctionLegs(network, id, nodes);
  if (!center?.control || legs.length < 3 || legs.length > 5 || legs.some(leg => leg.slip || roadGrade(leg.road) || leg.road.roundabout)) {
    return { issue: "Choose a surface junction with three to five approaches." };
  }
  if (![26, 34, 42].includes(radius)) return { issue: "Choose a roundabout size." };
  const nextNodes = [...network.nodes];
  const entries = [];
  for (const leg of legs) {
    const geometry = networkRoadGeometry(leg.road, nodes);
    const samples = leg.atA ? geometry.samples : [...geometry.samples].reverse();
    const distance = point => Math.hypot(point.x - center.x, point.y - center.y);
    const index = samples.findIndex(point => distance(point) >= radius);
    if (index < 1 || distance(samples.at(-1)) < radius + 17) return { issue: "Use a smaller roundabout or give the approaches more room." };
    const before = samples[index - 1], after = samples[index];
    const fraction = (radius - distance(before)) / (distance(after) - distance(before));
    const angle = Math.atan2(before.y + (after.y - before.y) * fraction - center.y, before.x + (after.x - before.x) * fraction - center.x);
    const point = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    const issue = networkNodeIssue(point, network);
    if (issue) return { issue };
    const node = nextNetworkNode({ nodes: nextNodes }, point);
    nextNodes.push(node);
    const parameter = (index - 1 + fraction) / (samples.length - 1);
    const parts = splitRoad(leg.road, nodes, [{ node, t: leg.atA ? parameter : 1 - parameter }]);
    entries.push({ node, angle, leg, approach: parts[leg.atA ? 1 : 0] });
  }
  entries.sort((a, b) => b.angle - a.angle);
  const usedLoops = roundaboutLoops(network);
  let number = 1;
  while (usedLoops.has(`r${number}`)) number++;
  const ring = [];
  for (const [index, a] of entries.entries()) {
    const b = entries[(index + 1) % entries.length];
    const arc = (a.angle - b.angle + 2 * Math.PI) % (2 * Math.PI);
    if (arc < .42 || arc > Math.PI) return { issue: "Spread the approaches around the roundabout." };
    const handle = 4 * radius / 3 * Math.tan(arc / 4);
    ring.push({ a: a.node.id, b: b.node.id, forward: 1, backward: 0, bend: 0, roundabout: `r${number}`,
      controls: [a.node.x + handle * Math.sin(a.angle), a.node.y - handle * Math.cos(a.angle),
        b.node.x - handle * Math.sin(b.angle), b.node.y + handle * Math.cos(b.angle)] });
  }
  const byRoad = new Map(entries.map(entry => [entry.leg.road, entry.approach]));
  let next = { ...network, nodes: nextNodes.filter(node => node !== center),
    roads: [...network.roads.map(road => byRoad.get(road) ?? road), ...ring] };
  for (const { leg, node } of entries) next = remapJunctionNeighbor(next, leg.neighbor, id, node.id);
  return applyRoadJoin(network, next);
}

function validNetwork(network) {
  if (network == null) return true;
  if (!Array.isArray(network.nodes) || !Array.isArray(network.roads) || network.nodes.length > 60 || network.roads.length > 90) return false;
  if (network.map !== undefined && !Object.hasOwn(maps, network.map)) return false;
  const ids = new Set(Object.keys(networkTerminals(network)));
  for (const node of network.nodes) {
    if (!node || !/^j\d+$/.test(node.id) || ids.has(node.id) ||
        !Number.isFinite(node.x) || !Number.isFinite(node.y) || networkNodeIssue(node, network) || !["priority", "allway_stop", "traffic_light", "yield"].includes(node.control)) return false;
    ids.add(node.id);
  }
  if (network.ramps !== undefined && (!network.ramps || typeof network.ramps !== 'object' || Array.isArray(network.ramps))) return false;
  const targetSchema = p => p && p.host && ids.has(p.host.a) && ids.has(p.host.b) && p.host.a !== p.host.b &&
    Number.isFinite(p.t) && p.t >= 0 && p.t <= 1 && typeof p.forward === 'boolean' && Number.isInteger(p.lane) && p.lane >= 0 && p.lane < 4;
  for (const [id,draft] of Object.entries(network.ramps ?? {})) {
    if (!/^ramp\d+$/.test(id) || !draft || !targetSchema(draft.start) || !targetSchema(draft.end) ||
        !['loop','direct'].includes(draft.shape) || ![-1,0,1].includes(draft.grade)) return false;
    const parts = network.roads.filter(r => r?.rampId === id);
    if (parts.filter(r => r.laneA).length !== 1 || parts.filter(r => r.laneB).length !== 1) return false;
  }
  const validRoads = network.roads.every(road => road && ids.has(road.a) && ids.has(road.b) &&
    (road.rampId === undefined ? road.rampCurve === undefined : Object.hasOwn(network.ramps ?? {},road.rampId) &&
      road.forward === 1 && road.backward === 0 && Array.isArray(road.rampCurve) && road.rampCurve.length > 0 && road.rampCurve.length <= 12 &&
      road.rampCurve.every(span => Array.isArray(span) && span.length === 8 && span.every(Number.isFinite))) &&
    (road.rampHost === undefined || road.rampHost && road.rampHost.source && !road.rampHost.source.rampHost &&
      ids.has(road.rampHost.source.a) && ids.has(road.rampHost.source.b) && Number.isFinite(road.rampHost.from) && Number.isFinite(road.rampHost.to) &&
      road.rampHost.from >= 0 && road.rampHost.from < road.rampHost.to && road.rampHost.to <= 1) &&
    [road.forward, road.backward].every(count => Number.isInteger(count) && count >= 0 && count <= 4) &&
    road.forward + road.backward > 0 && Number.isFinite(road.bend) && Math.abs(road.bend) <= 32 &&
    [-1, 0, 1].includes(roadGrade(road)) &&
    (road.roundabout === undefined || /^r\d+$/.test(road.roundabout) && road.forward === 1 && road.backward === 0 && !roadGrade(road)) &&
    (road.laneShift === undefined || Number.isInteger(road.laneShift) && Math.abs(road.laneShift) <= maxLaneShift) &&
    (road.controls === undefined || Array.isArray(road.controls) && road.controls.length === 4 && road.controls.every(Number.isFinite)) &&
    [road.atA, road.atB].every(rule => rule === undefined || ["default", "priority", "yield", "stop"].includes(rule)));
  return validRoads && network.roads.every((road, index) => validLaneAnchor(road.laneA, road, true, network) &&
    validLaneAnchor(road.laneB, road, false, network) && !networkRoadIssue(network, road, index)) && [...roundaboutLoops(network).values()].every(roads => {
    const following = new Map(roads.map(road => [road.a, road.b]));
    if (roads.length < 3 || following.size !== roads.length) return false;
    let entry = roads[0].a;
    const visited = new Set();
    while (following.has(entry) && !visited.has(entry)) {
      visited.add(entry);
      entry = following.get(entry);
    }
    return entry === roads[0].a && visited.size === roads.length;
  }) && network.nodes.every(node => {
    const legs = new Map(junctionLegs(network, node.id).map(leg => [leg.neighbor, leg]));
    if (node.laneRules !== undefined && (!node.laneRules || typeof node.laneRules !== "object" || Array.isArray(node.laneRules) ||
      !Object.entries(node.laneRules).every(([key, rule]) => validIncomingRule(key, rule, legs)))) return false;
    return node.movements === undefined || Array.isArray(node.movements) && node.movements.length <= 256 &&
      node.movements.every(movement => validMovement(movement, legs)) &&
      new Set(node.movements.map(movementKey)).size === node.movements.length;
  });
}

// Ramp lanes store their selected directed host and original cubic parameter.
// Splitting the host changes its neighbors, but leaves that address unchanged.
const rampHost = road => road.rampHost?.source ?? road;
const sameHost = (a, b) => a?.a === b?.a && a?.b === b?.b;
const vectorPoint = (p, heading, distance) => ({ x: p.x + Math.cos(heading) * distance, y: p.y + Math.sin(heading) * distance });
const rampDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const spanCoordinates = (...points) => points.flatMap(p => [p.x, p.y]);
const spanPoints = span => [0, 2, 4, 6].map(i => ({ x: span[i], y: span[i + 1] }));

function rampGeometry(spans) {
  const curves = spans.map(span => cubic(...spanPoints(span)));
  let length = 0;
  const samples = curves.flatMap((curve, i) => {
    const points = curve.samples.slice(i ? 1 : 0).map(p => ({ ...p, length: p.length + length }));
    length += curve.length;
    return points;
  });
  const last = curves.at(-1);
  return { start: curves[0].start, a: curves[0].a, b: last.b, end: last.end, samples, length,
    radius: Math.min(...curves.map(c => c.radius)), speed: Math.min(...curves.map(c => c.speed)),
    path: curves[0].path + curves.slice(1).map(c => ` C ${c.a.x} ${c.a.y} ${c.b.x} ${c.b.y} ${c.end.x} ${c.end.y}`).join("") };
}

function divideSpan(span, t) {
  const [p, a, b, q] = spanPoints(span);
  const mix = (x, y) => ({ x: x.x + (y.x - x.x) * t, y: x.y + (y.y - x.y) * t });
  const pa = mix(p, a), ab = mix(a, b), bq = mix(b, q);
  const left = mix(pa, ab), right = mix(ab, bq), middle = mix(left, right);
  return [spanCoordinates(p, pa, left, middle), spanCoordinates(middle, right, bq, q)];
}

function rampSlice(spans, from, to) {
  return spans.flatMap((span, i) => {
    const lo = Math.max(0, from * spans.length - i), hi = Math.min(1, to * spans.length - i);
    if (hi - lo < 1e-8) return [];
    const left = hi < 1 ? divideSpan(span, hi)[0] : span;
    return [lo > 0 ? divideSpan(left, lo / hi)[1] : left];
  });
}

function splitRampCurve(road, cuts) {
  const points = [{ node: { id: road.a }, t: 0 }, ...[...cuts].sort((a,b) => a.t - b.t), { node: { id: road.b }, t: 1 }];
  return points.slice(1).map((point, i) => ({ ...road, a: points[i].node.id, b: point.node.id,
    laneA: i === 0 ? road.laneA : undefined, laneB: i === cuts.length ? road.laneB : undefined,
    atA: i === 0 ? road.atA : undefined, atB: i === cuts.length ? road.atB : undefined,
    rampCurve: rampSlice(road.rampCurve, points[i].t, point.t) }));
}

// Derive position and travel heading from the live host, including lane shifts.
function rampTargetOn(road, path, t, forward, lane) {
  const p = t * (path.samples.length - 1), a = path.samples[Math.floor(p)], b = path.samples[Math.ceil(p)];
  const pose = interpolatePose(a, b, p % 1);
  if (!forward) pose.angle += Math.PI;
  const center = roadLanePosition(pose, forward ? road.forward : road.backward, lane, (road.laneShift ?? 0) * (forward ? 1 : -1));
  const host = rampHost(road), from = road.rampHost?.from ?? 0, to = road.rampHost?.to ?? 1;
  return { host: { a: host.a, b: host.b }, t: from + (to - from) * t, forward, lane,
    x: center.x, y: center.y, angle: pose.angle };
}

function rampEndpointAllowed(network, road, t, end, forward) {
  if (t > 1e-7 && t < 1 - 1e-7) return true;
  const atB = t >= .5;
  return !networkTerminals(network)[road[atB ? 'b' : 'a']] && atB === (end === 'a' ? forward : !forward);
}

export function rampLaneTargets(network, point, end, { radius = 24, host, replace } = {}) {
  if (host) host = rampHost(host);
  if (replace) network = removeRamp(network,replace);
  const nodes = networkNodes(network), hits = [];
  for (const [index, road] of network.roads.entries()) {
    if (road.rampId || road.laneA || road.laneB || road.roundabout || host && !sameHost(host, rampHost(road))) continue;
    const path = networkRoadGeometry(road, nodes);
    for (const forward of [true, false]) for (let lane = 0; lane < (forward ? road.forward : road.backward); lane++) {
      let best, previous = rampTargetOn(road, path, 0, forward, lane);
      for (let i = 1; i < path.samples.length; i++) {
        const current = rampTargetOn(road, path, i / 100, forward, lane);
        const dx = current.x - previous.x, dy = current.y - previous.y;
        const u = clamp(((point.x - previous.x) * dx + (point.y - previous.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        const distance = Math.hypot(point.x - previous.x - dx * u, point.y - previous.y - dy * u);
        if (!best || distance < best.distance) best = { distance, t: (i - 1 + u) / 100 };
        previous = current;
      }
      if (best.distance > radius) continue;
      // Close taps select an existing junction throat, including an extra lane's terminal.
      const station = path.samples[Math.round(best.t * 100)].length;
      let t = best.t;
      if (station < 16 * scale) t = 0;
      else if (path.length - station < 16 * scale) t = 1;
      if (!rampEndpointAllowed(network, road, t, end, forward)) continue;
      const descriptor = rampTargetOn(road, path, t, forward, lane);
      const distance = rampDistance(descriptor, point);
      if (distance <= radius) hits.push({ ...descriptor, distance, roadIndex: index });
    }
  }
  return hits.sort((a,b) => a.distance - b.distance);
}

function resolveRampTarget(network, target, end) {
  if (!target || !Number.isFinite(target.t) || !Number.isInteger(target.lane) || target.lane < 0 || typeof target.forward !== 'boolean') return;
  const nodes = networkNodes(network);
  for (const [index, road] of network.roads.entries()) {
    if (!sameHost(rampHost(road), target.host) || road.rampId || road.roundabout || road.laneA || road.laneB ||
        target.lane >= (target.forward ? road.forward : road.backward)) continue;
    const from = road.rampHost?.from ?? 0, to = road.rampHost?.to ?? 1;
    if (target.t < from - 1e-7 || target.t > to + 1e-7) continue;
    const t = clamp((target.t - from) / (to - from), 0, 1);
    if (!rampEndpointAllowed(network, road, t, end, target.forward)) continue;
    const path = networkRoadGeometry(road, nodes);
    const pose = rampTargetOn(road, path, t, target.forward, target.lane);
    const { start, a, b, end: finish } = path;
    const coords = divideSpan(spanCoordinates(start,a,b,finish), t)[0];
    return { pose, road, index, t, center: { x: coords[6], y: coords[7] } };
  }
}

// Two equal-radius directed arcs share an external tangent. Each arc is
// subdivided at 90 degrees so even a sweeping loop retains finite curvature.
function loopSpans(start, end, radius, side) {
  const cs = vectorPoint(start, start.angle + side * Math.PI / 2, radius);
  const ce = vectorPoint(end, end.angle + side * Math.PI / 2, radius);
  const tangent = Math.atan2(ce.y - cs.y, ce.x - cs.x);
  const spans = [], tau = Math.PI * 2;
  function arc(center, heading, finish) {
    const sweep = ((side * (finish - heading)) % tau + tau) % tau;
    const n = Math.ceil(sweep / (Math.PI / 2));
    for (let i = 0; i < n; i++) {
      const a = heading + side * sweep * i / n, b = heading + side * sweep * (i + 1) / n;
      const start = vectorPoint(center, a - side * Math.PI / 2, radius), end = vectorPoint(center, b - side * Math.PI / 2, radius);
      const reach = radius * 4 / 3 * Math.tan(sweep / n / 4);
      spans.push(spanCoordinates(start, vectorPoint(start,a,reach), vectorPoint(end,b,-reach), end));
    }
  }
  arc(cs, start.angle, tangent);
  const before = vectorPoint(cs, tangent - side * Math.PI / 2, radius), after = vectorPoint(ce, tangent - side * Math.PI / 2, radius);
  const length = rampDistance(before, after);
  if (length > .01) spans.push(spanCoordinates(before, vectorPoint(before,tangent,length/3), vectorPoint(after,tangent,-length/3), after));
  arc(ce, tangent, end.angle);
  return spans;
}

function taggedHost(road) {
  return road.rampHost || road.rampCurve ? road : { ...road, rampHost: { source: road, from: 0, to: 1 } };
}

function cutHost(network, road, cuts) {
  const graphNodes = networkNodes(network);
  const parts = splitRoad(taggedHost(road), graphNodes, cuts);
  return remapSplitReferences({ ...network, roads: network.roads.flatMap(item => item === road ? parts : [item]) }, road, parts);
}

function rampAnchor(network, target, end, id) {
  const hit = resolveRampTarget(network, target, end);
  if (!hit) return;
  const neighbor = (end === 'a') === target.forward ? hit.road.a : hit.road.b;
  if (neighbor === id) return;
  return { neighbor, lane: target.lane };
}

function cleanupRampNodes(network) {
  let next = network;
  for (const node of network.nodes.filter(item => item.rampCut)) {
    const attached = next.roads.filter(road => road.a === node.id || road.b === node.id);
    if (!attached.length) { next = { ...next, nodes: next.nodes.filter(n => n.id !== node.id) }; continue; }
    if (attached.length !== 2 || node.movements || node.laneRules || node.control !== 'priority') continue;
    const left = attached.find(road => road.b === node.id), right = attached.find(road => road.a === node.id);
    if (!left?.rampHost || !right?.rampHost || !sameHost(rampHost(left), rampHost(right)) || left.rampHost.to !== right.rampHost.from) continue;
    if (left.forward !== right.forward || left.backward !== right.backward || roadGrade(left) !== roadGrade(right) ||
        (left.laneShift ?? 0) !== (right.laneShift ?? 0) || left.atB || right.atA) continue;
    const source = rampHost(left), from = left.rampHost.from, to = right.rampHost.to;
    const nodes = networkNodes(next);
    if (!nodes.has(source.a) || !nodes.has(source.b)) continue;
    const geometry = networkRoadGeometry(source, nodes);
    const original = spanCoordinates(geometry.start, geometry.a, geometry.b, geometry.end);
    const matches = part => {
      const path = networkRoadGeometry(part, nodes);
      const expected = rampSlice([original], part.rampHost.from, part.rampHost.to)[0];
      return spanCoordinates(path.start,path.a,path.b,path.end).every((value, i) => Math.abs(value - expected[i]) < .1);
    };
    if (!matches(left) || !matches(right)) continue;
    const merged = { ...source, a: left.a, b: right.b, forward: left.forward, backward: left.backward };
    if (left.laneShift !== source.laneShift) merged.laneShift = left.laneShift;
    if (roadGrade(left) !== roadGrade(source)) merged.grade = roadGrade(left);
    for (const [field, part] of [['atA',left],['atB',right],['laneA',left],['laneB',right]]) {
      if (part[field]) merged[field] = part[field]; else delete merged[field];
    }
    if (from !== 0 || to !== 1) {
      merged.rampHost = { source, from, to };
      merged.bend = 0;
      if (source.controls || source.bend) merged.controls = rampSlice([original], from, to)[0].slice(2,6);
    }
    next = { ...next, nodes: next.nodes.filter(n => n.id !== node.id), roads: next.roads.flatMap(r => r === left ? [merged] : r === right ? [] : [r]) };
    next = remapJunctionNeighbor(remapJunctionNeighbor(next, merged.a, node.id, merged.b), merged.b, node.id, merged.a);
  }
  return next;
}

export function removeRamp(network, id) {
  const removed = network.roads.filter(road => road.rampId === id);
  if (!removed.length) return network;
  const ramps = { ...network.ramps };
  delete ramps[id];
  let next = excludingRoads(network, removed);
  next = reconcileJunctionMovements({ ...next, ramps });
  next = cleanupRampNodes(next);
  if (!Object.keys(ramps).length) { next = { ...next }; delete next.ramps; }
  return next;
}

function selfCrossing(samples) {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i-1], b = samples[i], dx = b.x-a.x, dy = b.y-a.y;
    for (let j = i + 2; j < samples.length; j++) {
      const c = samples[j-1], d = samples[j];
      if (Math.max(a.x,b.x) < Math.min(c.x,d.x) || Math.max(c.x,d.x) < Math.min(a.x,b.x) ||
          Math.max(a.y,b.y) < Math.min(c.y,d.y) || Math.max(c.y,d.y) < Math.min(a.y,b.y)) continue;
      const sx = d.x-c.x, sy = d.y-c.y, det = dx*sy-dy*sx;
      if (Math.abs(det) < 1e-9) continue;
      const t = ((c.x-a.x)*sy-(c.y-a.y)*sx)/det, u = ((c.x-a.x)*dy-(c.y-a.y)*dx)/det;
      if (t >= -1e-8 && t <= 1+1e-8 && u >= -1e-8 && u <= 1+1e-8) return { x:a.x+dx*t,y:a.y+dy*t };
    }
  }
}

export function previewRamp(network, draft) {
  if (!network || !draft?.start || !draft?.end) return { issue: 'Choose a departure lane and a receiving lane.' };
  const grade = draft.grade ?? 0, shape = draft.shape ?? 'direct';
  if (![-1,0,1].includes(grade) || !['direct','loop'].includes(shape)) return { issue: 'Choose a ramp shape and crossing level.' };
  let next = draft.replace ? removeRamp(network, draft.replace) : network;
  const endpoints = [resolveRampTarget(next, draft.start, 'a'), resolveRampTarget(next, draft.end, 'b')];
  if (endpoints.some(hit => !hit)) return { issue: 'The selected host lane is unavailable. Choose its replacement.' };
  const [start,end] = endpoints.map(hit => hit.pose);
  const chord = rampDistance(start,end);
  if (chord < 16) return { issue: 'Choose lanes farther apart.' };
  const reach = draft.reach ?? (shape === 'loop' ? clamp(chord * .23, 17, 48) : chord * .45);
  const startReach = draft.startReach ?? reach, endReach = draft.endReach ?? reach;
  if (![reach,startReach,endReach].every(n => Number.isFinite(n) && n >= 2 && n <= 900)) return { issue: 'Keep the curve handle within reach of the map.' };
  const direction = draft.direction === -1 ? -1 : 1;
  const armA = vectorPoint(start,start.angle,startReach), armB = vectorPoint(end,end.angle,-endReach);
  const spans = shape === 'loop' ? loopSpans(start,end,reach,direction) : [spanCoordinates(start,armA,armB,end)];
  if (!spans.length) return { issue: 'Choose a larger loop.' };
  const geometry = rampGeometry(spans), samples = geometry.samples;
  const middle = pointOnCurve(geometry, geometry.length / 2);
  const crossings = [];
  const preview = { samples, crossings, handles: { start: geometry.a, end: geometry.b, middle }, reach, startReach, endReach };
  const fail = (issue, point = middle) => ({ ...preview, issue, issuePoint: { x: point.x, y: point.y } });
  const chordAngle = Math.atan2(end.y - start.y,end.x - start.x);
  if (shape === 'direct' && [start,end].some(p => Math.cos(p.angle - chordAngle) < -.94)) return fail('This direct curve reverses against lane travel. Move an attachment or use a loop.');
  const crossing = selfCrossing(samples);
  if (crossing) return fail('This ramp crosses itself. Adjust the loop direction, reach, or endpoints.', crossing);
  const tightest = samples.reduce((worst,p) => Math.abs(p.curvature) > Math.abs(worst.curvature) ? p : worst);
  preview.warnings = geometry.radius < 11 ? [{ message: 'Tight curve: traffic will slow here.', x: tightest.x, y: tightest.y }] : [];
  if (!Number.isFinite(geometry.speed) || geometry.radius < scale * networkLaneWidth / 2 / .92) return fail('This bend is too tight for its lane. Widen the curve.',tightest);
  for (const p of samples) {
    const obstacle = footprintAt(p, networkLaneWidth / 2 + 2, network);
    if (obstacle) return fail(`This ramp would cross ${obstacle}. Move its curve or lane attachment.`,p);
    if (p.x < 11 || p.x > 489 || p.y < 71 || p.y > 619) return fail('Keep the full ramp inside the map.',p);
  }
  const added = [...next.nodes], cuts = new Map();
  const allocate = p => {
    const node = { ...nextNetworkNode({ nodes: added },p), rampCut: true };
    added.push(node);
    return node;
  };
  const cut = (road,t,node) => {
    const items = cuts.get(road) ?? [];
    if (!items.some(item => item.node.id === node.id)) items.push({ t,node });
    cuts.set(road,items);
  };
  const ids = endpoints.map(hit => {
    if (hit.t < 1e-7) return hit.road.a;
    if (hit.t > 1 - 1e-7) return hit.road.b;
    const node = allocate(hit.center);
    if (roadGrade(hit.road)) {
      const path = networkRoadGeometry(hit.road,networkNodes(next));
      node.rampElevation = roadElevationProfile(next,hit.road,path.length)(path.samples[Math.round(hit.t * 100)].length);
    }
    cut(hit.road,hit.t,node);
    return node.id;
  });
  if (ids[0] === ids[1]) return fail('Choose two different attachment points.');
  next = { ...next, nodes: added };
  for (const [host, items] of cuts) next = cutHost(next,host,items);
  const [laneA,laneB] = [rampAnchor(next,start,'a',ids[0]),rampAnchor(next,end,'b',ids[1])];
  if (!laneA || !laneB) return fail('Choose lanes flowing in the right direction.');
  let n = 1;
  while (next.ramps?.[`ramp${n}`]) n++;
  const rampId = draft.replace ?? `ramp${n}`;
  const ramp = { a: ids[0], b: ids[1], forward: 1, backward: 0, bend: 0, rampId, rampCurve: spans, laneA, laneB, atB: 'yield', ...(grade ? { grade } : {}) };
  const nodes = networkNodes(next), rampCuts = [], crossingCuts = new Map();
  const height = roadElevationProfile(next,ramp,geometry.length);
  const distanceAt = (path,t) => {
    const i = clamp(t,0,1) * (path.samples.length - 1);
    const lo = path.samples[Math.floor(i)], hi = path.samples[Math.ceil(i)];
    return lo.length + (hi.length - lo.length) * (i % 1);
  };
  for (const [index, road] of next.roads.entries()) {
    const other = networkRoadGeometry(road,nodes);
    for (const hit of roadCrossings(ramp,road,nodes)) {
      if (hit.overlap) return fail('The ramp overlaps another road. Move the curve away from it.');
      if (hit.t < 1e-6 || hit.t > 1 - 1e-6) continue;
      if (crossings.some(p => rampDistance(p,hit) < .15)) continue;
      crossings.push({ x: hit.x, y: hit.y, grade, roadIndex: index });
      if (grade !== roadGrade(road)) {
        const otherHeight = roadElevationProfile(next,road,other.length);
        if (Math.abs(height(distanceAt(geometry,hit.t)) - otherHeight(distanceAt(other,hit.u))) < 4.5) return fail('Give the ramps more room on both sides of the crossing.',hit);
        continue;
      }
      if (grade) return fail('These roads cross at the same elevated level. Choose a different crossing level.',hit);
      if (road.roundabout) return fail('Connect at an existing roundabout entry.');
      const existing = hit.u < 1e-6 ? nodes.get(road.a) : hit.u > 1 - 1e-6 ? nodes.get(road.b) : undefined;
      const node = existing ?? allocate(hit);
      rampCuts.push({ node,t:hit.t });
      if (!existing) {
        const items = crossingCuts.get(road) ?? [];
        items.push({ node,t:hit.u }); crossingCuts.set(road,items);
      }
    }
  }
  next = { ...next, nodes: [...next.nodes, ...added.filter(n => !next.nodes.some(existing => existing.id === n.id))] };
  for (const [host, items] of crossingCuts) {
    const live = next.roads.find(r => sameHost(r,host));
    next = cutHost(next,live,items);
  }
  const insertShape = t => {
    const point = pointOnCurve(geometry,distanceAt(geometry,t));
    const node = allocate(point);
    node.rampElevation = height(distanceAt(geometry,t));
    next = { ...next, nodes: [...next.nodes,node] };
    rampCuts.push({ node,t });
  };
  // SUMO clips a sweeping edge against both endpoint junction shapes. Short
  // continuation edges keep the interior turns intact in the native network.
  if (shape === 'loop') for (const fraction of [1/3,2/3]) {
    const distance = geometry.length * fraction;
    const pos = samples.findIndex(p => p.length >= distance);
    const t = pos / (samples.length - 1);
    if (!rampCuts.some(c => Math.abs(distanceAt(geometry,c.t)-distance) < 14 * scale)) insertShape(t);
  }
  // Parallel edges cannot be distinguished by the existing neighbor/lane
  // movement key. Give each bypass its own continuation before export.
  const ordered = [{ node:{id:ramp.a},t:0 }, ...[...rampCuts].sort((a,b) => a.t-b.t), { node:{id:ramp.b},t:1 }];
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i-1], b = ordered[i];
    if (next.roads.some(r => r.a === a.node.id && r.b === b.node.id || r.b === a.node.id && r.a === b.node.id)) insertShape((a.t+b.t)/2);
  }
  // A crossing farther along the same host may have changed the adjacent neighbor.
  ramp.laneA = rampAnchor(next,start,'a',ids[0]);
  ramp.laneB = rampAnchor(next,end,'b',ids[1]);
  const roads = rampCuts.length ? splitRampCurve(ramp,rampCuts) : [ramp];
  let offset = 0;
  for (const road of roads) {
    road.rampProfile = { length: geometry.length, offset, z0: networkNodeElevation(next,ramp.a), z1: networkNodeElevation(next,ramp.b) };
    offset += rampGeometry(road.rampCurve).length;
  }
  const saved = { start, end, shape, grade, reach, direction, ...(draft.startReach !== undefined ? { startReach } : {}), ...(draft.endReach !== undefined ? { endReach } : {}) };
  next = { ...next, roads: [...next.roads,...roads], ramps: { ...next.ramps, [rampId]: saved } };
  for (const road of roads) if (road.laneA || road.laneB) next = refreshLaneConnections(next,road);
  const checked = checkNetworkEdit(next,network.roads);
  if (checked.issue) return fail(checked.issue);
  return { ...preview, network: next, roads: next.roads.filter(road => road.rampId === rampId), rampId };
}

export function resizeRoadLanes(network, index, forward, backward) {
  const road = network.roads[index];
  if (!road || road.rampId || road.laneA || road.laneB || road.roundabout) return { issue: 'Select an ordinary road segment to change its lanes.' };
  if (![forward,backward].every(n => Number.isInteger(n) && n >= 0 && n <= 4) || forward + backward < 1) return { issue: 'Choose one to four lanes per direction.' };
  const resized = { ...road, forward, backward };
  const laneDelta = (id, incoming) => (road.b === id) === incoming ? forward - road.forward : backward - road.backward;
  const remapLane = (id, neighbor, lane, incoming) =>
    (road.a === id && road.b === neighbor || road.b === id && road.a === neighbor) ? lane + laneDelta(id,incoming) : lane;
  const ramps = { ...network.ramps };
  let lost = false;
  const roads = network.roads.map(item => {
    if (item === road) return resized;
    let result = item;
    for (const [key,end,incoming] of [['laneA','a',true],['laneB','b',false]]) {
      const anchor = item[key];
      if (!anchor) continue;
      const lane = remapLane(item[end],anchor.neighbor,anchor.lane,incoming);
      if (lane < 0) lost = true;
      if (lane === anchor.lane) continue;
      result = { ...result, [key]: { ...anchor,lane } };
      if (item.rampId) {
        const field = incoming ? 'start' : 'end';
        const draft = ramps[item.rampId];
        ramps[item.rampId] = { ...draft, [field]: { ...draft[field],lane } };
      }
    }
    return result;
  });
  if (lost) return { issue: 'This lane has an attachment. Move its ramp before removing the lane.' };
  const nodes = network.nodes.map(node => {
    if (node.id !== road.a && node.id !== road.b || !node.movements && !node.laneRules) return node;
    const movements = node.movements?.map(m => ({ ...m, fromLane: remapLane(node.id,m.from,m.fromLane,true),
      toLane: remapLane(node.id,m.to,m.toLane,false) })).filter(m => m.fromLane >= 0 && m.toLane >= 0);
    const laneRules = Object.entries(node.laneRules ?? {}).flatMap(([key,rule]) => {
      const [neighbor,index] = key.split(':');
      const lane = remapLane(node.id,neighbor,Number(index),true);
      return lane < 0 ? [] : [[incomingLaneKey(neighbor,lane),rule]];
    });
    return { ...node, movements, laneRules: laneRules.length ? Object.fromEntries(laneRules) : undefined };
  });
  const next = reconcileJunctionMovements({ ...network, nodes, roads, ...(network.ramps ? { ramps } : {}) });
  const issue = roadShapeIssue(next,resized,networkNodes(next));
  if (issue) return { issue };
  return checkNetworkEdit(next,network.roads);
}
