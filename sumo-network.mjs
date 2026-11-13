import { avenueLanePath, avenueLaneX, avenuePieces, networkLaneWidth, networkNodes, networkRoadGeometry, selectedLane, terminals, tripTerminals } from "./model.mjs";

// Shared School Pickup network for browser and native SUMO.
// Inputs are generated internally by sumoRequest.
export const yellow = 3;
export const allRed = 2;
export const clearance = yellow + allRed;
export const queueZones = {
  "avenue-south": "Alder Avenue", "pickup-road": "Pickup loop", "merge-lane": "Merge lane", avenue: "Alder Avenue",
  inner: "Alder Avenue", "signal-in": "Alder Avenue", "slip-road": "Slip lane", approach: "Alder Avenue", downstream: "Alder Avenue", "cross-in": "Cross street"
};

export function signalPhase(time, green, cycle) {
  const second = time % cycle;
  if (second < green) return "avenue";
  if (second < green + yellow) return "avenue-yellow";
  if (second < green + clearance) return "all-red";
  if (second < cycle - clearance) return "cross";
  if (second < cycle - allRed) return "cross-yellow";
  return "all-red";
}

const element = (tag, attributes) => `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(" ")}/>`;
const wrap = (tag, items) => `<${tag}>\n${items.join("\n")}\n</${tag}>\n`;

