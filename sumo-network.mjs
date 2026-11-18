import { avenueLanePath, avenueLaneX, avenuePieces, isLaneDrop, junctionLegs, junctionMovements, laneAnchoredCurve, laneDropTaper, movementKey, networkLaneSamples, networkLaneWidth, networkMergeSamples, networkNodeElevation, networkNodes, networkRoadGeometry, networkTerminals, roadElevationProfile, roadGrade, roundaboutLoops, scale, selectedLane, trafficShapeSamples, tripTerminals } from "./model.mjs";

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

function freeNetworkGraph(network) {
  const nodes = networkNodes(network);
  const terminals = networkTerminals(network);
  const outgoing = new Map();
  const incoming = new Map();
  const edges = [];
  const transitions = new Map();
  const addEdge = edge => {
    const { from, to, count } = edge;
    if (!count) return;
    if (!outgoing.has(from)) outgoing.set(from, []);
    if (!incoming.has(to)) incoming.set(to, []);
    outgoing.get(from).push(edge);
    incoming.get(to).push(edge);
    edges.push(edge);
  };
  for (const terminal of Object.values(terminals)) {
    const { id, x, y, dx, dy } = terminal;
    const boundary = { id: `${id}-boundary`, x: x + dx, y: y + dy };
    nodes.set(boundary.id, boundary);
    const length = Math.hypot(dx, dy);
    addEdge({ id: `${id}-in`, from: boundary.id, to: id, count: 1, speed: 9, length });
    addEdge({ id: `${id}-out`, from: id, to: boundary.id, count: 1, speed: 9, length });
  }
  for (const [index, road] of network.roads.entries()) {
    const geometry = networkRoadGeometry(road, nodes);
    const anchored = laneAnchoredCurve(road, network, nodes, geometry);
    const { speed, length } = anchored ?? geometry;
    addEdge({ id: `road-${index}-f`, index, from: road.a, to: road.b, count: road.forward, forward: true, road, geometry, speed, length });
    addEdge({ id: `road-${index}-b`, index, from: road.b, to: road.a, count: road.backward, forward: false, road, geometry, speed, length });
  }
  for (const [id, arrivals] of incoming) {
    if (id.endsWith("-boundary")) continue;
    const moves = nodes.get(id).control && junctionMovements(network, nodes.get(id));
    for (const from of arrivals) {
      const exits = (outgoing.get(id) ?? []).flatMap(to => {
        if (from.from === to.to) return [];
        const links = moves ? moves.filter(move => move.from === from.from && move.to === to.to) :
          Array.from({ length: from.count }, (_, fromLane) => ({
            fromLane, toLane: Math.min(to.count - 1, fromLane + Math.max(0, to.count - from.count))
          }));
        return links.map(link => ({ ...link, to }));
      });
      transitions.set(from.id, exits);
    }
  }
  return { nodes, terminals, edges, outgoing, transitions };
}

