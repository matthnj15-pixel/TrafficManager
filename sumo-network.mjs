// Shared School Pickup network for browser and native SUMO.
// Inputs are generated internally by sumoRequest.
export const yellow = 3;
export const allRed = 2;
export const clearance = yellow + allRed;
export const queueZones = {
  "pickup-road": "Pickup loop", "merge-lane": "Merge lane", avenue: "Alder Avenue",
  inner: "Alder Avenue", approach: "Alder Avenue", downstream: "Alder Avenue", "cross-in": "Cross street"
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

export function sumoInputs(request, layout) {
  const { world, scale } = request;
  const { design, curves, taper } = layout;
  const main = design.lanes & 1;
  const auxiliary = design.lanes & 2;
  const nodes = [], edges = [], connections = [], routes = [];
  const element = (tag, attributes) => `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(" ")}/>`;
  const wrap = (tag, items) => `<${tag}>\n${items.join("\n")}\n</${tag}>\n`;
  const node = (id, x, y, type = "priority") =>
    nodes.push(element("node", { id, x: x * scale, y: -y * scale, type, radius: .5 }));
  const edge = (id, from, to, points, speed = 14) => {
    const shape = points.map(([x, y]) => `${(x * scale).toFixed(4)},${(-y * scale).toFixed(4)}`).join(" ");
    edges.push(element("edge", { id, from, to, shape, speed, spreadType: "center", numLanes: 1 }));
  };
  const connect = (from, to, options = {}) =>
    connections.push(element("connection", { from, to, fromLane: 0, toLane: 0, ...options }));
  const { outer, inner, south, signal, north } = world;
  const { node: join, mergeEnd: end } = design;
  node("south", outer, south, "dead_end");
  node("inner-south", inner, south, "dead_end");
  node("inner-north", inner, north, "dead_end");
  node("north", outer, north, "dead_end");
  node("signal", outer, signal, "traffic_light");
  node("cross-west", 40, signal, "dead_end");
  node("cross-east", 488, signal, "dead_end");
  node("join", outer, join, main ? "zipper" : "priority");
  node("pickup", ...curves[0].points[0], "dead_end");
  edge("avenue", "south", "join", [[outer, south], [outer, join]]);
  edge("inner", "inner-south", "signal", [[inner, south], [inner, signal]]);
  edge("inner-exit", "signal", "inner-north", [[inner, signal], [inner, north]]);
  edge("exit", "signal", "north", [[outer, signal], [outer, north]]);
  edge("approach", "join", auxiliary ? "taper" : "signal", [[outer, join], [outer, auxiliary ? end : signal]]);
  connect("avenue", "approach", { visibility: 25 });
  edge("cross-in", "cross-west", "signal", [[40, signal], [outer, signal]], 12);
  edge("cross-out", "signal", "cross-east", [[outer, signal], [488, signal]], 12);
  connect(auxiliary ? "downstream" : "approach", "exit");
  connect("inner", "inner-exit");
  connect("cross-in", "cross-out");
  const pickup = curves[main ? 0 : 1];
  edge("pickup-road", "pickup", "join", pickup.points, pickup.speed);
  if (main) connect("pickup-road", "approach", { visibility: 25 });
  if (auxiliary) {
    node("taper", outer, end, "zipper");
    edge("merge-lane", "join", "taper", [[world.auxiliary, join], ...taper], layout.taperSpeed);
    edge("downstream", "taper", "signal", [[outer, end], [outer, signal]]);
    connect("pickup-road", "merge-lane");
    connect("approach", "downstream", { visibility: 25 });
    connect("merge-lane", "downstream", { visibility: 25 });
  }
  for (const [id, dimensions] of Object.entries(request.types)) {
    const bus = id === "bus";
    routes.push(element("vType", { id, ...dimensions, vClass: bus ? "bus" : "passenger", minGap: 2,
      sigma: 0, tau: 1, accel: bus ? 1.05 : 2.1, decel: 4.5, maxSpeed: bus ? 12 : 14, speedFactor: 1, speedDev: 0 }));
  }
  const onward = auxiliary ? "approach downstream exit" : "approach exit";
  routes.push(element("route", { id: "outer", edges: `avenue ${onward}` }));
  routes.push(element("route", { id: "inner", edges: "inner inner-exit" }));
  routes.push(element("route", { id: "cross", edges: "cross-in cross-out" }));
  if (main) routes.push(element("route", { id: "direct", edges: `pickup-road ${onward}` }));
  if (auxiliary) routes.push(element("route", { id: "merge", edges: "pickup-road merge-lane downstream exit" }));
  for (const trip of request.trips) {
    const direct = main && (!auxiliary || trip.pickupIndex % 2 === 0);
    const route = trip.origin === "ramp" ? (direct ? "direct" : "merge") : trip.origin;
    routes.push(element("vehicle", { id: trip.id, type: trip.kind, route, depart: trip.time.toFixed(2), departSpeed: 0, departPos: "base" }));
  }
  return {
    "nodes.xml": wrap("nodes", nodes), "edges.xml": wrap("edges", edges),
    "connections.xml": wrap("connections", connections), "routes.xml": wrap("routes", routes)
  };
}

export const netconvertArgs = [
  "--node-files", "nodes.xml", "--edge-files", "edges.xml", "--connection-files", "connections.xml",
  "--offset.disable-normalization", "--output-file", "corridor.net.xml"
];

export function configureSignal(network, green, cycle) {
  // Netconvert assigns indices by junction geometry. Read them before setting phases.
  const links = [...network.matchAll(/<connection\s[^>]*>/g)].map(([tag]) => attributes(tag))
    .filter(link => link.tl === "signal").sort((a, b) => a.linkIndex - b.linkIndex);
  if (links.length !== 3 || links.filter(link => link.from === "cross-in").length !== 1 ||
      links.some((link, i) => Number(link.linkIndex) !== i)) throw new Error("Unexpected SUMO signal movements.");
  const state = (road, color) => links.map(link => (link.from === "cross-in") === (road === "cross") ? color : "r").join("");
  const phases = [
    [green, state("avenue", "G")], [yellow, state("avenue", "y")], [allRed, "rrr"],
    [cycle - green - 2 * clearance, state("cross", "G")], [yellow, state("cross", "y")], [allRed, "rrr"]
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
      const zone = queueZones[car.lane.replace(/_0$/, "")] ?? "Junction";
      if (reason) queues.set(car.lane, (queues.get(car.lane) ?? 0) + length + 2);
      markers.push({ id: Number(car.id), kind: car.type, speed, reason, zone, angle: +angle.toFixed(5),
        x: +((Number(car.x) - Math.cos(angle) * length / 2) / request.scale).toFixed(4),
        y: +((-Number(car.y) - Math.sin(angle) * length / 2) / request.scale).toFixed(4) });
    }
    let queueZone = "", queue = 0;
    for (const [lane, length] of queues) {
      if (length <= queue) continue;
      queue = length;
      queueZone = queueZones[lane.replace(/_0$/, "")] ?? "Junction";
    }
    if (queue > longestQueue) {
      longestQueue = queue;
      peakFrame = frames.length;
    }
    frames.push({ markers, phase: signalPhase(time, layout.design.green, request.signalCycle), finished, longestQueue, queueZone });
  }
  if (frames.length !== Math.round(request.duration / request.step) + 1) throw new Error("SUMO returned an incomplete simulation.");
  return { design: layout.design, frames, results: { finished, waiting: request.trips.length - finished,
    longestQueue, peakFrame, busDelay, crossDelay, crossFinished: finishedFrom("cross"), pickupFinished: finishedFrom("ramp"), collisions: [...collisions.matchAll(/<collision\s/g)].length } };
}