export function sumoInputs(request, layout) {
  if (layout.design.network) return freeNetworkInputs(request, layout.design.network);
  const { world, scale } = request;
  const { design, curves, taper } = layout;
  const main = design.lanes & 1;
  const auxiliary = design.lanes & 2;
  const schoolOpen = design.schoolAccess !== false && design.schoolRight;
  const nodes = [], edges = [], connections = [], prohibitions = [], routes = [];
  const node = (id, x, y, type = "priority") =>
    nodes.push(element("node", { id, x: x * scale, y: -y * scale, type, radius: .5 }));
  const shape = points => points.map(([x, y]) => `${(x * scale).toFixed(4)},${(-y * scale).toFixed(4)}`).join(" ");
  const edge = (id, from, to, points, speed = 14, priority = 2) =>
    edges.push({ id, from, to, points, speed, priority, laneShapes: [points] });
  const connect = (from, to, options = {}) =>
    connections.push({ from, to, fromLane: 0, toLane: 0, ...options });
  const { outer, inner, south, signal, north } = world;
  const { node: join, mergeEnd: end, slipStart, slipEnd } = design;
  const approachEnd = auxiliary ? "taper" : slipStart ? "slip-fork" : "signal";
  const afterTaper = slipStart ? "slip-fork" : "signal";
  const beforeFork = !design.lanes ? "avenue" : auxiliary ? "downstream" : "approach";
  const signalIn = slipStart ? "signal-in" : beforeFork;
  const prohibit = (prohibitor, prohibited) => prohibitions.push({ prohibitor, prohibited });
  node("south", outer, south, "dead_end");
  node("inner-south", inner, south, "dead_end");
  node("inner-north", inner, north, "dead_end");
  node("north", outer, north, "dead_end");
  node("signal", outer, signal, "traffic_light");
  node("cross-west", 40, signal, "dead_end");
  node("cross-east", 488, signal, "dead_end");
  if (design.lanes) node("join", outer, join, design.road == null && main && !design.pickupYield ? "zipper" : "priority");
  if (design.lanes) node("pickup", ...curves[0].points[0], "dead_end");
  const avenueEnd = design.lanes ? "join" : approachEnd;
  const avenueEndY = design.lanes ? join : slipStart || signal;
  if (schoolOpen) {
    const schoolY = layout.schoolEntry[0][1];
    node("school-fork", outer, schoolY);
    edge("avenue-south", "south", "school-fork", [[outer, south], [outer, schoolY]]);
    edge("avenue", "school-fork", avenueEnd, [[outer, schoolY], [outer, avenueEndY]]);
    connect("avenue-south", "avenue");
  } else {
    edge("avenue", "south", avenueEnd, [[outer, south], [outer, avenueEndY]]);
  }
  edge("inner", "inner-south", "signal", [[inner, south], [inner, signal]]);
  edge("inner-exit", "signal", "inner-north", [[inner, signal], [inner, north]]);
  edge("exit", "signal", "north", [[outer, signal], [outer, north]]);
  if (design.lanes) {
    edge("approach", "join", approachEnd, [[outer, join], [outer, auxiliary ? end : slipStart || signal]]);
    connect("avenue", "approach", { visibility: 25 });
  }
  edge("cross-in", "cross-west", "signal", [[40, signal], [outer, signal]], 12);
  edge("cross-out", "signal", slipStart ? "slip-join" : "cross-east", [[outer, signal], [slipEnd || 488, signal]], 12, design.slipYield ? 2 : 1);
  connect(signalIn, "exit");
  if (design.signalRight) connect(signalIn, "cross-out");
  if (schoolOpen) {
    node("school-entry", ...layout.schoolEntry.at(-1), "dead_end");
    edge("school-in", "school-fork", "school-entry", layout.schoolEntry, 7);
    connect("avenue-south", "school-in");
  }
  if (slipStart) {
    node("slip-fork", outer, slipStart);
    node("slip-join", slipEnd, signal);
    edge("signal-in", "slip-fork", "signal", [[outer, slipStart], [outer, signal]]);
    edge("slip-road", "slip-fork", "slip-join", layout.slip, layout.slipSpeed, design.slipYield ? 1 : 2);
    edge("east-exit", "slip-join", "cross-east", [[slipEnd, signal], [488, signal]], 12);
    connect(beforeFork, "signal-in");
    connect(beforeFork, "slip-road");
    connect("cross-out", "east-exit");
    connect("slip-road", "east-exit");
    const cross = "cross-out->east-exit", slip = "slip-road->east-exit";
    prohibit(design.slipYield ? cross : slip, design.slipYield ? slip : cross);
  }
  connect("inner", "inner-exit");
  connect("cross-in", "cross-out");
  const pickup = curves[main ? 0 : 1];
  if (design.lanes) edge("pickup-road", "pickup", "join", pickup.points, pickup.speed, design.pickupYield ? 1 : 2);
  if (main) {
    connect("pickup-road", "approach", { visibility: 25 });
    if (design.pickupYield) prohibit("avenue->approach", "pickup-road->approach");
  }
  if (auxiliary) {
    node("taper", outer, end, design.taperYield || design.road != null ? "priority" : "zipper");
    edge("merge-lane", "join", "taper", [[world.auxiliary, join], ...taper], layout.taperSpeed, design.taperYield ? 1 : 2);
    edge("downstream", "taper", afterTaper, [[outer, end], [outer, slipStart || signal]]);
    connect("pickup-road", "merge-lane");
    connect("approach", "downstream", { visibility: 25 });
    connect("merge-lane", "downstream", { visibility: 25 });
    if (design.taperYield) prohibit("approach->downstream", "merge-lane->downstream");
  }
  for (const [id, dimensions] of Object.entries(request.types)) {
    const bus = id === "bus";
    routes.push(element("vType", { id, ...dimensions, vClass: bus ? "bus" : "passenger", minGap: 2,
      sigma: 0, tau: 1, accel: bus ? 1.05 : 2.1, decel: 4.5, maxSpeed: bus ? 12 : 14, speedFactor: 1, speedDev: 0 }));
  }
  const east = slipStart ? "cross-out east-exit" : "cross-out";
  const beforeSignal = !design.lanes ? "" : auxiliary ? "approach downstream" : "approach";
  const toSignal = slipStart ? beforeSignal + " signal-in" : beforeSignal;
  const custom = design.road != null;
  const trunkIds = new Set(["avenue-south", "avenue", "approach", "downstream", "signal-in", "exit"]);
  const replacements = new Map();
  const segmentNodes = new Set();
  if (custom) {
    const pieces = avenuePieces(design);
    for (const original of edges.filter(item => trunkIds.has(item.id))) {
      const bottom = original.points[0][1], top = original.points.at(-1)[1];
      const list = pieces.filter(piece => piece.top >= top && piece.bottom <= bottom && piece.north)
        .sort((a, b) => b.bottom - a.bottom);
      // Only contiguous segments can carry traffic between the existing junctions.
      const continuous = list[0]?.bottom === bottom && list.at(-1)?.top === top &&
        list.every((piece, i) => i === 0 || list[i - 1].top === piece.bottom);
      const boundary = y => {
        if (y === bottom) return original.from;
        if (y === top) return original.to;
        const id = `road-node-${y}`;
        if (!segmentNodes.has(id)) {
          node(id, outer, y);
          segmentNodes.add(id);
        }
        return id;
      };
      const parts = list.map(piece => {
        const id = `road-n-${piece.top}-${piece.bottom}`;
        const laneGeometry = Array.from({ length: piece.north }, (_, index) =>
          avenueLanePath(piece, avenueLaneX("north", piece.north - index)));
        return { ...original, id, from: boundary(piece.bottom), to: boundary(piece.top),
          speed: Math.min(...laneGeometry.map(lane => lane.speed)),
          laneShapes: laneGeometry.map(lane => lane.samples.map(({ x, y }) => [x, y])) };
      });
      replacements.set(original.id, { parts, continuous, bottom, top, list });
    }
    const ends = (id, end) => {
      const replacement = replacements.get(id);
      if (!replacement) return { id, count: 1 };
      const first = end === "start";
      const part = first ? replacement.parts[0] : replacement.parts.at(-1);
      if ((first ? replacement.list[0]?.bottom : replacement.list.at(-1)?.top) !==
          (first ? replacement.bottom : replacement.top)) return undefined;
      return { id: part.id, count: part.laneShapes.length };
    };
    const link = (from, to, options) => {
      for (let lane = 1; lane <= from.count; lane++) {
        connect(from.id, to.id, { ...options, fromLane: from.count - lane,
          toLane: Math.max(0, to.count - lane) });
      }
    };
    const originalConnections = connections.splice(0);
    for (const { from, to, ...options } of originalConnections) {
      if (from === "inner") continue;
      const start = ends(from, "end"), end = ends(to, "start");
      if (!start || !end) continue;
      if (to === "slip-road") connect(start.id, end.id, { fromLane: start.count - selectedLane(design, "slip") });
      else if (from === "pickup-road" && to === "approach") {
        connect(start.id, end.id, { ...options, toLane: end.count - selectedLane(design, "pickup") });
      } else if (to === "cross-out" || to === "school-in") connect(start.id, end.id);
      else link(start, end, options);
    }
    for (const { parts } of replacements.values()) {
      for (let i = 1; i < parts.length; i++) {
        const before = parts[i - 1], after = parts[i];
        if (before.to === after.from) link({ id: before.id, count: before.laneShapes.length },
          { id: after.id, count: after.laneShapes.length });
      }
    }
    for (let i = prohibitions.length - 1; i >= 0; i--) {
      const updated = {};
      for (const [key, movement] of Object.entries(prohibitions[i])) {
        const [from, to] = movement.split("->");
        const start = ends(from, "end"), end = ends(to, "start");
        if (start && end) updated[key] = `${start.id}->${end.id}`;
      }
      if (Object.keys(updated).length === 2) prohibitions[i] = updated;
      else prohibitions.splice(i, 1);
    }
    for (let i = edges.length - 1; i >= 0; i--) {
      if (replacements.has(edges[i].id)) edges.splice(i, 1, ...replacements.get(edges[i].id).parts);
      else if (["inner", "inner-exit"].includes(edges[i].id)) edges.splice(i, 1);
    }
  }

  const availableRoutes = new Set();
  if (request.trips.some(trip => trip.origin === "southbound")) {
    const pieces = custom ? avenuePieces(design).filter(piece => piece.south) :
      [{ top: north, bottom: signal, south: 1, bend: 0 }, { top: signal, bottom: south, south: 1, bend: 0 }];
    const southNode = y => {
      if (y === signal) return "signal";
      const id = `southbound-${y}`;
      if (!segmentNodes.has(id)) {
        node(id, avenueLaneX("south", 1), y, y === north || y === south ? "dead_end" : "priority");
        segmentNodes.add(id);
      }
      return id;
    };
    const southEdges = pieces.map(piece => {
      const laneGeometry = Array.from({ length: piece.south }, (_, index) =>
        avenueLanePath(piece, avenueLaneX("south", piece.south - index), false));
      return { id: `road-s-${piece.top}-${piece.bottom}`, from: southNode(piece.top), to: southNode(piece.bottom),
        points: laneGeometry[0].samples.map(({ x, y }) => [x, y]), priority: 2,
        speed: Math.min(...laneGeometry.map(lane => lane.speed)),
        laneShapes: laneGeometry.map(lane => lane.samples.map(({ x, y }) => [x, y])) };
    });
    edges.push(...southEdges);
    for (let i = 1; i < southEdges.length; i++) {
      const before = southEdges[i - 1], after = southEdges[i];
      if (before.to !== after.from) continue;
      for (let lane = 1; lane <= before.laneShapes.length; lane++) {
        connect(before.id, after.id, { fromLane: before.laneShapes.length - lane,
          toLane: Math.max(0, after.laneShapes.length - lane) });
      }
    }
    if (southEdges[0]?.from === `southbound-${north}` && southEdges.at(-1)?.to === `southbound-${south}` &&
      southEdges.every((edge, i) => i === 0 || southEdges[i - 1].to === edge.from)) {
      availableRoutes.add("southbound");
      routes.push(element("route", { id: "southbound", edges: southEdges.map(edge => edge.id).join(" ") }));
    }
  }

  const route = (id, path) => {
    const ids = path.trim().split(/\s+/);
    if (ids.some(edge => replacements.has(edge) && !replacements.get(edge).continuous)) return;
    const expanded = ids.flatMap(edge => replacements.has(edge) ? replacements.get(edge).parts.map(part => part.id) : edge);
    if (expanded.some((edge, i) => i && !connections.some(link => link.from === expanded[i - 1] && link.to === edge))) return;
    routes.push(element("route", { id, edges: expanded.join(" ") }));
    availableRoutes.add(id);
  };
  if (!custom) route("inner", "inner inner-exit");
  route("cross", "cross-in " + east);
  if (schoolOpen) route("school", "avenue-south school-in");
  const prefixes = { outer: schoolOpen ? "avenue-south avenue " : "avenue ", ...(main ? { direct: "pickup-road " } : {}), ...(auxiliary ? { merge: "pickup-road " } : {}) };
  for (const [name, prefix] of Object.entries(prefixes)) {
    const trunk = name === "merge" ? "merge-lane downstream" : beforeSignal;
    const inbound = name === "merge" ? trunk + (slipStart ? " signal-in" : "") : toSignal;
    route(name, prefix + inbound + " exit");
    if (design.signalRight) route(name + "-right", prefix + inbound + " " + east);
    if (slipStart) route(name + "-slip", prefix + trunk + " slip-road east-exit");
  }

  for (const trip of request.trips) {
    if (trip.origin === "ramp" && !design.lanes) continue;
    const direct = main && (!auxiliary || trip.pickupIndex % 2 === 0);
    let route = trip.origin === "ramp" ? (direct ? "direct" : "merge") : custom && trip.origin === "inner" ? "outer" : trip.origin;
    if (trip.destination === "school") {
      if (!schoolOpen) continue;
      route = "school";
    }
    if (trip.destination === "east") {
      const viaSlip = route + "-slip", viaSignal = route + "-right";
      const slipAvailable = availableRoutes.has(viaSlip);
      const signalAvailable = availableRoutes.has(viaSignal);
      if (slipAvailable && (!signalAvailable || trip.id % 2 === 0)) route = viaSlip;
      else if (signalAvailable) route = viaSignal;
      else continue;
    }
    if (!availableRoutes.has(route)) continue;
    routes.push(element("vehicle", { id: trip.id, type: trip.kind, route, depart: trip.time.toFixed(2), departSpeed: 0, departPos: "base",
      ...((custom && route === "outer") || route === "southbound" ? { departLane: "best" } : {}) }));
  }
  return {
    "nodes.xml": wrap("nodes", nodes), "edges.xml": wrap("edges", edges.map(({ points, laneShapes, ...edge }) => {
      const attrs = { ...edge, shape: shape(points), spreadType: "center", numLanes: laneShapes.length };
      if (!edge.id.startsWith("road-")) return element("edge", attrs);
      return `<edge ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(" ")}>${
        laneShapes.map((points, index) => element("lane", { index, shape: shape(points) })).join("")}</edge>`;
    })),
    "connections.xml": wrap("connections", [
      ...connections.map(link => element("connection", link)), ...prohibitions.map(rule => element("prohibition", rule))
    ]), "routes.xml": wrap("routes", routes)
  };
}