function routeBetween(graph, origin, destination) {
  const first = graph.outgoing.get(`${origin}-boundary`)?.[0];
  if (!first || !graph.terminals[destination]) return;
  // Each junction transition names the sending and receiving lanes. A vehicle
  // can change lanes within an edge, with SUMO deciding where it can do so.
  const pending = [{ edge: first, lane: 0, distance: 0, changes: 0, path: [first] }];
  const visited = new Set();
  while (pending.length) {
    pending.sort((a, b) => b.distance - a.distance || b.changes - a.changes);
    const { edge, lane, distance, changes, path } = pending.pop();
    const key = `${edge.id}_${lane}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (edge.id === `${destination}-out`) return path;
    for (const link of graph.transitions.get(edge.id) ?? []) {
      if (path.includes(link.to)) continue;
      pending.push({ edge: link.to, lane: link.toLane, distance: distance + link.to.length,
        changes: changes + Math.abs(lane - link.fromLane), path: [...path, link.to] });
    }
  }
}

function demandRoutes(trips, graph) {
  const movements = new Map();
  for (const trip of trips) {
    const [from, to] = tripTerminals(trip);
    const id = `${from}-to-${to}`;
    if (!movements.has(id)) movements.set(id, { from, to, trips: [], path: graph && routeBetween(graph, from, to) });
    movements.get(id).trips.push(trip);
  }
  return movements;
}

export function networkDemandPreview(network, trips, previousNetwork = network) {
  const routes = demandRoutes(trips, freeNetworkGraph(network));
  const previous = previousNetwork === network ? routes : demandRoutes(trips, freeNetworkGraph(previousNetwork));
  let scheduled = 0, lost = 0;
  const movements = [...routes].map(([id, { from, to, trips, path }]) => {
    const count = path ? trips.length : 0;
    const loss = !path && previous.get(id)?.path ? trips.length : 0;
    scheduled += count;
    lost += loss;
    return { from, to, demand: trips.length, scheduled: count, unserved: trips.length - count, lost: loss };
  });
  return { demand: trips.length, scheduled, unserved: trips.length - scheduled, lost, movements };
}

export function crossingDemandPreview(network, trips, nodeId, axes) {
  const routes = demandRoutes(trips, freeNetworkGraph(network));
  const axis = neighbor => axes.findIndex(pair => pair.includes(neighbor));
  let affected = 0;
  const movements = [];
  for (const { from, to, trips, path } of routes.values()) {
    const removed = path?.some((edge, index) => {
      if (edge.to !== nodeId || !path[index + 1]) return false;
      const approach = axis(edge.from), departure = axis(path[index + 1].to);
      return approach >= 0 && departure >= 0 && approach !== departure;
    });
    if (!removed) continue;
    affected += trips.length;
    movements.push({ from, to, demand: trips.length, affected: trips.length });
  }
  return { affected, movements };
}

export function rampDemandPreview(network, demand, rampId) {
  const graph = freeNetworkGraph(network);
  let scheduled = 0;
  const movements = [];
  for (const { from, to, trips, path } of demandRoutes(demand, graph).values()) {
    if (!rampId || !path?.some(edge => edge.road?.rampId === rampId)) continue;
    scheduled += trips.length;
    movements.push({ from, to, demand: trips.length, scheduled: trips.length });
  }
  return { scheduled, movements, weaves: findNetworkWeaves(network, graph)
    .filter(weave => weave.fromRamp === rampId || weave.toRamp === rampId) };
}

export function networkWeaves(network) {
  return findNetworkWeaves(network, freeNetworkGraph(network));
}

function findNetworkWeaves(network, { edges, transitions, nodes }) {
  const shortWeaveDistance = 80;
  const weaves = [];
  const lanePaths = new Map();
  const hostRoad = edge => edge.road && !edge.road.rampId && !edge.road.laneA && !edge.road.laneB && !edge.road.roundabout;
  const heading = (edge, start) => {
    const { samples } = edge.geometry;
    return (start === edge.forward ? samples[0] : samples.at(-1)).angle + (edge.forward ? 0 : Math.PI);
  };
  const lanePath = (edge, lane) => {
    const key = `${edge.id}_${lane}`;
    if (!lanePaths.has(key)) {
      const points = networkLaneSamples(edge.road, network, nodes, edge.forward, lane, edge.geometry);
      const distance = points.slice(1).reduce((sum, p, i) =>
        sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0) * scale;
      lanePaths.set(key, { key, edge, lane, distance, samples: trafficShapeSamples(points) });
    }
    return lanePaths.get(key);
  };
  for (const ramp of edges) {
    if (!ramp.road?.rampId || !ramp.road.laneB || !ramp.forward) continue;
    const fromRamp = ramp.road.rampId;
    const pending = [];
    const continueAlong = ({ to, toLane }, path, distance) => {
      const segment = lanePath(to, toLane);
      pending.push({ segment, distance: distance + segment.distance, path: [...path, segment] });
    };
    for (const link of transitions.get(ramp.id) ?? []) {
      if (hostRoad(link.to)) continueAlong(link, [], 0);
    }
    const visited = new Set();
    while (pending.length) {
      pending.sort((a, b) => b.distance - a.distance);
      const { segment: { edge, lane, key }, distance, path } = pending.pop();
      if (visited.has(key)) continue;
      visited.add(key);
      const links = transitions.get(edge.id) ?? [];
      const exit = links.find(({ to }) => to.road?.rampId && to.road.rampId !== fromRamp && to.road.laneA);
      if (exit) {
        const toRamp = exit.to.road.rampId;
        weaves.push({ id: `${fromRamp}-${toRamp}`, fromRamp, toRamp, distance, short: distance <= shortWeaveDistance,
          fromLane: path[0].lane, toLane: exit.fromLane,
          roadIndices: path.map(({ edge }) => edge.index),
          hostLanes: path.map(({ edge, lane }) => ({ roadIndex: edge.index, forward: edge.forward, lane })),
          samples: path.flatMap(({ samples }) => samples) });
        break;
      }
      for (const link of links) {
        if (hostRoad(link.to) && link.fromLane === lane && Math.cos(heading(edge, false) - heading(link.to, true)) >= .72) {
          continueAlong(link, path, distance);
        }
      }
    }
  }
  return weaves;
}

function freeNetworkInputs(request, network) {
  const graph = freeNetworkGraph(network);
  const { nodes, edges, transitions } = graph;
  const explicitJunctions = new Set();
  const laneDrops = new Map(network.nodes.filter(node => isLaneDrop(network, node)).map(node => [
    node.id, new Map(junctionLegs(network, node.id, nodes).map(leg => [leg.neighbor, leg]))
  ]));
  const usesApproachRules = node => node.control === "priority" || !node.control;
  const shape = points => points.map(point => [point.x * request.scale, -point.y * request.scale,
    ...(point.z === undefined ? [] : [point.z])].map(value => value.toFixed(4)).join(",")).join(" ");
  const edgeXml = edges.map(({ id, from, to, count, speed, road, geometry, forward }) => {
    const rule = forward ? road?.atB : road?.atA;
    const control = usesApproachRules(nodes.get(to)) ? rule ?? "default" : "default";
    const priority = forward && road?.roundabout ? 4 : { default: 2, priority: 3, yield: 1, stop: 1 }[control];
    if (control !== "default") explicitJunctions.add(to);
    const height = road && roadElevationProfile(network, road, geometry.length);
    const elevations = samples => {
      const points = trafficShapeSamples(samples);
      return road && (road.rampId || roadGrade(road)) ? points.map(point => ({ ...point, z: height(point.length) })) : points;
    };
    const centerline = road ? elevations(geometry.samples) : [nodes.get(from), nodes.get(to)];
    const points = road && !forward ? [...centerline].reverse() : centerline;
    const tag = element("edge", { id, from, to, shape: shape(points), speed, priority, numLanes: count,
      width: networkLaneWidth * request.scale, spreadType: "right" });
    if (!road) return tag;
    const lanes = Array.from({ length: count }, (_, index) => element("lane", { index,
      shape: shape(elevations(networkLaneSamples(road, network, nodes, forward, index, geometry))) }));
    return tag.slice(0, -2) + ">" + lanes.join("") + "</edge>";
  });
  const connections = edges.flatMap(from => {
    const node = nodes.get(from.to);
    const links = transitions.get(from.id) ?? [];
    if (node.control === "yield" || usesApproachRules(node) && links.some(link => link.rule && link.rule !== "default")) {
      explicitJunctions.add(node.id);
    }
    if (!links.length && node.control) return [element("connection", { from: from.id })];
    const legs = laneDrops.get(node.id);
    const fromLeg = legs?.get(from.from);
    const drops = fromLeg ? laneDropTaper(network, fromLeg.road, nodes, !fromLeg.atA) : [];
    return links.map(({ to, fromLane, toLane }) => {
      const toLeg = legs?.get(to.to);
      const taper = toLeg && drops.includes(fromLane) ?
        shape(networkMergeSamples(network, fromLeg, toLeg, nodes, fromLane, toLane)) : undefined;
      return element("connection", { from: from.id, to: to.id, fromLane, toLane, ...(taper ? { shape: taper } : {}) });
    });
  });
  const movements = demandRoutes(request.trips, graph);
  const routes = Object.entries(request.types).map(([id, dimensions]) =>
    element("vType", { id, ...dimensions, accel: id === "bus" ? 1.05 : 2.1, decel: 4.5,
      sigma: 0, minGap: 2, maxSpeed: 12, speedFactor: 1, speedDev: 0 }));
  for (const [id, { path }] of movements) {
    if (path) routes.push(element("route", { id, edges: path.map(edge => edge.id).join(" ") }));
  }
  for (const trip of request.trips) {
    const [origin, destination] = tripTerminals(trip);
    const id = `${origin}-to-${destination}`;
    if (movements.get(id).path) routes.push(element("vehicle", {
      id: trip.id, type: trip.kind, route: id, depart: trip.time.toFixed(2), departSpeed: 0, departPos: "base", departLane: "best"
    }));
  }
  const loops = [...roundaboutLoops(network).values()];
  const entries = new Set(loops.flat().map(road => road.a));
  return {
    "nodes.xml": wrap("nodes", [...nodes.values()].map(node => {
      const z = networkNodeElevation(network, node.id);
      const explicit = entries.has(node.id) || explicitJunctions.has(node.id);
      return element("node", { id: node.id, x: node.x * request.scale, y: -node.y * request.scale,
        ...(z ? { z } : {}),
        type: explicit ? "priority" : laneDrops.has(node.id) ? "zipper" : node.control === "priority" ? "right_before_left" : node.control ?? "priority",
        ...(explicit ? { rightOfWay: "edgePriority" } : {}) });
    })),
    "edges.xml": wrap("edges", [...edgeXml, ...loops.map(roads => element("roundabout", {
      edges: roads.map(road => `road-${network.roads.indexOf(road)}-f`).join(" ")
    }))]),
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
  const stopEdges = new Set(), directions = new Map();
  for (const [index, road] of design.network.roads.entries()) {
    for (const [suffix, from, to, rule] of [["f", road.a, road.b, road.atB], ["b", road.b, road.a, road.atA]]) {
      const id = `road-${index}-${suffix}`;
      directions.set(id, { from, to });
      const junction = nodes.get(to);
      if (rule === "stop" && junction.control === "priority" && !junction.movements && !junction.laneRules) stopEdges.add(id);
    }
  }
  const custom = new Map(design.network.nodes.flatMap(node => {
    if (node.control !== "priority" && node.control !== "yield") return [];
    const moves = junctionMovements(design.network, node);
    if (!moves.length || node.control !== "yield" && !node.movements && !node.laneRules) return [];
    return [[node.id, new Map(moves.map(move => [movementKey(move), node.control === "yield" ? "yield" : move.rule]))]];
  }));
  if (!custom.size && !stopEdges.size) return network;
  const byInternalLane = new Map();
  const links = [...network.matchAll(/<connection\s[^>]+>/g)].map(([tag]) => ({ tag, ...attributes(tag) }));
  const continuations = new Map(links.filter(link => link.from.startsWith(":") && link.via)
    .map(link => [`${link.from}_${link.fromLane}`, link.via]));
  for (const link of links) {
    const from = directions.get(link.from), to = directions.get(link.to);
    const rules = custom.get(from?.to);
    if (!rules || !to || !link.via) continue;
    const key = movementKey({ from: from.from, to: to.to, fromLane: link.fromLane, toLane: link.toLane });
    const movement = { tag: link.tag, rule: rules.get(key) ?? "default" };
    byInternalLane.set(link.via, movement);
    if (continuations.has(link.via)) byInternalLane.set(continuations.get(link.via), movement);
  }
  const states = new Map();
  const rank = { stop: 0, yield: 0, default: 1, priority: 2 };
  const withPriority = network.replace(/<junction\s[^>]+(?<!\/)>[\s\S]*?<\/junction>/g, junction => {
    const header = attributes(junction.slice(0, junction.indexOf(">")));
    if (!custom.has(header.id)) return junction;
    const links = header.intLanes.split(" ").map(lane => byInternalLane.get(lane));
    return junction.replace(/<request\s[^>]+>/g, request => {
      const { index, foes, response } = attributes(request);
      const link = links[Number(index)];
      if (!link || foes.length !== links.length) return request;
      const updated = [...response].map((value, i) => {
        const foe = links[links.length - 1 - i];
        if (!foe || foes[i] !== "1" || rank[foe.rule] === rank[link.rule]) return value;
        return rank[foe.rule] > rank[link.rule] ? "1" : "0";
      }).join("");
      states.set(link.tag, link.rule === "stop" ? "s" : link.rule === "yield" || updated.includes("1") ? "m" : "M");
      return request.replace(/\bresponse="[^"]*"/, `response="${updated}"`);
    });
  });
  return withPriority.replace(/<connection\s[^>]+>/g, tag => {
    const state = states.get(tag) ?? (stopEdges.has(attributes(tag).from) ? "s" : undefined);
    return state ? tag.replace(/\bstate="[^"]*"/, `state="${state}"`) : tag;
  });
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

export function signalOutputRequest(network) {
  return /<tlLogic\s/.test(network)
    ? '<additional><timedEvent type="SaveTLSSwitchStates" dest="signals.xml"/></additional>'
    : undefined;
}

export function sumoArgs({ duration, step }, traceSignals = false) {
  return [
    "--net-file", "corridor.net.xml", "--route-files", "routes.xml", "--seed", "42",
    "--step-length", String(step), "--end", String(duration + step), "--fcd-output", "trace.xml",
    "--precision", "4", "--tripinfo-output", "trips.xml", "--tripinfo-output.write-unfinished",
    "--collision-output", "collisions.xml", "--collision.action", "warn", "--collision.check-junctions",
    "--collision.mingap-factor", "0", "--time-to-teleport", "-1", "--no-step-log", "--xml-validation", "never",
    ...(traceSignals ? ["--additional-files", "signals.add.xml"] : [])
  ];
}

// These are controlled SUMO XML outputs. Read only the numeric attributes
// and identifiers needed by the comparison, including inside a worker.
function queueZoneFor(lane, network) {
  const terminals = networkTerminals(network);
  const segment = /^road-(\d+)-([fb])_/.exec(lane);
  if (segment && network) {
    const road = network.roads[Number(segment[1])];
    if (!road) return "Road junction";
    const [from, to] = segment[2] === "f" ? [road.a, road.b] : [road.b, road.a];
    const label = id => terminals[id]?.name ?? `Junction ${id.slice(1)}`;
    const structure = road.rampId ? "Ramp" : road.roundabout ? "Roundabout" : road.grade === 1 ? "Overpass" : road.grade === -1 ? "Underpass" : road.laneA || road.laneB ? "Slip lane" : "";
    return `${structure ? `${structure} · ` : ""}${label(from)} → ${label(to)}`;
  }
  const junction = /^:(j\d+)_/.exec(lane);
  if (junction) return `Junction ${junction[1].slice(1)}`;
  const boundary = /^(\w+)-(?:in|out)_/.exec(lane);
  if (network && terminals[boundary?.[1]]) return `${terminals[boundary[1]].name} connection`;
  if (lane.startsWith("road-")) return "Alder Avenue";
  return queueZones[lane.replace(/_\d+$/, "")] ?? "Junction";
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
}

function signalReplay(network, output, scale) {
  if (!network || !output) return [];
  const signals = new Map();
  for (const [tag] of output.matchAll(/<tlsState\s[^>]*>/g)) {
    const { id, time, state } = attributes(tag);
    if (!signals.has(id)) signals.set(id, { lanes: new Map(), switches: [] });
    signals.get(id).switches.push({ time: Number(time), state });
  }
  const laneIndex = new Map();
  for (const [tag] of network.matchAll(/<lane\s[^>]*>/g)) {
    const { id, shape } = attributes(tag);
    if (!id || !shape || id.startsWith(":")) continue;
    const [before, end] = shape.trim().split(/\s+/).slice(-2).map(pair => pair.split(",").map(Number));
    if (before && end) laneIndex.set(id, {
      x: end[0] / scale, y: -end[1] / scale,
      angle: Math.atan2(before[1] - end[1], end[0] - before[0]) * 180 / Math.PI
    });
  }
  for (const [tag] of network.matchAll(/<connection\s[^>]*>/g)) {
    const { from, fromLane, tl, linkIndex } = attributes(tag);
    const signal = signals.get(tl);
    const id = `${from}_${fromLane}`;
    const position = laneIndex.get(id);
    if (!signal || !position || linkIndex === undefined) continue;
    if (!signal.lanes.has(id)) signal.lanes.set(id, { ...position, links: new Set() });
    signal.lanes.get(id).links.add(Number(linkIndex));
  }
  return [...signals.values()].filter(signal => signal.lanes.size).map(({ lanes, switches }) => ({
    lanes: [...lanes.values()].map(lane => ({ ...lane, links: [...lane.links].sort((a, b) => a - b) })),
    switches
  }));
}

export function sumoResult(request, layout, trace, trips, collisions, network, signalOutput) {
  const reports = [...trips.matchAll(/<tripinfo\s[^>]*>/g)].map(([tag]) => attributes(tag));
  const arrivals = reports.map(trip => Number(trip.arrival)).filter(time => time >= 0).sort((a, b) => a - b);
  const demand = new Map(request.trips.map(trip => [String(trip.id), trip]));
  const delay = report => Math.max(0, Number(report.timeLoss)) + Math.max(0, Number(report.departDelay));
  const averageDelay = matches => reports.reduce((sum, report) =>
    sum + (matches(demand.get(report.id)) ? delay(report) : 0), 0) / Math.max(1, request.trips.filter(matches).length);
  const busDelay = averageDelay(trip => trip.kind === "bus");
  const crossDelay = averageDelay(trip => trip.origin === "cross");
  const finishedFrom = origin => reports.filter(report => Number(report.arrival) >= 0 && demand.get(report.id).origin === origin).length;
  const northFinished = reports.filter(report => Number(report.arrival) >= 0 && tripTerminals(demand.get(report.id))[1] === "north").length;
  const graph = layout.design.network && freeNetworkGraph(layout.design.network);
  const routedDemand = graph && demandRoutes(request.trips, graph);
  const vehicleTags = graph ? [] : [...sumoInputs(request, layout)["routes.xml"].matchAll(/<vehicle\s[^>]*>/g)];
  const scheduledTrips = new Set(routedDemand ?
    [...routedDemand.values()].flatMap(({ path, trips }) => path ? trips.map(trip => String(trip.id)) : []) :
    vehicleTags.map(([tag]) => attributes(tag).id));
  const reportByTrip = new Map(reports.map(report => [report.id, report]));
  const completed = id => Number(reportByTrip.get(id)?.arrival) >= 0;
  const entered = id => Number(reportByTrip.get(id)?.depart) >= 0;
  const movementResults = [...(routedDemand ?? demandRoutes(request.trips)).values()]
    .map(({ from, to, trips }) => {
      const ids = trips.map(trip => String(trip.id));
      const scheduled = ids.filter(id => scheduledTrips.has(id)).length;
      const observed = ids.filter(entered);
      return { from, to, demand: ids.length, scheduled, entered: observed.length,
        completed: ids.filter(completed).length, unserved: ids.length - scheduled,
        averageDelay: observed.reduce((sum, id) => sum + delay(reportByTrip.get(id)), 0) / Math.max(1, observed.length) };
    });
  const ramps = new Map(), rampByLane = new Map(), laneReports = new Map();
  for (const edge of graph?.edges ?? []) {
    const id = edge.road?.rampId;
    if (!id) continue;
    if (!ramps.has(id)) ramps.set(id, { id, from: edge.from, to: edge.to, lanes: new Set(), trips: new Set(), scheduled: 0 });
    const ramp = ramps.get(id);
    if (edge.road.laneA) ramp.from = edge.from;
    if (edge.road.laneB) ramp.to = edge.to;
    for (let index = 0; index < edge.count; index++) {
      const lane = `${edge.id}_${index}`;
      rampByLane.set(lane, ramp);
      ramp.lanes.add(lane);
    }
  }
  for (const { trips, path } of routedDemand?.values() ?? []) {
    const ids = new Set((path ?? []).flatMap(edge => edge.road?.rampId ? [edge.road.rampId] : []));
    for (const id of ids) ramps.get(id).scheduled += trips.length;
  }
  const weaves = graph ? findNetworkWeaves(layout.design.network, graph) : [];
  const slipEdges = new Set(["slip-road"]);
  layout.design.network?.roads.forEach((road, index) => {
    if (road.rampId || !road.laneA && !road.laneB) return;
    if (road.forward) slipEdges.add(`road-${index}-f`);
    if (road.backward) slipEdges.add(`road-${index}-b`);
  });
  const slipTrips = new Set();
  let finished = 0, longestQueue = 0, peakFrame = 0;
  const frames = [];
  const roadGrades = new Map();
  layout.design.network?.roads.forEach((road, index) => {
    if (roadGrade(road)) for (const [suffix, count] of [["f", road.forward], ["b", road.backward]]) {
      for (let lane = 0; lane < count; lane++) roadGrades.set(`road-${index}-${suffix}_${lane}`, road.grade);
    }
  });
  const queueZonesByLane = new Map();
  const zoneForLane = lane => {
    if (!queueZonesByLane.has(lane)) queueZonesByLane.set(lane, queueZoneFor(lane, layout.design.network));
    return queueZonesByLane.get(lane);
  };
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
      if (slipEdges.has(car.lane.slice(0, car.lane.lastIndexOf("_")))) slipTrips.add(Number(car.id));
      const zone = zoneForLane(car.lane);
      const grade = roadGrades.get(car.lane) ?? (Math.abs(Number(car.z)) > .5 ? Math.sign(Number(car.z)) : 0);
      const ramp = rampByLane.get(car.lane);
      if (ramp) ramp.trips.add(car.id);
      if (reason) queues.set(car.lane, (queues.get(car.lane) ?? 0) + length + 2);
      markers.push({ id: Number(car.id), kind: car.type, speed, reason, zone, lane: car.lane, angle: +angle.toFixed(5), ...(grade ? { grade } : {}),
        ...(ramp ? { rampId: ramp.id } : {}),
        x: +((Number(car.x) - Math.cos(angle) * length / 2) / request.scale).toFixed(4),
        y: +((-Number(car.y) - Math.sin(angle) * length / 2) / request.scale).toFixed(4) });
    }
    let queueLane = "", queue = 0;
    for (const [lane, length] of queues) {
      if (length > (laneReports.get(lane)?.peakQueue ?? 0)) laneReports.set(lane, { lane, peakQueue: length, peakFrame: frames.length });
      if (length <= queue) continue;
      queue = length;
      queueLane = lane;
    }
    if (queue > longestQueue) {
      longestQueue = queue;
      peakFrame = frames.length;
    }
    frames.push({ markers, phase: signalPhase(time, layout.design.green, request.signalCycle), finished, longestQueue, queueLane,
      queueZone: queueLane ? zoneForLane(queueLane) : "" });
  }
  if (frames.length !== Math.round(request.duration / request.step) + 1) throw new Error("SUMO returned an incomplete simulation.");
  const lanePeak = lanes => [...lanes].reduce((peak, lane) => {
    const candidate = laneReports.get(lane);
    return candidate?.peakQueue > peak.peakQueue ?
      { peakQueue: candidate.peakQueue, peakFrame: candidate.peakFrame, peakLane: lane } : peak;
  }, { peakQueue: 0, peakFrame: 0, peakLane: "" });
  const rampResults = [...ramps.values()].map(({ id, from, to, scheduled, trips, lanes }) =>
    ({ id, from, to, scheduled, entered: trips.size, completed: [...trips].filter(completed).length, ...lanePeak(lanes),
      lanes: [...lanes].map(lane => laneReports.get(lane) ?? { lane, peakQueue: 0, peakFrame: 0 }) }));
  const weaveResults = weaves.map(({ id, fromRamp, toRamp, distance, short, hostLanes }) =>
    ({ id, fromRamp, toRamp, distance, short, ...lanePeak(hostLanes.map(({ roadIndex, forward, lane }) =>
      `road-${roadIndex}-${forward ? "f" : "b"}_${lane}`)) }));
  return { design: layout.design, frames, signals: signalReplay(network, signalOutput, request.scale), results: { finished, waiting: request.trips.length - finished,
    longestQueue, peakFrame, busDelay, crossDelay, northFinished,
    slipFinished: reports.filter(report => Number(report.arrival) >= 0 && slipTrips.has(Number(report.id))).length,
    unserved: request.trips.length - scheduledTrips.size, crossFinished: finishedFrom("cross"), pickupFinished: finishedFrom("ramp"),
    collisions: [...collisions.matchAll(/<collision\s/g)].length, movements: movementResults, ramps: rampResults, weaves: weaveResults } };
}
