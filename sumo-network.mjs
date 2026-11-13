// Build the same School Pickup network used by the native SUMO runner.
// Inputs are generated internally by sumoRequest.
export function sumoInputs(request, layout) {
  const { world, scale, signal: timing } = request;
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
  node("join", outer, join, main ? "zipper" : "priority");
  node("pickup", ...curves[0].points[0], "dead_end");
  edge("avenue", "south", "join", [[outer, south], [outer, join]]);
  edge("inner", "inner-south", "signal", [[inner, south], [inner, signal]]);
  edge("inner-exit", "signal", "inner-north", [[inner, signal], [inner, north]]);
  edge("exit", "signal", "north", [[outer, signal], [outer, north]]);
  edge("approach", "join", auxiliary ? "taper" : "signal", [[outer, join], [outer, auxiliary ? end : signal]]);
  connect("avenue", "approach", { visibility: 25 });
  connect(auxiliary ? "downstream" : "approach", "exit");
  connect("inner", "inner-exit");
  const pickup = curves[main ? 0 : 1];
  edge("pickup-road", "pickup", "join", pickup.points, pickup.speed);
  if (main) connect("pickup-road", "approach", { visibility: 25 });
  if (auxiliary) {
    node("taper", outer, end, "zipper");
    edge("merge-lane", "join", "taper", [[world.auxiliary, join], ...taper], 8);
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
  if (main) routes.push(element("route", { id: "direct", edges: `pickup-road ${onward}` }));
  if (auxiliary) routes.push(element("route", { id: "merge", edges: "pickup-road merge-lane downstream exit" }));
  for (const trip of request.trips) {
    const direct = main && (!auxiliary || trip.pickupIndex % 2 === 0);
    const route = trip.origin === "ramp" ? (direct ? "direct" : "merge") : trip.origin;
    routes.push(element("vehicle", { id: trip.id, type: trip.kind, route, depart: trip.time.toFixed(2), departSpeed: 0, departPos: "base" }));
  }
  const tls = `<tlLogic id="signal" type="static" programID="0" offset="0">
    <phase duration="${timing.green}" state="GG"/>
    <phase duration="${timing.cycle - timing.green}" state="rr"/>
  </tlLogic>`;
  return {
    "nodes.xml": wrap("nodes", nodes), "edges.xml": wrap("edges", edges),
    "connections.xml": wrap("connections", connections), "signal.xml": wrap("tlLogics", [tls]),
    "routes.xml": wrap("routes", routes)
  };
}

export const netconvertArgs = [
  "--node-files", "nodes.xml", "--edge-files", "edges.xml", "--connection-files", "connections.xml",
  "--tllogic-files", "signal.xml", "--offset.disable-normalization", "--output-file", "corridor.net.xml"
];

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
  const busDelay = reports.filter(trip => trip.vType === "bus").reduce((sum, trip) =>
    sum + Math.max(0, Number(trip.timeLoss)) + Math.max(0, Number(trip.departDelay)), 0) /
    request.trips.filter(trip => trip.kind === "bus").length;
  let finished = 0, longestQueue = 0;
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
      if (reason) queues.set(car.lane, (queues.get(car.lane) ?? 0) + length + 2);
      markers.push({ id: Number(car.id), kind: car.type, speed, reason, angle: +angle.toFixed(5),
        x: +((Number(car.x) - Math.cos(angle) * length / 2) / request.scale).toFixed(4),
        y: +((-Number(car.y) - Math.sin(angle) * length / 2) / request.scale).toFixed(4) });
    }
    longestQueue = Math.max(longestQueue, ...queues.values());
    frames.push({ markers, green: time % request.signal.cycle < request.signal.green, finished, longestQueue });
  }
  if (frames.length !== Math.round(request.duration / request.step) + 1) throw new Error("SUMO returned an incomplete simulation.");
  return { design: layout.design, frames, results: { finished, waiting: request.trips.length - finished,
    longestQueue, busDelay, collisions: [...collisions.matchAll(/<collision\s/g)].length } };
}