function freeNetworkInputs(request, network) {
  const nodes = networkNodes(network);
  const outgoing = new Map();
  const incoming = new Map();
  const edges = [], connections = [];
  const explicitJunctions = new Set();
  const usesApproachRules = node => node.control !== "traffic_light" && node.control !== "allway_stop";
  const shape = points => points.map(point => `${(point.x * request.scale).toFixed(4)},${(-point.y * request.scale).toFixed(4)}`).join(" ");
  const addEdge = (id, from, to, points, count, speed, length, rule = "default") => {
    if (!count) return;
    const control = usesApproachRules(nodes.get(to)) ? rule : "default";
    const priority = { default: 2, priority: 3, yield: 1, stop: 1 }[control];
    if (control !== "default") explicitJunctions.add(to);
    const edge = { id, from, to, count, length };
    if (!outgoing.has(from)) outgoing.set(from, []);
    if (!incoming.has(to)) incoming.set(to, []);
    outgoing.get(from).push(edge);
    incoming.get(to).push(edge);
    edges.push(element("edge", { id, from, to, shape: shape(points), speed, priority, numLanes: count,
      width: networkLaneWidth * request.scale, spreadType: "right" }));
  };
  for (const terminal of Object.values(terminals)) {
    const { id, x, y, dx, dy } = terminal;
    const boundary = { id: `${id}-boundary`, x: x + dx, y: y + dy };
    nodes.set(boundary.id, boundary);
    addEdge(`${id}-in`, boundary.id, id, [boundary, terminal], 1, 9, Math.hypot(dx, dy));
    addEdge(`${id}-out`, id, boundary.id, [terminal, boundary], 1, 9, Math.hypot(dx, dy));
  }
  for (const [index, road] of network.roads.entries()) {
    const { samples, speed, length } = networkRoadGeometry(road, nodes);
    const points = samples.filter((_, i) => i % 5 === 0);
    addEdge(`road-${index}-f`, road.a, road.b, points, road.forward, speed, length, road.atB);
    addEdge(`road-${index}-b`, road.b, road.a, [...points].reverse(), road.backward, speed, length, road.atA);
  }
  for (const [id, arrivals] of incoming) {
    for (const from of arrivals) {
      for (const to of outgoing.get(id) ?? []) {
        if (from.from === to.to && !id.endsWith("-boundary")) continue;
        if (id.endsWith("-boundary")) continue;
        for (let lane = 0; lane < from.count; lane++) {
          connections.push(element("connection", {
            from: from.id, to: to.id, fromLane: lane,
            toLane: Math.min(to.count - 1, lane + Math.max(0, to.count - from.count))
          }));
        }
      }
    }
  }

  // Search by incoming edge so routes respect one-way segments and exclude U-turns.
  const routeCache = new Map();
  function routeBetween(origin, destination) {
    const first = outgoing.get(`${origin}-boundary`)[0];
    const pending = [{ edge: first, distance: 0, path: [first.id] }];
    const visited = new Set();
    while (pending.length) {
      pending.sort((a, b) => b.distance - a.distance);
      const { edge, distance, path } = pending.pop();
      if (visited.has(edge.id)) continue;
      visited.add(edge.id);
      if (edge.id === `${destination}-out`) return path;
      if (edge.to.endsWith("-boundary")) continue;
      for (const next of outgoing.get(edge.to) ?? []) {
        if (next.to !== edge.from && !visited.has(next.id)) {
          pending.push({ edge: next, distance: distance + next.length, path: [...path, next.id] });
        }
      }
    }
  }
  const routes = Object.entries(request.types).map(([id, dimensions]) =>
    element("vType", { id, ...dimensions, accel: id === "bus" ? 1.05 : 2.1, decel: 4.5,
      sigma: 0, minGap: 2, maxSpeed: 12, speedFactor: 1, speedDev: 0 }));
  for (const trip of request.trips) {
    const [origin, destination] = tripTerminals(trip);
    const id = `${origin}-to-${destination}`;
    if (!routeCache.has(id)) {
      const path = routeBetween(origin, destination);
      routeCache.set(id, path);
      if (path) routes.push(element("route", { id, edges: path.join(" ") }));
    }
    if (routeCache.get(id)) routes.push(element("vehicle", {
      id: trip.id, type: trip.kind, route: id, depart: trip.time.toFixed(2), departSpeed: 0, departPos: "base", departLane: "best"
    }));
  }
  return {
    "nodes.xml": wrap("nodes", [...nodes.values()].map(node => element("node", {
      id: node.id, x: node.x * request.scale, y: -node.y * request.scale, type: explicitJunctions.has(node.id) ? "priority" : node.control === "priority" ? "right_before_left" : node.control ?? "priority",
      ...(explicitJunctions.has(node.id) ? { rightOfWay: "edgePriority" } : {})
    }))),
    "edges.xml": wrap("edges", edges),
    "connections.xml": wrap("connections", connections),
    "routes.xml": wrap("routes", routes)
  };
}

export const netconvertArgs = [
  "--node-files", "nodes.xml", "--edge-files", "edges.xml", "--connection-files", "connections.xml",
  "--offset.disable-normalization", "--output-file", "corridor.net.xml"
];

export function configureJunctions(network, design, cycle) {
  if (!design.network) return configureSignal(network, design.green, cycle);
  const nodes = networkNodes(design.network);
  const stopEdges = new Set();
  for (const [index, road] of design.network.roads.entries()) {
    if (road.forward && road.atB === "stop" && nodes.get(road.b).control === "priority") stopEdges.add(`road-${index}-f`);
    if (road.backward && road.atA === "stop" && nodes.get(road.a).control === "priority") stopEdges.add(`road-${index}-b`);
  }
  if (!stopEdges.size) return network;
  // SUMO's stop link state enforces a full stop before applying the junction's conflict rules.
  return network.replace(/<connection\s[^>]+>/g, tag =>
    stopEdges.has(attributes(tag).from) ? tag.replace(/\bstate="[^"]*"/, 'state="s"') : tag);
}

function configureSignal(network, green, cycle) {
  // Netconvert assigns indices by junction geometry. Read them before setting phases.
  const links = [...network.matchAll(/<connection\s[^>]*>/g)].map(([tag]) => attributes(tag))
    .filter(link => link.tl === "signal").sort((a, b) => a.linkIndex - b.linkIndex);
  if (!links.length) return network;
  if (links.filter(link => link.from === "cross-in").length !== 1 ||
      links.some((link, i) => Number(link.linkIndex) !== i)) throw new Error("Unexpected SUMO signal movements.");
  const state = (road, color) => links.map(link => (link.from === "cross-in") === (road === "cross") ? color : "r").join("");
  const phases = [
    [green, state("avenue", "G")], [yellow, state("avenue", "y")], [allRed, "r".repeat(links.length)],
    [cycle - green - 2 * clearance, state("cross", "G")], [yellow, state("cross", "y")], [allRed, "r".repeat(links.length)]
  ];
  const program = `<tlLogic id="signal" type="static" programID="0" offset="0">
    ${phases.map(([duration, lights]) => `<phase duration="${duration}" state="${lights}"/>`).join("\n    ")}
  </tlLogic>`;
  const pattern = /<tlLogic id="signal"[^>]*>[\s\S]*?<\/tlLogic>/;
  if (!pattern.test(network)) throw new Error("SUMO did not build the signal.");
  return network.replace(pattern, program);
}

export function sumoArgs({ duration, step }) {
  return [
    "--net-file", "corridor.net.xml", "--route-files", "routes.xml", "--seed", "42",
    "--step-length", String(step), "--end", String(duration + step), "--fcd-output", "trace.xml",
    "--precision", "4", "--tripinfo-output", "trips.xml", "--tripinfo-output.write-unfinished",
    "--collision-output", "collisions.xml", "--collision.action", "warn", "--collision.check-junctions",
    "--collision.mingap-factor", "0", "--time-to-teleport", "-1", "--no-step-log", "--xml-validation", "never"
  ];
}

// These are controlled SUMO XML outputs. Read only the numeric attributes
// and identifiers needed by the comparison, including inside a worker.
function queueZoneFor(lane) {
  if (/^road-\d+-[fb]_/.test(lane)) return "Rebuilt network";
  if (lane.startsWith("road-")) return "Alder Avenue";
  return queueZones[lane.replace(/_\d+$/, "")] ?? "Junction";
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
}

export function sumoResult(request, layout, trace, trips, collisions) {
  const reports = [...trips.matchAll(/<tripinfo\s[^>]*>/g)].map(([tag]) => attributes(tag));
  const arrivals = reports.map(trip => Number(trip.arrival)).filter(time => time >= 0).sort((a, b) => a - b);
  const demand = new Map(request.trips.map(trip => [String(trip.id), trip]));
  const delay = report => Math.max(0, Number(report.timeLoss)) + Math.max(0, Number(report.departDelay));
  const averageDelay = matches => reports.reduce((sum, report) =>
    sum + (matches(demand.get(report.id)) ? delay(report) : 0), 0) / request.trips.filter(matches).length;
  const busDelay = averageDelay(trip => trip.kind === "bus");
  const crossDelay = averageDelay(trip => trip.origin === "cross");
  const finishedFrom = origin => reports.filter(report => Number(report.arrival) >= 0 && demand.get(report.id).origin === origin).length;
  const slipTrips = new Set();
  let finished = 0, longestQueue = 0, peakFrame = 0;
  const frames = [];
  for (const [, timeText, vehicles] of trace.matchAll(/<timestep time="([\d.]+)"\s*(?:\/>|>([\s\S]*?)<\/timestep>)/g)) {
    const time = Number(timeText);
    while (finished < arrivals.length && arrivals[finished] <= time) finished++;
    const queues = new Map();
    const markers = [];
    for (const [tag] of (vehicles ?? "").matchAll(/<vehicle\s[^>]*>/g)) {
      const car = attributes(tag);
      const length = request.types[car.type].length;
      const angle = (Number(car.angle) - 90) * Math.PI / 180;
      const speed = Number(car.speed);
      const reason = speed < 2.2 ? "Queued" : "";
      if (car.lane === "slip-road_0") slipTrips.add(Number(car.id));
      const zone = queueZoneFor(car.lane);
      if (reason) queues.set(car.lane, (queues.get(car.lane) ?? 0) + length + 2);
      markers.push({ id: Number(car.id), kind: car.type, speed, reason, zone, angle: +angle.toFixed(5),
        x: +((Number(car.x) - Math.cos(angle) * length / 2) / request.scale).toFixed(4),
        y: +((-Number(car.y) - Math.sin(angle) * length / 2) / request.scale).toFixed(4) });
    }
    let queueZone = "", queue = 0;
    for (const [lane, length] of queues) {
      if (length <= queue) continue;
      queue = length;
      queueZone = queueZoneFor(lane);
    }
    if (queue > longestQueue) {
      longestQueue = queue;
      peakFrame = frames.length;
    }
    frames.push({ markers, phase: signalPhase(time, layout.design.green, request.signalCycle), finished, longestQueue, queueZone });
  }
  if (frames.length !== Math.round(request.duration / request.step) + 1) throw new Error("SUMO returned an incomplete simulation.");
  return { design: layout.design, frames, results: { finished, waiting: request.trips.length - finished,
    longestQueue, peakFrame, busDelay, crossDelay,
    slipFinished: reports.filter(report => Number(report.arrival) >= 0 && slipTrips.has(Number(report.id))).length,
    unserved: request.trips.length - [...sumoInputs(request, layout)["routes.xml"].matchAll(/<vehicle /g)].length, crossFinished: finishedFrom("cross"), pickupFinished: finishedFrom("ramp"), collisions: [...collisions.matchAll(/<collision\s/g)].length } };
}
