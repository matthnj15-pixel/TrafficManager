import { readSumoComparison, sumoRequest } from "./sumo-export.mjs";
import { clearance } from "./sumo-network.mjs";
import { avenueAnchors, avenueLanePath, avenueLaneX, avenuePieces, avenueSegmentAt, avenueSegments, laneSpacing, roadPresets, selectedLane, baseline, world, curve, duration, step, validate, greenBounds, mergeEndBounds, mergeTaper, normalizeDesign, replayMarkers, scale, schoolEntry, signalCycle, slipGeometry, slipStartMax, taperLengthBounds, vehicleDimensions, networkLaneWidth, networkNodeIssue, networkNodes, networkRoadGeometry, networkRoadIssue, scheduledTrips, terminals, trees, tripTerminals } from "./model.mjs";

const $ = selector => document.querySelector(selector);
const map = $("#map");
const inspector = $("#inspector");
const appPath = new URL(".", import.meta.url).pathname;
const storageKey = appPath.includes("/previews/")
  ? `traffic-manager.school-pickup.v1:${appPath}`
  : "traffic-manager.school-pickup.v1";
let original;
let originalCache;
const history = [];
const icons = {
  road: '<path d="M5 22 8 2m11 20L16 2M12 3v4m0 3v4m0 3v4"/>',
  move: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
  curve: '<path d="M5 18C15 18 8 6 19 6"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/>',
  slip: '<path d="M5 22V3m0 14c5 0 4-10 16-10m-3-3 3 3-3 3"/>',
  junction: '<path d="M5 22V2m-3 3 3-3 3 3m-3 13c5 0 4-10 16-10m-3-3 3 3-3 3"/>',
  signal: '<rect x="6" y="2" width="12" height="20" rx="4"/><circle cx="12" cy="7" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="17" r="1"/>',
  lanes: '<path d="M6 21V4m-3 3 3-3 3 3m4 14v-7q0-7 8-7m-3-3 3 3-3 3"/>',
  design: '<path d="m3 9 9-5 9 5-9 5zm0 4 9 5 9-5M3 17l9 5 9-5"/>',
  simulate: '<path d="m7 4 14 8-14 8z"/>',
  results: '<path d="M5 20v-7m7 7V4m7 16V9"/>'
};
const comparisonViewBox = "150 130 330 345";
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
document.querySelectorAll("[data-tool]").forEach(button => { button.innerHTML = icon(button.dataset.tool); });
document.querySelectorAll("[data-view]").forEach(button => { button.innerHTML = icon(button.dataset.view) + button.textContent; });
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
let design = readSave();
let draft = { ...design };
let view = "design";
let tool = draft.network ? "road" : "move";
let laneSelected = false;
let drag;
let slipAnchor;
let selectedJunction;
let roadSelected;
let roadStart;
let roadMode = "select";
let roadDrag;
let roadDrawPointer;
let roadMessage = "";
let freeStart;
let freeRoad;
let freeNode;
let freeDrag;
let demandTerminal;
let terminalHold;
const demandTrips = scheduledTrips(true);
let inspectorCollapsed = false;
let camera;
const mapPointers = new Map();
let cameraGesture;
let suppressMapClick = false;
let currentRun;
let time = 0;
let playing = false;
let comparing = true;
let sumoWorker;
let sumoMessage = "";
let highlightQueues = false;
let previousFrame = 0;
let animationId;

function readSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (validate(saved)) return normalizeDesign(saved);
  } catch { /* A missing or unreadable save opens the original corridor. */ }
  return { ...baseline };
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(design));
  } catch {
    $("#subtitle").textContent = "Storage unavailable. Edits last for this session.";
  }
}

function mapPoint(event) {
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(map.getScreenCTM().inverse());
}

const scenery = `
  <defs><marker id="lane-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#c4f8ff"/></marker></defs>
  <rect x="-400" y="-600" width="1300" height="2000" fill="#d4dece"/>
  <path d="M0 86H211V318H0ZM329 94H500V326H329ZM0 513H208V700H0ZM335 511H500V700H335Z" fill="#e1e6d8"/>
  <path d="M27 105H212V309H27Z" fill="#c8d5bd"/>
  <path d="M48 190H131V216H48Z M143 200H199V237H143Z M36 540H126V604H36Z M358 116H406V164H358Z M371 254H431V283H371Z" fill="#eee5d3" stroke="#a9a694" stroke-width="1.3"/>
  <path d="M64 196H104V203H64Z M151 211H177V220H151Z M53 553H87V568H53Z" fill="#c5bdab"/>
  <rect x="52" y="228" width="92" height="57" rx="8" fill="#8ea77b"/>
  <path d="M60 235H136V278H60ZM98 235V278" fill="none" stroke="#e2ead7" stroke-width="1"/>
  <circle cx="98" cy="256.5" r="8" fill="none" stroke="#e2ead7" stroke-width="1"/>
  ${trees.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#91a783"/>`).join("")}
  <g fill="#4c6559" font-size="11" font-family="system-ui" font-weight="600">
    <text x="53" y="226">Alder School</text>
    <text x="208" y="447" transform="rotate(-90 208 447)">Alder Avenue</text>
    <text x="364" y="463">Pickup loop</text>
  </g>`;
const avenue = `
  <path d="M236 -1000H294V1600H236Z" fill="#e9e7d8"/>
  <path d="M239 -1000H291V1600H239Z" fill="#46525b"/>
  <path d="M251 -1000V1600" stroke="#dbbe81" stroke-width="1.2"/>
  <path d="M270 -1000V1600" stroke="#e6e9e5" stroke-width="1" stroke-dasharray="9 10"/>
  <path d="M0 169H236V191H0Z M294 169H500V191H294Z" fill="#46525b"/>
  <path d="M0 180H228M302 180H500" stroke="#e6e9e5" stroke-width="1" stroke-dasharray="8 8"/>
  <path d="M252 194H289" stroke="#fff" stroke-width="2"/>
  <path d="M252 190H289" stroke="#fff" stroke-width="4" stroke-dasharray="2 4"/>
  <path d="M244 474l4-8h-8zm17-61 4 8h-8zm19 0 4 8h-8z" fill="#e6e9e5" opacity=".75"/>`;

function handleBounds(key) {
  if (key === "mergeEnd") return mergeEndBounds(draft.node, draft.lanes & 2 ? draft.slipStart : 0);
  if (key === "slipStart") return [205, slipStartMax(draft)];
  if (key === "slipEnd") return [348, 430];
  if (key === "slipBend") return [16, 70];
  if (key === "taperLength") return taperLengthBounds(draft);
  if (key === "node") return [275, 375];
  return key === "entry" ? [25, 125] : [20, Math.min(125, world.start.y - draft.node)];
}

function updateHandle(key, value) {
  draft[key] = Math.round(clamp(value, ...handleBounds(key)));
  if (key === "node") {
    draft.mergeEnd = clamp(draft.mergeEnd, ...mergeEndBounds(draft.node));
    draft.exit = clamp(draft.exit, ...handleBounds("exit"));
  }
  if (draft.slipStart) draft.slipStart = Math.min(draft.slipStart, slipStartMax(draft));
  draft.taperLength = clamp(draft.taperLength, ...taperLengthBounds(draft));
}

function mergeLength(config) {
  return Math.round((config.node - config.mergeEnd) * scale);
}

function connectionLaneCount(config, movement) {
  if (config.road == null) return 0;
  const y = movement === "pickup" ? config.node - .01 : config.slipStart + .01;
  return avenueSegmentAt(config, y)?.north ?? 0;
}

function setConnectionLane(movement, lane) {
  draft[movement === "slip" ? "slipLane" : "pickupLane"] = lane;
  if (movement === "pickup") draft.lanes = 1;
}

function laneDragTargets(config, movement, y) {
  const count = connectionLaneCount(config, movement);
  const selected = selectedLane(config, movement);
  return Array.from({ length: count }, (_, index) => {
    const lane = index + 1;
    const x = avenueLaneX("north", lane);
    return `<path d="M${x} ${y - 17}v34" stroke="#c4f8ff" stroke-width="${lane === selected ? 4 : 2}"
      opacity="${lane === selected ? 1 : .6}" pointer-events="none"/>`;
  }).join("");
}

function handle(kind, x, y, selected = true) {
  const names = { node: "Merge node", slipStart: "Slip lane start", slipEnd: "Slip lane end", slipBend: "Slip lane bend", mergeEnd: "Merge lane end", taperLength: "Taper start", entry: "Entry handle", exit: "Exit handle", source: "Pickup lane", outer: "Main lane", auxiliary: "Merge lane" };
  const lane = ["source", "outer", "auxiliary"].includes(kind);
  return `<g class="map-handle" data-handle="${kind}" transform="translate(${x} ${y})"
    role="${lane ? "button" : "slider"}" tabindex="0" aria-label="${names[kind]}"
    ${lane ? `aria-pressed="${selected}"` : `aria-valuemin="${handleBounds(kind)[0]}" aria-valuemax="${handleBounds(kind)[1]}" aria-valuenow="${draft[kind]}"`}>
    <circle r="23" fill="transparent"/>
    ${kind === "node" ? '<rect class="symbol" x="-8" y="-8" width="16" height="16" rx="3"/>' :
      kind === "taperLength" ? '<path class="symbol" d="M0-9 9 7H-9Z"/>' : kind === "mergeEnd" ? '<path class="symbol" d="M0-9 9 0 0 9-9 0Z"/>' : '<circle class="symbol" r="7"/>'}
  </g>`;
}

function mapMarkup(config, run, editing) {
  const primary = curve(config, 1);
  const secondary = curve(config, 2);
  const main = config.lanes & 1;
  const aux = config.lanes & 2;
  const selectedGeometry = main ? primary : secondary;
  const frame = run?.frames[Math.floor(time / step + 1e-8)];
  let content = scenery + (config.network ? freeNetworkMarkup(config.network, editing) :
    config.road == null ? avenue : avenueMarkup(config));
  if (editing && tool === "road" && config.road?.length === 0) return content + roadTargets(config);
  const taper = mergeTaper(config);
  if (!config.network && aux) {
    content += `<path d="${taper.path}" fill="none" stroke="#46525b" stroke-width="20"/>
      <path d="M291 ${config.node}V${taper.start}" stroke="#e6e9e5" stroke-width="1" stroke-dasharray="7 7"/>`;
  }
  if (!config.network && config.lanes) content += `<path d="${selectedGeometry.path}" fill="none" stroke="#e9e7d8" stroke-width="23"/>
    <path d="${selectedGeometry.path}" fill="none" stroke="#46525b" stroke-width="19"/>
    <path d="${selectedGeometry.path}" fill="none" stroke="#f3e6bb" stroke-width="1" stroke-dasharray="8 9" opacity=".7"/>`;
  if (!config.network && main && aux) {
    content += `<path d="${secondary.path}" fill="none" stroke="#46525b" stroke-width="17"/>`;
  }
  const school = schoolEntry();
  if (!config.network && config.schoolAccess) content += `<path d="${school.path}" fill="none" stroke="#46525b" stroke-width="10"
    ${config.schoolRight ? "" : 'opacity=".35" stroke-dasharray="4 3"'}/>`;
  if (!config.network && config.slipStart) {
    const slip = slipGeometry(config);
    content += `<path d="${slip.path}" fill="none" stroke="#e9e7d8" stroke-width="15"/>
      <path d="${slip.path}" fill="none" stroke="#46525b" stroke-width="11"/>`;
    content += yieldSign(config.slipEnd - 16, config.slipYield ? world.signal + 23 : world.signal - 16);
  }
  if (!config.network && config.pickupYield && main) content += yieldSign(selectedGeometry.end.x + 17, config.node + 17);
  if (!config.network && config.taperYield && aux) content += yieldSign(world.auxiliary + 13, taper.end + 14);
  if (!config.network && !config.signalRight) content += turnBan(world.outer + 14, world.signal + 23);
  if (!config.network && config.schoolAccess && !config.schoolRight) content += turnBan(world.outer + 15, school.start.y + 5);

  const phase = frame?.phase ?? "all-red";
  const light = (road, x, y) => {
    const color = phase === road ? "#9ee6a2" : phase === road + "-yellow" ? "#ffca74" : "#ff987d";
    return `<circle cx="${x}" cy="${y}" r="5" fill="#263944"/><circle cx="${x}" cy="${y}" r="2.8" fill="${color}"/>`;
  };
  if (!config.network) content += light("avenue", 245, 197) + light("cross", 229, 172);
  if (editing && tool === "signal") {
    content += '<path d="M254 210V365 M208 180H72" stroke="#c4f8ff" stroke-width="3" opacity=".8" stroke-dasharray="6 5"/>';
  }
  if (!editing && frame) {
    content += replayMarkers(run.frames, time).map(car => {
      const { length: metres, width } = vehicleDimensions(car.kind);
      const length = metres / scale;
      const halfWidth = width / scale / 2;
      const fill = car.reason ? "#ffc578" : car.kind === "bus" ? "#b9f8ff" : "#e4e9e4";
      const ring = highlightQueues && car.reason && car.zone === frame.queueZone
        ? `<rect x="${-length / 2 - 1}" y="${-halfWidth - 1}" width="${length + 2}" height="${halfWidth * 2 + 2}" rx="2" fill="none" stroke="#ffab49" stroke-width="1"/>`
        : "";
      return `<g transform="translate(${car.x} ${car.y}) rotate(${car.angle * 180 / Math.PI})">${ring}
        <rect x="${-length / 2}" y="${-halfWidth}" width="${length}" height="${halfWidth * 2}" rx="1.7" fill="${fill}"/>
        <rect x="${length / 2 - 2.5}" y="${-halfWidth * .65}" width="1.5" height="${halfWidth * 1.3}" rx=".4" fill="#416270"/></g>`;
    }).join("");
  }
  if (editing && !config.network) {
    const { start, a, b, end, path } = selectedGeometry;
    if (tool === "move" && config.lanes) {
      if (drag?.key === "node") content += laneDragTargets(config, "pickup", end.y);
      const old = curve(design, design.lanes & 1 ? 1 : 2);
      content += `<path d="M${end.x} 275V375" stroke="#c4f8ff" opacity=".5" stroke-dasharray="3 5"/>
        <path d="${old.path}" fill="none" stroke="#fbfffc" opacity=".7" stroke-dasharray="4 4"/>
        <path d="${path}" fill="none" stroke="#c4f8ff" stroke-width="3"/>` + handle("node", end.x, end.y);
      if (aux) {
        const [min, max] = mergeEndBounds(config.node, config.slipStart);
        content += `<path d="M${world.outer} ${min}V${max}" fill="none" stroke="#c4f8ff" opacity=".55" stroke-dasharray="3 4"/>
          <path d="${taper.path}" fill="none" stroke="#c4f8ff" stroke-width="2" stroke-dasharray="7 4"/>`
          + handle("mergeEnd", world.outer, taper.end) + `<path d="M${world.auxiliary} ${taper.start}h26" stroke="#c4f8ff" stroke-width="1.5"/>`
          + handle("taperLength", world.auxiliary + 26, taper.start);
      }
    }
    if (tool === "curve" && config.lanes) {
      content += `<path d="${path}" fill="none" stroke="#c4f8ff" stroke-width="3"/>
        <path d="M${start.x} ${start.y}L${a.x} ${a.y}M${end.x} ${end.y}L${b.x} ${b.y}" fill="none" stroke="#c4f8ff" stroke-width="1.5" stroke-dasharray="4 4"/>
        <rect x="${start.x - 4}" y="${start.y - 4}" width="8" height="8" fill="#c4f8ff"/>
        <rect x="${end.x - 4}" y="${end.y - 4}" width="8" height="8" fill="#c4f8ff"/>` + handle("entry", a.x, a.y) + handle("exit", b.x, b.y);
    }
    if (tool === "lanes") {
      content += `<path d="${primary.path}" fill="none" stroke="#c4f8ff" stroke-width="3" opacity="${main ? 1 : .28}" marker-end="url(#lane-arrow)"/>
        <path d="${secondary.path}" fill="none" stroke="#c4f8ff" stroke-width="3" opacity="${aux ? 1 : .28}" marker-end="url(#lane-arrow)"/>`;
      content += handle("source", start.x, start.y, laneSelected);
      if (laneSelected) {
        // Offset the tap targets along the two receiving paths for finger clearance.
        content += handle("outer", world.outer - 9, config.node - 22, !!main);
        content += handle("auxiliary", world.auxiliary + 16, config.node + 8, !!aux);
        content += `<path d="M${world.outer - 5} ${config.node - 17}l5 17m16 4 6-4" stroke="#c4f8ff" stroke-width="1" fill="none" pointer-events="none"/>`;
      }
    }
  }
  if (editing && tool === "slip") content += slipHandles(config);
  if (editing && tool === "junction") content += junctionMarkers(config);
  if (editing && !config.network && tool === "road") content += roadTargets(config);
  return content;
}

function yieldSign(x, y) {
  return `<path d="M${x - 6} ${y - 5}h12l-6 10Z" fill="#fff6e7" stroke="#a13f38" stroke-width="2"/>`;
}

function turnBan(x, y) {
  return `<g transform="translate(${x} ${y})"><circle r="7" fill="#fff6e7" stroke="#a13f38" stroke-width="2"/>
    <path d="M-3 3v-5h6m-2-2 2 2-2 2M-5-5 5 5" fill="none" stroke="#a13f38" stroke-width="1.4"/></g>`;
}

function junctions(config) {
  const { outer, signal } = world;
  const school = schoolEntry().start;
  const nodes = [
    { id: "signal", name: "Alder signal", x: outer, y: signal, rule: "signalRight", label: "Right turn allowed",
      movement: `M${outer} ${signal + 40} Q${outer} ${signal} ${outer + 54} ${signal}` },
    { id: "pickup", name: "Pickup junction", x: outer, y: config.node,
      rule: config.lanes & 1 ? "pickupYield" : undefined, label: "Pickup yields",
      movement: curve(config, config.lanes & 1 ? 1 : 2).path },
    { id: "school", name: "School access", x: school.x, y: school.y, rule: "schoolRight", label: "Right turn allowed",
      movement: schoolEntry().path }
  ];
  if (!config.lanes) nodes.splice(nodes.findIndex(node => node.id === "pickup"), 1);
  if (!config.schoolAccess) nodes.splice(nodes.findIndex(node => node.id === "school"), 1);
  if (config.lanes & 2) nodes.push({
    id: "taper", name: "Merge lane end", x: outer, y: config.mergeEnd, rule: "taperYield", label: "Merge lane yields",
    movement: mergeTaper(config).path
  });
  if (config.slipStart) nodes.push(
    { id: "slip-fork", name: "Slip lane start", x: outer, y: config.slipStart, movement: slipGeometry(config).path },
    { id: "slip-join", name: "Slip lane merge", x: config.slipEnd, y: signal, rule: "slipYield", label: "Slip lane yields",
      movement: slipGeometry(config).path }
  );
  return nodes;
}

function junctionMarkers(config) {
  const nodes = junctions(config);
  const active = nodes.find(node => node.id === selectedJunction);
  // Offset markers on alternate sides so nearby nodes can be tapped independently.
  const left = new Set(["taper", "slip-fork"]);
  return (active ? `<path d="${active.movement}" fill="none" stroke="#c4f8ff" stroke-width="3"
    stroke-dasharray="5 3" marker-end="url(#lane-arrow)" pointer-events="none"/>` : "") + nodes.map(node => {
    const dx = node.id === "slip-join" ? 0 : left.has(node.id) ? -23 : 23;
    const dy = node.id === "taper" ? 17 : node.id === "slip-join" ? 23 : 0;
    return `<g class="junction-node" data-node="${node.id}" role="button" tabindex="0"
      aria-label="${node.name} node" aria-pressed="${node.id === selectedJunction}">
      <path d="M${node.x} ${node.y}l${dx} ${dy}" stroke="#c4f8ff" stroke-width="2" pointer-events="none"/>
      <circle cx="${node.x + dx}" cy="${node.y + dy}" r="19" fill="transparent"/>
      <circle class="junction-pin" cx="${node.x + dx}" cy="${node.y + dy}" r="9"/>
    </g>`;
  }).join("");
}

function selectJunction(id) {
  selectedJunction = id;
  render();
  map.querySelector(`[data-node="${id}"]`)?.focus();
}

function slipHandles(config) {
  if (config.slipStart) {
    const slip = slipGeometry(config);
    return (drag?.key === "slipStart" ? laneDragTargets(config, "slip", slip.start.y) : "") + `<path d="${slip.path}" fill="none" stroke="#c4f8ff" stroke-width="3"/>
      <path d="M${slip.b.x} ${slip.b.y + 26}V${slip.b.y}H${slip.end.x}" fill="none" stroke="#c4f8ff" stroke-dasharray="4 3"/>`
      + handle("slipStart", slip.start.x, slip.start.y)
      + handle("slipEnd", slip.end.x, slip.end.y)
      + handle("slipBend", slip.b.x, slip.b.y + 26);
  }
  const guide = (key, label, path, x, y) => `<g data-snap="${key}" role="button" tabindex="0" aria-label="${label}">
    <path d="${path}" fill="none" stroke="transparent" stroke-width="50"/>
    <path d="${path}" fill="none" stroke="#c4f8ff" stroke-width="4" stroke-dasharray="5 4"/>
    <circle cx="${x}" cy="${y}" r="8" fill="#c4f8ff" stroke="#0f4b70" stroke-width="2"/></g>`;
  return slipAnchor === undefined
    ? guide("start", "Set slip lane start", `M${world.outer} 205V${slipStartMax(config)}`, world.outer, (205 + slipStartMax(config)) / 2)
    : `<circle cx="${world.outer}" cy="${slipAnchor}" r="7" fill="#c4f8ff"/>`
      + guide("end", "Set slip lane end", `M348 ${world.signal}H430`, 386, world.signal);
}

function setSlipAnchor(key, value) {
  if (key === "start") {
    slipAnchor = Math.round(clamp(value, 205, slipStartMax(draft)));
  } else {
    draft.slipStart = slipAnchor;
    draft.slipEnd = Math.round(clamp(value, 348, 430));
    slipAnchor = undefined;
  }
  render();
  map.querySelector(slipAnchor === undefined ? '[data-handle="slipEnd"]' : '[data-snap="end"]')?.focus();
}

function avenueMarkup(config) {
  let content = '<path d="M0 180H500" stroke="#46525b" stroke-width="22"/><path d="M0 180H236M300 180H500" stroke="#e6e9e5" stroke-dasharray="8 8"/>';
  for (const piece of avenuePieces(config)) {
    const road = (x, width, color, dash = "") => `<path d="${avenueLanePath(piece, x).path}" fill="none"
      stroke="${color}" stroke-width="${width}" stroke-dasharray="${dash}"/>`;
    const left = piece.south ? avenueLaneX("south", piece.south) : avenueLaneX("north", 1);
    const right = piece.north ? avenueLaneX("north", piece.north) : avenueLaneX("south", 1);
    content += road((left + right) / 2, right - left + laneSpacing, "#46525b");
    for (const direction of ["north", "south"]) {
      for (let lane = 2; lane <= piece[direction]; lane++) {
        const x = (avenueLaneX(direction, lane) + avenueLaneX(direction, lane - 1)) / 2;
        content += road(x, 1, "#e6e9e5", "8 8");
      }
    }
    if (piece.north && piece.south) content += road(261, 1.5, "#dbbe81");
  }
  return content;
}

function roadTargets(config) {
  const segments = avenueSegments(config);
  let content = "";
  if (roadMode !== "draw") {
    const pieces = avenuePieces(config);
    for (const segment of segments) {
      const y = (segment.top + segment.bottom) / 2;
      const selected = roadSelected === segment.top;
      const path = pieces.filter(piece => piece.top >= segment.top && piece.bottom <= segment.bottom)
        .map(piece => avenueLanePath(piece, 260).path).join(" ");
      content += `<g data-road-segment="${segment.top}" role="button" tabindex="0"
        aria-label="Segment ${segment.top} to ${segment.bottom}" aria-pressed="${selected}">
        <path d="${path}" fill="none" stroke="${selected ? "#c4f8ff" : "transparent"}"
          stroke-width="${selected ? 4 : 42}" stroke-dasharray="${selected ? "5 5" : ""}"/>
        <path d="${path}" fill="none" stroke="transparent" stroke-width="45"/>
        <circle cx="${260}" cy="${y}" r="6" fill="#c4f8ff" pointer-events="none"/></g>`;
      if (selected && roadMode === "select") {
        for (const [direction, x] of [["south", 204], ["north", 345]]) {
          content += `<g class="road-target" data-road-add="${direction}" role="button" tabindex="0"
            aria-label="Add ${direction}bound lane" transform="translate(${x},${Math.min(y, 390)})">
            <circle r="20" fill="transparent"/><circle r="12" fill="#0f4b70" stroke="#c4f8ff" stroke-width="2"/>
            <path d="M-5 0H5M0-5V5" stroke="#c4f8ff" stroke-width="2" pointer-events="none"/></g>`;
        }
      }
    }
  }
  const anchors = [...new Set([world.north, world.south,
    ...segments.flatMap(segment => [segment.top, segment.bottom]),
    ...avenueAnchors(config).filter(y => segments.some(segment => segment.top <= y && y <= segment.bottom))
  ])];
  if (roadMode === "draw" && roadDrawPointer && roadDrag !== undefined) {
    content += `<path d="M260 ${roadDrag}V${roadDrawPointer.y}H${roadDrawPointer.x}" fill="none"
      stroke="#c4f8ff" stroke-width="3" stroke-dasharray="5 4" pointer-events="none"/>`;
  }
  return content + anchors.map(y => {
    const end = y === world.north || y === world.south;
    const direction = y === world.north ? "↓" : "↑";
    const pin = y === world.north ? 152 : y;
    const pinX = y === world.north ? 306 : 260;
    return (pin !== y ? `<path d="M260 ${y}L${pinX} ${pin}" stroke="#c4f8ff" pointer-events="none"/>` : "") + `<g class="road-target" data-road-node="${y}" role="button" tabindex="0"
      aria-label="${y === world.north ? "North connection" : y === world.south ? "South connection" : `Road node ${y}`}">
      <circle cx="${pinX}" cy="${pin}" r="19" fill="transparent"/>
      <circle cx="${pinX}" cy="${pin}" r="${end ? 12 : 8}" fill="${roadStart === y ? "#c4f8ff" : "#0f4b70"}" stroke="#c4f8ff" stroke-width="2"/>
      ${end ? `<text x="${pinX}" y="${pin + 5}" text-anchor="middle" fill="#fff" pointer-events="none">${direction}</text>` : ""}</g>`;
  }).join("");
}

function replaceRoadSegment(updates) {
  draft.road = avenueSegments(draft).map(segment => segment.top === roadSelected ? { ...segment, ...updates } : segment);
  roadMessage = "";
  render();
}

function addRoadLane(direction) {
  const segment = avenueSegments(draft).find(item => item.top === roadSelected);
  if (segment && segment[direction] < 4) replaceRoadSegment({ [direction]: segment[direction] + 1 });
}

function selectRoadNode(y) {
  roadMessage = "";
  if (roadMode === "draw") {
    if (roadStart === undefined || roadStart === y) roadStart = y;
    else {
      const top = Math.min(roadStart, y), bottom = Math.max(roadStart, y);
      const segments = avenueSegments(draft);
      if (segments.some(segment => segment.top < bottom && segment.bottom > top)) {
        roadMessage = "Choose two nodes across an open gap.";
      } else if (bottom - top >= 8 && segments.length < 30) {
        draft.road = [...segments, { top, bottom, north: 1, south: 1, bend: 0 }].sort((a, b) => a.top - b.top);
        roadSelected = top;
        roadMode = "select";
        roadStart = undefined;
      }
    }
  } else {
    const interior = avenueSegments(draft).find(segment => segment.top < y && y < segment.bottom);
    if (roadMode === "split" && interior) {
      selectRoadSegment(interior.top, y);
      return;
    }
    roadSelected = (avenueSegments(draft).find(segment => segment.top === y) ??
      avenueSegments(draft).find(segment => segment.bottom === y))?.top;
  }
  render();
}

function selectRoadSegment(top, y) {
  roadSelected = top;
  roadMessage = "";
  if (roadMode === "split") {
    const segments = avenueSegments(draft);
    const segment = segments.find(item => item.top === top);
    const split = Math.round(y ?? (segment.top + segment.bottom) / 2);
    if (split - segment.top < 8 || segment.bottom - split < 8 || segments.length >= 30) {
      roadMessage = "Choose a point farther from the segment ends.";
    } else {
      draft.road = segments.flatMap(item => item === segment ?
        [{ ...item, bottom: split }, { ...item, top: split }] : [item]);
      roadSelected = split;
      roadMode = "select";
    }
  }
  render();
}

function roadControls() {
  const segment = avenueSegments(draft).find(item => item.top === roadSelected);
  const preset = (label, north, south) => `<button data-road-preset="${north}:${south}" aria-pressed="${segment.north === north && segment.south === south}">${label}</button>`;
  const counts = direction => `<div class="road-count"><span>${direction === "north" ? "↑ North" : "↓ South"}</span>
    <button data-road-count="${direction}:-1" aria-label="Remove ${direction}bound lane" ${segment[direction] === 0 || segment.north + segment.south === 1 ? "disabled" : ""}>−</button>
    <output>${segment[direction]}</output><button data-road-count="${direction}:1" aria-label="Increase ${direction}bound lanes" ${segment[direction] === 4 ? "disabled" : ""}>+</button></div>`;
  return `<div class="row chips road-actions">
      <button data-road-mode="draw" aria-pressed="${roadMode === "draw"}">Draw</button>
      <button data-road-mode="split" aria-pressed="${roadMode === "split"}" ${avenueSegments(draft).length ? "" : "disabled"}>Add node</button>
      <button data-action="clear-map">Clear map</button>
      <button data-action="clear-road" ${avenueSegments(draft).length ? "" : "disabled"}>Clear avenue</button>
      ${segment && roadMode === "select" ? '<button data-action="remove-segment">Remove</button>' : ""}</div>
    ${segment && roadMode === "select" ? `<div class="row chips road-presets">
      ${roadPresets.map(([label, north, south]) => preset(label, north, south)).join("")}
      ${preset("1 lane ↓", 0, 1)}</div>
      <div class="row road-counts">${counts("north")}${counts("south")}</div>
      <div class="row"><label for="road-bend">Curve</label><input id="road-bend" type="range" min="-24" max="24" value="${segment.bend}"/>
      <output id="road-bend-value">${segment.bend}</output></div>
` : ""}`;
}

function movementLanes(node) {
  if (draft.road == null || !node) return "";
  const movement = node.id === "slip-fork" ? "slip" : node.id === "pickup" ? "pickup" : undefined;
  if (!movement) return "";
  const count = connectionLaneCount(draft, movement);
  if (!count) return "<p>No northbound lane at this connection.</p>";
  return `<div class="row chips" aria-label="Northbound lane connection">${Array.from({ length: count }, (_, index) =>
    `<button data-movement="${movement}:${index + 1}" aria-pressed="${(movement !== "pickup" || draft.lanes === 1) && selectedLane(draft, movement) === index + 1}">Lane ${index + 1}</button>`).join("")}</div>
    <p>Northbound lanes count from the center out.${movement === "pickup" && draft.lanes & 2 ? " Selecting a lane replaces the auxiliary taper." : ""}</p>`;
}

function demandMarkup() {
  const origin = terminals[demandTerminal];
  if (!origin) return "";
  return destinationCounts(origin.id).map(([id, count]) => {
    const { x, y } = terminals[id];
    const length = Math.hypot(x - origin.x, y - origin.y);
    const endX = x + (origin.x - x) * 16 / length, endY = y + (origin.y - y) * 16 / length;
    return `<path d="M${origin.x} ${origin.y}L${endX} ${endY}" stroke="#0f7090" opacity=".75"
      stroke-width="${Math.min(8, 2 + count / 7)}" marker-end="url(#demand-arrow)"/>
      <text x="${(origin.x + x) / 2}" y="${(origin.y + y) / 2 - 6}" fill="#173f53" stroke="#e1e6d8"
        stroke-width="3" paint-order="stroke" font-size="12" font-weight="750">${count}</text>`;
  }).join("");
}

function freeNetworkMarkup(network, editing) {
  const nodes = networkNodes(network);
  const label = (x, y, name) => `<text x="${x}" y="${y}" text-anchor="middle" fill="#173f53" stroke="#e1e6d8" stroke-width="3"
    paint-order="stroke" font-size="12" font-weight="750" pointer-events="none">${name}</text>`;
  const roads = network.roads.map((road, index) => {
    const { path, samples } = networkRoadGeometry(road, nodes);
    // Match the right-hand lane offsets used by the simulation.
    const strokes = Array.from({ length: road.forward + road.backward }, (_, lane) => {
      const offset = (lane - road.backward + .5) * networkLaneWidth;
      const points = samples.filter((_, i) => i % 5 === 0).map(({ x, y, angle }) =>
        `${x - Math.sin(angle) * offset},${y + Math.cos(angle) * offset}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="#46525b" stroke-width="${networkLaneWidth + .5}"/>`;
    }).join("");
    const selected = editing && index === freeRoad;
    const arrows = selected ? [["forward", samples[38], 0], ["backward", samples[62], 180]].map(([direction, point, turn]) =>
      road[direction] ? `<path d="M-5-4L3 0-5 4" fill="none" stroke="#c4f8ff" stroke-width="2" pointer-events="none"
        transform="translate(${point.x} ${point.y}) rotate(${point.angle * 180 / Math.PI + turn})"/>` : "").join("") : "";
    return `<g>${strokes}<path d="${path}" fill="none" stroke="${editing && index === freeRoad ? "#c4f8ff" : "#e6e9e5"}"
      stroke-width="1.4" stroke-dasharray="5 5" pointer-events="none"/>${arrows}
      ${editing && roadMode !== "draw" ? `<path d="${path}" data-free-road="${index}" role="button" tabindex="0" aria-label="Road ${index + 1}"
        fill="none" stroke="transparent" stroke-width="25"/>` : ""}</g>`;
  }).join("");
  const stubs = Object.values(terminals).map(({ x, y, dx, dy }) =>
    `<path d="M${x} ${y}l${dx} ${dy}" stroke="#46525b" stroke-width="12"/>`).join("");
  if (!editing) return stubs + roads;
  const start = nodes.get(freeStart);
  const preview = start && freeDrag?.point ? `<path d="M${start.x} ${start.y}L${freeDrag.point.x} ${freeDrag.point.y}"
    stroke="#0f7090" stroke-width="3" stroke-dasharray="6 5" pointer-events="none"/>` : "";
  const pins = [...nodes.values()].map(node => {
    const { id, x, y } = node;
    const active = id === freeStart || id === freeNode || id === demandTerminal;
    return `<g class="road-target" data-free-node="${id}" role="button" tabindex="0" aria-label="${node.name ? node.name + " connection" : "Junction " + id.slice(1)}">
      <circle cx="${x}" cy="${y}" r="19" fill="transparent"/>
      <circle cx="${x}" cy="${y}" r="${node.name ? 10 : 7}" fill="${active ? "#c4f8ff" : node.control === "traffic_light" ? "#398257" : node.control === "allway_stop" ? "#a13f38" : "#0f4b70"}" stroke="#c4f8ff" stroke-width="2"/>
      ${node.name ? label(x, y + (id === "north" ? 23 : -15), node.name) : ""}</g>`;
  }).join("");
  return stubs + roads + '<defs><marker id="demand-arrow" orient="auto" markerWidth="4" markerHeight="4" refX="3.5" refY="2"><path d="M0 0L4 2L0 4Z" fill="#0f7090"/></marker></defs>'
    + `<g data-demand-layer pointer-events="none">${demandMarkup()}</g>` + preview + pins;
}

function destinationCounts(id) {
  const counts = new Map();
  for (const trip of demandTrips) {
    const [origin, destination] = tripTerminals(trip);
    if (origin === id) counts.set(destination, (counts.get(destination) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

function freeControls() {
  const segment = draft.network.roads[freeRoad];
  const node = draft.network.nodes.find(item => item.id === freeNode);
  const preset = (label, forward, backward) => `<button data-free-preset="${forward}:${backward}"
    aria-pressed="${segment.forward === forward && segment.backward === backward}">${label}</button>`;
  const counts = direction => `<div class="road-count"><span>${direction === "forward" ? "A → B" : "B → A"}</span>
    <button data-free-count="${direction}:-1" aria-label="Remove ${direction} lane" ${!segment[direction] || segment.forward + segment.backward === 1 ? "disabled" : ""}>−</button>
    <output>${segment[direction]}</output><button data-free-count="${direction}:1" aria-label="Add ${direction} lane" ${segment[direction] >= 4 ? "disabled" : ""}>+</button></div>`;
  return `<div class="row chips road-actions">
    <button data-road-mode="draw" aria-pressed="${roadMode === "draw"}">Draw</button>
    <button data-road-mode="split" aria-pressed="${roadMode === "split"}">Add node</button>
    <button data-road-mode="select" aria-pressed="${roadMode === "select"}">Select</button>
    <button data-action="clear-map" ${draft.network.roads.length || draft.network.nodes.length ? "" : "disabled"}>Clear map</button>
    ${segment ? '<button data-action="remove-free-road">Remove road</button>' : ""}</div>
    ${node ? `<div class="row chips">
      <button data-control="priority" aria-pressed="${node.control === "priority"}">Priority</button>
      <button data-control="allway_stop" aria-pressed="${node.control === "allway_stop"}">All-way stop</button>
      <button data-control="traffic_light" aria-pressed="${node.control === "traffic_light"}">Signal</button></div>` : ""}
    ${segment ? `<div class="row chips road-presets">
      ${preset("1 lane →", 1, 0)}${preset("2 lanes ↔", 1, 1)}${preset("3 lanes ↔", 2, 1)}
      ${preset("4 lanes ↔", 2, 2)}${preset("1 lane ←", 0, 1)}</div>
      <div class="row road-counts">${counts("forward")}${counts("backward")}</div>
      <div class="row"><label for="free-bend">Curve</label><input id="free-bend" type="range" min="-32" max="32" value="${segment.bend}"/>
      <output id="free-bend-value">${segment.bend}</output></div>` : ""}`;
}

function replaceFreeRoad(updates) {
  const network = draft.network;
  const road = { ...network.roads[freeRoad], ...updates };
  roadMessage = networkRoadIssue(network, road, freeRoad) ?? "";
  if (!roadMessage) draft.network = { ...network, roads: network.roads.map((item, i) => i === freeRoad ? road : item) };
}

function newFreeNode(network, point) {
  const used = new Set(network.nodes.map(node => node.id));
  let number = 1;
  while (used.has(`j${number}`)) number++;
  return { id: `j${number}`, x: Math.round(point.x), y: Math.round(point.y), control: "priority" };
}

function editFreeMap(target, point) {
  const network = draft.network;
  const id = target?.closest("[data-free-node]")?.dataset.freeNode;
  const roadIndex = target?.closest("[data-free-road]")?.dataset.freeRoad;
  roadMessage = "";
  if (roadMode === "draw") {
    if (freeStart && id === freeStart) freeStart = undefined;
    else if (!freeStart && id) freeStart = id;
    else if (freeStart && id !== freeStart && (id || point)) {
      const node = id ? undefined : newFreeNode(network, point);
      const next = node ? { ...network, nodes: [...network.nodes, node] } : network;
      const road = { a: freeStart, b: id ?? node.id, forward: 1, backward: 1, bend: 0 };
      roadMessage = networkRoadIssue(next, road) ?? "";
      if (!roadMessage && next.roads.length < 90 && next.nodes.length <= 60) {
        draft.network = { ...next, roads: [...next.roads, road] };
        freeStart = node?.id;
      }
    }
  } else if (roadMode === "split") {
    if (roadIndex !== undefined) {
      const index = Number(roadIndex);
      const road = network.roads[index];
      const { samples } = networkRoadGeometry(road, networkNodes(network));
      const distance = sample => Math.hypot(sample.x - point.x, sample.y - point.y);
      const nearest = point ? samples.reduce((best, item) => distance(item) < distance(best) ? item : best) : samples[50];
      const node = newFreeNode(network, nearest);
      const next = { nodes: [...network.nodes, node], roads: network.roads.filter((_, i) => i !== index) };
      for (const part of [{ ...road, b: node.id, bend: 0 }, { ...road, a: node.id, bend: 0 }]) {
        roadMessage = networkRoadIssue(next, part) ?? "";
        if (roadMessage) break;
        next.roads.push(part);
      }
      if (!roadMessage && next.nodes.length <= 60 && next.roads.length <= 90) {
        draft.network = next;
        freeNode = node.id;
        roadMode = "select";
      }
    } else if (!id && point && network.nodes.length < 60) {
      const node = newFreeNode(network, point);
      roadMessage = networkNodeIssue(node) ?? "";
      if (!roadMessage) {
        draft.network = { ...network, nodes: [...network.nodes, node] };
        freeNode = node.id;
        roadMode = "select";
      }
    }
  } else {
    freeRoad = roadIndex === undefined ? undefined : Number(roadIndex);
    freeNode = id;
    demandTerminal = terminals[id] ? id : undefined;
  }
  render();
}

function queueViewBox(frame) {
  const queued = frame.markers.filter(car => car.reason && car.zone === frame.queueZone);
  if (!queued.length) return comparisonViewBox;
  const xs = queued.map(car => car.x);
  const ys = queued.map(car => car.y);
  const left = Math.min(150, ...xs) - 12;
  const top = Math.min(130, ...ys) - 12;
  return `${left} ${top} ${Math.max(480, ...xs) + 12 - left} ${Math.max(475, ...ys) + 12 - top}`;
}

function paintMap() {
  const editing = view === "design";
  const split = view === "simulate" && comparing && !!currentRun;
  map.toggleAttribute("hidden", split);
  $("#comparison").hidden = !split;
  if (split) {
    const editedFrame = currentRun.frames[Math.floor(time / step + 1e-8)];
    const bounds = design.network ? "0 55 500 570" : highlightQueues ? queueViewBox(editedFrame) : comparisonViewBox;
    $("#original-map").setAttribute("viewBox", bounds);
    $("#design-map").setAttribute("viewBox", bounds);
    $("#original-map").innerHTML = mapMarkup(baseline, original, false);
    $("#design-map").innerHTML = mapMarkup(design, currentRun, false);
  } else {
    map.setAttribute("viewBox", editing && camera ? camera.join(" ") : (editing ? draft : design).network ? "-35 35 575 705" : editing && tool === "road" ? "130 55 370 810" : editing && tool === "junction" ? "150 125 345 605" : editing && tool === "slip" ? "140 90 360 615" : editing && tool === "lanes" ? "145 145 340 476" : "0 0 500 700");
    map.innerHTML = mapMarkup(editing ? draft : design, editing ? undefined : currentRun, editing);
  }
}

const changed = () => Object.keys(baseline).some(key => design[key] !== draft[key]);
const metric = value => Math.round(value);
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function renderInspector() {
  if (view === "design") {
    const geometry = curve(draft, draft.lanes & 1 ? 1 : 2);
    const node = tool === "junction" ? junctions(draft).find(item => item.id === selectedJunction) : undefined;
    const title = { road: "Road Builder", move: "Move node", curve: "Adjust curve", lanes: "Connect lanes", signal: "Signal timing", junction: node?.name ?? "Junctions", slip: "Draw slip lane" }[tool];
    const collapse = `<button class="inspector-toggle" data-action="toggle-inspector"
      aria-label="${inspectorCollapsed ? "Expand" : "Minimize"} design panel" aria-expanded="${!inspectorCollapsed}">${inspectorCollapsed ? "⌃" : "⌄"}</button>`;
    const heading = `<div class="row inspector-heading"><h1>${title}</h1>${collapse}</div>`;
    if (inspectorCollapsed) {
      inspector.innerHTML = heading;
      return;
    }
    if (draft.network) {
      const destinations = demandTerminal ? destinationCounts(demandTerminal) : [];
      const demand = demandTerminal ? `<div class="terminal-demand" role="status"><strong>From ${terminals[demandTerminal].name}</strong>
        <p>${destinations.length ? destinations.map(([id, count]) => `${terminals[id].name} · ${count} trips`).join(" / ") : "Arrival only"}</p></div>` : "";
      const detail = roadMode === "draw" ? (freeStart ? "Tap a connection or open ground to continue the road." : "Tap or drag from a connection or junction.") :
        roadMode === "split" ? "Tap a road to split it, or open ground to place a junction." : "Select a road or junction. Hold a connection to see demand.";
      inspector.innerHTML = `${heading}<p id="detail">${roadMessage || detail}</p>${demand}${freeControls()}
        <div class="row actions"><button data-action="${changed() ? "cancel" : "undo"}" ${!changed() && !history.length ? "disabled" : ""}>${changed() ? "Cancel" : "Undo"}</button>
        <button data-action="apply" ${changed() ? "" : "disabled"}>Apply</button><button class="primary" data-action="test">Test design</button></div>`;
      return;
    }
    const detail = {
      road: roadMessage || (roadMode === "draw" ? "Drag or tap between two road nodes." : roadMode === "split" ?
        "Tap a segment where you want to add a node." : roadSelected === undefined ?
          "Tap a segment to set its lane layout." : "Set lanes by direction and adjust the curve."),
      move: !draft.lanes ? "Use Connect lanes to add the pickup connection." : draft.lanes & 2
        ? 'Square moves the join. Diamond ends the lane. Triangle starts the taper. <span id="merge-length"></span>'
        : draft.road == null ? "Drag the square along Alder Avenue." : "Drag the square sideways to snap to a lane, or along Alder Avenue to move it.",
      curve: !draft.lanes ? "Use Connect lanes to add the pickup connection." : `<span id="curve-readout">Min radius ${metric(geometry.radius)} m · ${metric(geometry.speed * 3.6)} km/h</span> · Ends aligned`,
      junction: node ? ({
        signal: "Control turns and signal timing at this intersection.",
        pickup: node.rule ? "Set priority where the pickup lane enters Alder Avenue." : "Pickup traffic enters its own lane here. Set priority at the merge lane end.",
        taper: "Set priority where the auxiliary lane rejoins Alder Avenue.",
        school: "Control the turn from Alder Avenue into the school.",
        "slip-fork": "Traffic splits toward the signal or the slip lane.",
        "slip-join": "Choose which approach yields where the slip lane joins the cross street."
      })[node.id] : "Tap a node on the map to inspect its movements.",
      slip: draft.slipStart ? (draft.road == null ? "Drag the start, end, or bend of the slip lane." : "Drag the start sideways to snap to a lane, or along Alder Avenue to move it.") :
        slipAnchor === undefined ? "Tap Alder Avenue to start the slip lane." : "Tap the cross street to connect the slip lane.",
      signal: `Split the ${signalCycle}-second cycle between Alder Avenue and the cross street.`,
      lanes: laneSelected ? "Tap a receiving lane to toggle its connection." : "Tap the pickup lane to reveal its connections."
    }[tool];
    const choices = tool === "lanes" && laneSelected ? `<div class="row chips">
      <button data-lane="1" aria-pressed="${!!(draft.lanes & 1)}">Main lane</button>
      <button data-lane="2" aria-pressed="${!!(draft.lanes & 2)}">Merge lane</button>
    </div>` : "";
    const rule = (key, label) => `<button data-rule="${key}" aria-pressed="${draft[key]}">${label}</button>`;
    const junction = node?.rule ? `<div class="row chips junction-rules">${rule(node.rule, node.label)}</div>` : "";
    const slip = tool === "slip" && draft.slipStart
      ? '<div class="row chips"><button data-action="remove-slip">Remove slip lane</button></div>' : "";
    const timing = (tool === "signal" || node?.id === "signal") ? `<div class="row spread timing"><label for="green">Alder green</label>
      <input id="green" type="range" min="${greenBounds[0]}" max="${greenBounds[1]}" value="${draft.green}"/>
      <output id="green-time" for="green"></output></div>
      <p id="cross-time"></p>` : "";
    inspector.innerHTML = `${heading}<p id="detail">${detail}</p>${choices}${junction}${movementLanes(node)}${timing}${slip}${tool === "road" ? roadControls() : ""}<div class="row actions">
      ${changed() ? '<button data-action="cancel">Cancel</button>' : `<button data-action="undo" ${history.length ? "" : "disabled"}>Undo</button>`}
      <button data-action="apply" ${changed() ? "" : "disabled"}>Apply</button>
      <button class="primary" data-action="test">Test design</button></div>`;
    updateGeometryReadouts();
  } else if (!currentRun) {
    inspector.innerHTML = `<h1>${view === "simulate" ? "Traffic simulation" : "School pickup results"}</h1>
      <p role="status"></p>${sumoMessage ? '<div class="row actions"><button data-action="retry">Retry</button></div>' : ""}`;
    inspector.querySelector("[role=status]").textContent = sumoMessage || "Simulating traffic…";
  } else if (view === "simulate") {
    inspector.innerHTML = `<div class="row spread"><h1>Traffic simulation</h1><button data-action="compare" aria-pressed="${comparing}">Compare</button></div>
      <div class="row"><button id="play" data-action="play">${playing ? "Pause" : "Play"}</button>
      <input id="scrub" type="range" min="0" max="${duration}" step="${step}" value="${time}" aria-label="Simulation time">
      <span id="clock">${clock(time)}</span></div>
      <div class="row spread simulation-footer"><p id="live"></p><button data-action="peak">Worst backup</button></div>`;
    updateSimulationReadout();
  } else {
    const a = original.results;
    const b = currentRun.results;
    const rows = [
      ["Peak queue", a.longestQueue, b.longestQueue, "m", 1],
      ["Bus delay", a.busDelay, b.busDelay, "s", 1],
      ["Cross-street delay", a.crossDelay, b.crossDelay, "s", 1],
      ["Pickup trips", a.pickupFinished, b.pickupFinished, "", -1],
      ["Cross-street trips", a.crossFinished, b.crossFinished, "", -1],
      ["All trips", a.finished, b.finished, "", -1],
      ...(design.slipStart ? [["Slip lane trips", a.slipFinished, b.slipFinished, "", -1]] : []),
      ...(b.unserved ? [["Trips with no route", a.unserved, b.unserved, "", 1]] : []),
      ["Collisions", a.collisions, b.collisions, "", 1]
    ];
    const goal = b.unserved === 0 && b.collisions === 0 && metric(b.longestQueue) < metric(a.longestQueue) &&
      metric(b.busDelay) <= metric(a.busDelay) && metric(b.crossDelay) <= metric(a.crossDelay) &&
      b.finished >= a.finished && b.pickupFinished >= a.pickupFinished && b.crossFinished >= a.crossFinished;
    const summary = b.unserved ? "Some trips lost access. Check road connections and turn restrictions." : goal ? "Goal met. You shortened the peak queue and protected service on both roads."
      : b.collisions ? "Revise the layout. SUMO reported a collision."
        : "Goal: shorten the peak queue while protecting bus delay, cross-street delay, and completed trips.";
    const cell = (label, before, after, unit, direction) => {
      const suffix = unit ? ` ${unit}` : "";
      const delta = metric(after) - metric(before);
      return `<tr><th scope="row">${label}</th><td>${metric(before)}${suffix}</td><td>${metric(after)}${suffix}</td>
        <td class="${delta === 0 ? "muted" : delta * direction < 0 ? "gain" : "loss"}">${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}${suffix}</td></tr>`;
    };
    inspector.innerHTML = `<h1>School pickup results</h1><table class="metrics" aria-label="Simulation results by design">
      <thead><tr><th scope="col">Measure</th><th scope="col">Original</th><th scope="col">Yours</th><th scope="col">Change</th></tr></thead>
      <tbody>${rows.map(row => cell(...row)).join("")}</tbody></table><p>${summary}</p>
      <div class="row actions"><button data-action="peak">See peak queue</button></div>`;

  }
}

function render() {
  document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", button.dataset.view === view));
  document.querySelectorAll("[data-tool]").forEach(button => button.setAttribute("aria-pressed", button.dataset.tool === tool));
  $(".tools").hidden = view !== "design";
  for (const button of document.querySelectorAll("[data-tool]")) {
    button.hidden = !!draft.network && !["road", "junction"].includes(button.dataset.tool);
  }
  paintMap();
  renderInspector();
}

function updateSimulationReadout() {
  const index = Math.floor(time / step + 1e-8);
  $("#clock").textContent = clock(time);
  $("#scrub").value = time;
  const stats = frame => `${frame.finished} trips · ${metric(frame.longestQueue)} m queued`;
  $("#original-stats").textContent = stats(original.frames[index]);
  const edited = currentRun.frames[index];
  $("#design-stats").textContent = stats(edited);
  $("#live").textContent = highlightQueues ? edited.queueZone || "No queue at this time" : comparing ? "Eclipse SUMO" : stats(edited);
}

function toggleLane(bit) {
  laneSelected = true;
  if ((draft.lanes ^ bit) === 0) {
    if ($("#detail")) $("#detail").textContent = "Keep at least one lane connected.";
    return;
  }
  draft.lanes ^= bit;
  if (draft.slipStart && draft.lanes & 2) {
    draft.mergeEnd = Math.min(mergeEndBounds(draft.node)[1], Math.max(draft.mergeEnd, draft.slipStart + 8));
    draft.slipStart = Math.min(draft.slipStart, slipStartMax(draft));
    draft.taperLength = clamp(draft.taperLength, ...taperLengthBounds(draft));
  }
  render();
}

function finishDrag(cancel = false) {
  if (!drag) return;
  const { id, before } = drag;
  drag = undefined;
  if (map.hasPointerCapture(id)) map.releasePointerCapture(id);
  if (cancel) draft = before;
  render();
}

function gestureGeometry() {
  const [first, second] = mapPointers.values();
  if (!second) return { x: first.clientX, y: first.clientY, distance: 1 };
  return {
    x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2,
    distance: Math.max(1, Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY))
  };
}

function startCameraGesture() {
  const point = gestureGeometry();
  const { x, y, width, height } = map.viewBox.baseVal;
  cameraGesture = { point, anchor: mapPoint({ clientX: point.x, clientY: point.y }),
    bounds: [x, y, width, height], scale: map.getScreenCTM().a };
  for (const id of mapPointers.keys()) map.setPointerCapture(id);
}

map.addEventListener("pointerdown", event => {
  if (view !== "design" || event.button !== 0) return;
  if (!mapPointers.size) suppressMapClick = false;
  mapPointers.set(event.pointerId, event);
  if (mapPointers.size === 1 && event.target.closest("[role=button], [data-handle]")) return;
  if (mapPointers.size > 1) {
    if (freeDrag) {
      clearTimeout(terminalHold);
      if (freeDrag.moved) freeStart = freeDrag.previousStart;
      freeDrag = undefined;
      paintMap();
    }
    finishDrag(true);
    roadDrag = roadDrawPointer = undefined;
    suppressMapClick = true;
  }
  startCameraGesture();
  event.stopImmediatePropagation();
}, true);

map.addEventListener("pointermove", event => {
  if (!mapPointers.has(event.pointerId)) return;
  mapPointers.set(event.pointerId, event);
  if (!cameraGesture) return;
  event.stopImmediatePropagation();
  const { point, anchor, bounds, scale } = cameraGesture;
  const next = gestureGeometry();
  const factor = clamp(next.distance / point.distance, bounds[2] / 780, bounds[2] / 95);
  if (!suppressMapClick && Math.hypot(next.x - point.x, next.y - point.y) < 4) return;
  suppressMapClick = true;
  const [x, y, width, height] = bounds;
  camera = [
    anchor.x + (x - anchor.x - (next.x - point.x) / scale) / factor,
    anchor.y + (y - anchor.y - (next.y - point.y) / scale) / factor,
    width / factor, height / factor
  ];
  map.setAttribute("viewBox", camera.join(" "));
}, true);

for (const type of ["pointerup", "pointercancel"]) {
  map.addEventListener(type, event => {
    if (!mapPointers.delete(event.pointerId) || !cameraGesture) return;
    event.stopImmediatePropagation();
    if (mapPointers.size) startCameraGesture();
    else cameraGesture = undefined;
  }, true);
}

map.addEventListener("click", event => {
  if (suppressMapClick && event.detail) {
    event.stopImmediatePropagation();
    suppressMapClick = false;
  }
}, true);

map.addEventListener("pointerdown", event => {
  const target = event.target.closest("[data-handle]");
  if (view !== "design" || !target || tool === "lanes" || tool === "signal" || drag || event.button !== 0) return;
  const key = target.dataset.handle;
  const movement = key === "node" ? "pickup" : key === "slipStart" ? "slip" : undefined;
  const originX = key === "node" && !(draft.lanes & 1) ? world.auxiliary :
    movement ? avenueLaneX("north", selectedLane(draft, movement)) : undefined;
  drag = { key, movement, originX, start: mapPoint(event), id: event.pointerId, before: { ...draft } };
  map.setPointerCapture(event.pointerId);
});
map.addEventListener("pointermove", event => {
  if (!drag || drag.id !== event.pointerId) return;
  const p = mapPoint(event);
  const { key, movement, start, before } = drag;
  const dx = p.x - start.x, dy = p.y - start.y;
  if (movement && before.road != null && !drag.axis && Math.hypot(dx, dy) >= 5) {
    drag.axis = Math.abs(dx) > Math.abs(dy) ? "lane" : "road";
  }
  if (drag.axis === "lane") {
    const count = connectionLaneCount(before, movement);
    if (count) {
      const lane = clamp(Math.round((drag.originX + dx - world.outer) / laneSpacing) + 1, 1, count);
      if (Math.abs(dx) >= laneSpacing / 2) setConnectionLane(movement, lane);
      else draft = { ...before };
    }
    paintMap();
    updateGeometryReadouts();
    return;
  }
  if (movement && before.road != null && !drag.axis) return;
  const delta = key === "entry" || key === "slipBend" ? start.x - p.x : key === "slipEnd" ? p.x - start.x : p.y - start.y;
  draft.taperLength = before.taperLength;
  if (key === "node") {
    draft.mergeEnd = before.mergeEnd;
    draft.exit = before.exit;
  }
  updateHandle(key, before[key] + delta);
  paintMap();
  updateGeometryReadouts();
});

function updateGeometryReadouts() {
  const length = $("#merge-length");
  if (length) {
    const taper = mergeTaper(draft);
    length.textContent = `Lane ${mergeLength(draft)} m · taper ${metric(draft.taperLength * scale)} m at ${metric(taper.speed * 3.6)} km/h · ${metric((taper.end - world.signal) * scale)} m to signal.`;
  }
  if ($("#green-time")) {
    $("#green-time").textContent = `${draft.green} s`;
    $("#cross-time").textContent = `Cross street ${signalCycle - draft.green - 2 * clearance} s green · ${2 * clearance} s changeover`;
  }
  const readout = $("#curve-readout");
  if (readout) {
    const geometry = curve(draft, draft.lanes & 1 ? 1 : 2);
    readout.textContent = `Min radius ${metric(geometry.radius)} m · ${metric(geometry.speed * 3.6)} km/h`;
  }
}
map.addEventListener("pointerup", event => { if (drag?.id === event.pointerId) finishDrag(); });
map.addEventListener("pointercancel", event => { if (drag?.id === event.pointerId) finishDrag(true); });
map.addEventListener("lostpointercapture", event => { if (drag?.id === event.pointerId) finishDrag(true); });
function selectLaneTarget(key) {
  if (key === "source") {
    laneSelected = true;
    render();
  } else if (key === "outer" || key === "auxiliary") toggleLane(key === "outer" ? 1 : 2);
}
map.addEventListener("pointerdown", event => {
  const node = event.target.closest("[data-road-node]");
  if (tool === "road" && roadMode === "draw" && node) roadDrag = Number(node.dataset.roadNode);
});
map.addEventListener("pointermove", event => {
  if (roadDrag === undefined) return;
  if (!map.hasPointerCapture(event.pointerId)) map.setPointerCapture(event.pointerId);
  roadDrawPointer = mapPoint(event);
  paintMap();
});
map.addEventListener("pointerup", event => {
  if (roadDrag === undefined) return;
  const node = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-road-node]");
  const start = roadDrag;
  const hadPreview = !!roadDrawPointer;
  roadDrag = roadDrawPointer = undefined;
  if (!node || start === Number(node.dataset.roadNode)) {
    if (hadPreview) paintMap();
    return;
  }
  event.preventDefault();
  roadStart = start;
  selectRoadNode(Number(node.dataset.roadNode));
});
map.addEventListener("pointercancel", () => {
  if (roadDrag === undefined) return;
  roadDrag = roadDrawPointer = undefined;
  paintMap();
});

function handleRoadTarget(target, y) {
  const { roadNode, roadSegment, roadAdd } = target.closest("[data-road-node], [data-road-segment], [data-road-add]")?.dataset ?? {};
  if (roadNode !== undefined) selectRoadNode(Number(roadNode));
  if (roadSegment !== undefined) selectRoadSegment(Number(roadSegment), y);
  if (roadAdd) addRoadLane(roadAdd);
}

map.addEventListener("pointerdown", event => {
  const id = event.target.closest("[data-free-node]")?.dataset.freeNode;
  if (!draft.network || view !== "design" || !id || event.button !== 0) return;
  freeDrag = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, previousStart: freeStart };
  if (terminals[id]) terminalHold = setTimeout(() => {
    if (!freeDrag || freeDrag.pointer !== event.pointerId) return;
    freeDrag.held = true;
    demandTerminal = id;
    suppressMapClick = true;
    $("[data-demand-layer]").innerHTML = demandMarkup();
    renderInspector();
  }, 450);
});

map.addEventListener("pointermove", event => {
  if (freeDrag?.pointer !== event.pointerId || freeDrag.held ||
      Math.hypot(event.clientX - freeDrag.x, event.clientY - freeDrag.y) < 6) return;
  clearTimeout(terminalHold);
  if (roadMode !== "draw") return;
  if (!map.hasPointerCapture(event.pointerId)) map.setPointerCapture(event.pointerId);
  if (!freeDrag.moved) {
    freeStart = freeDrag.id;
    freeDrag.moved = true;
    demandTerminal = undefined;
  }
  freeDrag.point = mapPoint(event);
  paintMap();
});

for (const type of ["pointerup", "pointercancel"]) {
  map.addEventListener(type, event => {
    if (freeDrag?.pointer !== event.pointerId) return;
    clearTimeout(terminalHold);
    const { moved, previousStart, held } = freeDrag;
    freeDrag = undefined;
    if (held) return;
    if (!moved) return;
    suppressMapClick = true;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (type === "pointerup" && map.contains(target)) editFreeMap(target, mapPoint(event));
    else {
      freeStart = previousStart;
      paintMap();
    }
  });
}

map.addEventListener("contextmenu", event => {
  if (event.target.closest("[data-free-node]")) event.preventDefault();
});

map.addEventListener("click", event => {
  if (draft.network && view === "design") {
    demandTerminal = undefined;
    editFreeMap(event.target, mapPoint(event));
    return;
  }
  if (tool === "road") handleRoadTarget(event.target, mapPoint(event).y);
  if (tool === "lanes") selectLaneTarget(event.target.closest("[data-handle]")?.dataset.handle);
  const node = event.target.closest("[data-node]")?.dataset.node;
  if (tool === "junction" && node) selectJunction(node);
  const snap = event.target.closest("[data-snap]")?.dataset.snap;
  if (tool === "slip" && snap) {
    const point = mapPoint(event);
    setSlipAnchor(snap, snap === "start" ? point.y : point.x);
  }
});
map.addEventListener("keydown", event => {
  if (draft.network && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    const id = event.target.dataset.freeNode;
    if (event.key === " " && terminals[id]) {
      demandTerminal = id;
      $("[data-demand-layer]").innerHTML = demandMarkup();
      renderInspector();
    } else editFreeMap(event.target);
    return;
  }
  if (tool === "road" && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    handleRoadTarget(event.target);
    return;
  }
  const { handle: key, snap, node } = event.target.dataset;
  if (node && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    selectJunction(node);
    return;
  }
  if (snap && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    setSlipAnchor(snap, snap === "start" ? (205 + slipStartMax(draft)) / 2 : 386);
    return;
  }
  if (!key) return;
  if (tool === "lanes") {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      selectLaneTarget(key);
      map.querySelector(`[data-handle="${key}"]`)?.focus();
    }
    return;
  }
  const movement = key === "node" ? "pickup" : key === "slipStart" ? "slip" : undefined;
  if (movement && draft.road != null && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const count = connectionLaneCount(draft, movement);
    if (count) {
      const lane = clamp(selectedLane(draft, movement) + (event.key === "ArrowRight" ? 1 : -1), 1, count);
      setConnectionLane(movement, lane);
      render();
      map.querySelector(`[data-handle="${key}"]`)?.focus();
    }
    return;
  }
  const direction = key === "entry" || key === "slipBend" ? { ArrowLeft: 1, ArrowRight: -1 } : key === "slipEnd" ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
  if (!(event.key in direction)) return;
  event.preventDefault();
  updateHandle(key, draft[key] + direction[event.key] * (event.shiftKey ? 5 : 1));
  render();
  map.querySelector(`[data-handle="${key}"]`).focus();
});

function frame(timestamp) {
  if (!playing || view !== "simulate") return;
  const elapsed = previousFrame ? (timestamp - previousFrame) / 1000 : 0;
  previousFrame = timestamp;
  time = Math.min(duration, time + elapsed * 6);
  paintMap();
  updateSimulationReadout();
  if (time < duration) animationId = requestAnimationFrame(frame);
  else {
    playing = false;
    $("#play").textContent = "Play";
  }
}

function enterView(next) {
  cancelAnimationFrame(animationId);
  playing = false;
  previousFrame = 0;
  if (next === "simulate" && view !== "simulate") {
    time = 0;
    highlightQueues = false;
  }
  view = next;
  if (next !== "design" && !currentRun && !sumoMessage) runDeviceSumo();
  render();
}

document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const { tool: nextTool, view: nextView, action, lane, rule, roadMode: nextRoadMode, roadPreset, roadCount, movement } = button.dataset;
  if (nextTool) {
    if (draft.network && nextTool === "junction") roadMode = "select";
    slipAnchor = undefined;
    tool = nextTool;
    if (nextTool === "road" && draft.road?.length === 0) roadMode = "draw";
    laneSelected = false;
    render();
  } else if (nextView) {
    if (changed() && nextView !== "design") {
      inspectorCollapsed = false;
      renderInspector();
      $("#detail").textContent = "Apply or cancel your draft before leaving Design.";
      return;
    }
    enterView(nextView);
  } else if (action === "toggle-inspector") {
    inspectorCollapsed = !inspectorCollapsed;
    renderInspector();
    $(".inspector-toggle").focus();
  } else if (nextRoadMode) {
    roadMode = roadMode === nextRoadMode ? "select" : nextRoadMode;
    freeStart = freeRoad = freeNode = demandTerminal = undefined;
    roadStart = undefined;
    roadMessage = "";
    render();
  } else if (action === "clear-map") {
    draft.network = { nodes: [], roads: [] };
    freeStart = freeRoad = freeNode = demandTerminal = undefined;
    roadMode = "draw";
    roadMessage = "";
    camera = undefined;
    render();
  } else if (button.dataset.freePreset || button.dataset.freeCount) {
    const [first, second] = (button.dataset.freePreset ?? button.dataset.freeCount).split(":");
    const segment = draft.network.roads[freeRoad];
    replaceFreeRoad(button.dataset.freePreset ? { forward: Number(first), backward: Number(second) } :
      { [first]: segment[first] + Number(second) });
    render();
  } else if (button.dataset.control) {
    const network = draft.network;
    draft.network = { ...network, nodes: network.nodes.map(node =>
      node.id === freeNode ? { ...node, control: button.dataset.control } : node) };
    render();
  } else if (action === "remove-free-road") {
    const network = draft.network;
    draft.network = { ...network, roads: network.roads.filter((_, i) => i !== freeRoad) };
    freeRoad = undefined;
    render();
  } else if (roadPreset) {
    const [north, south] = roadPreset.split(":").map(Number);
    replaceRoadSegment({ north, south });
  } else if (roadCount) {
    const [direction, delta] = roadCount.split(":");
    const segment = avenueSegments(draft).find(item => item.top === roadSelected);
    replaceRoadSegment({ [direction]: segment[direction] + Number(delta) });
  } else if (movement) {
    const [name, laneNumber] = movement.split(":");
    setConnectionLane(name, Number(laneNumber));
    render();
  } else if (action === "clear-road" || action === "remove-segment") {
    if (action === "clear-road") {
      draft = { ...draft, road: [], lanes: 0, slipStart: 0, slipEnd: 0, schoolAccess: false, slipLane: 1, pickupLane: 1 };
      selectedJunction = slipAnchor = undefined;
    } else {
      draft.road = avenueSegments(draft).filter(item => item.top !== roadSelected);
    }
    roadSelected = roadStart = undefined;
    roadMode = action === "clear-road" ? "draw" : "select";
    render();
  } else if (lane) toggleLane(Number(lane));
  else if (rule) {
    draft[rule] = !draft[rule];
    render();
    inspector.querySelector(`[data-rule="${rule}"]`)?.focus();
  } else if (action === "remove-slip") {
    draft.slipStart = draft.slipEnd = 0;
    render();
  }
  else if (action === "apply" || action === "test") {
    if (changed()) {
      history.push(design);
      design = { ...draft };
      invalidateRun();
      save();
    }
    if (action === "test") enterView("simulate");
    else render();
  } else if (action === "undo" || action === "cancel") {
    if (action === "undo" && history.length) {
      design = history.pop();
      invalidateRun();
      save();
    }
    draft = { ...design };
    slipAnchor = undefined;
    roadSelected = roadStart = undefined;
    freeStart = freeRoad = freeNode = demandTerminal = undefined;
    roadMessage = "";
    roadMode = draft.network && !draft.network.roads.length ? "draw" : "select";
    render();
  } else if (action === "retry") {
    runDeviceSumo();
    render();
  } else if (action === "compare") {
    comparing = !comparing;
    render();
    $('[data-action="compare"]').focus();
  } else if (action === "peak") {
    cancelAnimationFrame(animationId);
    playing = false;
    view = "simulate";
    time = Number((currentRun.results.peakFrame * step).toFixed(1));
    highlightQueues = true;
    comparing = true;
    render();
    $('[data-action="peak"]').focus();
  } else if (action === "play") {
    playing = !playing;
    if (playing && time >= duration) time = 0;
    previousFrame = 0;
    button.textContent = playing ? "Pause" : "Play";
    if (playing) animationId = requestAnimationFrame(frame);
    else cancelAnimationFrame(animationId);
  }
});
inspector.addEventListener("input", event => {
  if (["green", "road-bend", "free-bend"].includes(event.target.id)) {
    if (event.target.id === "green") draft.green = Number(event.target.value);
    else if (event.target.id === "free-bend") {
      replaceFreeRoad({ bend: Number(event.target.value) });
      $("#detail").textContent = roadMessage || "Adjust the road curve.";
      $("#free-bend-value").textContent = draft.network.roads[freeRoad].bend;
      paintMap();
    } else {
      draft.road = avenueSegments(draft).map(item => item.top === roadSelected ? { ...item, bend: Number(event.target.value) } : item);
      $("#road-bend-value").textContent = event.target.value;
      paintMap();
    }
    updateGeometryReadouts();
    $('[data-action="apply"]').disabled = !changed();
    const secondary = inspector.querySelector(".actions button");
    secondary.dataset.action = changed() ? "cancel" : "undo";
    secondary.textContent = changed() ? "Cancel" : "Undo";
    secondary.disabled = !changed() && !history.length;
    return;
  }
  if (event.target.id !== "scrub") return;
  time = Number(event.target.value);
  highlightQueues = false;
  paintMap();
  updateSimulationReadout();
});

$("#menu").addEventListener("click", () => {
  const panel = $("#menu-panel");
  panel.hidden = !panel.hidden;
  $("#menu").setAttribute("aria-expanded", !panel.hidden);
});
function invalidateRun() {
  sumoWorker?.terminate();
  sumoWorker = undefined;
  currentRun = undefined;
  original = undefined;
  sumoMessage = "";
  time = 0;
  highlightQueues = false;
}

function runDeviceSumo() {
  if (sumoWorker) return;
  const runDesign = design;
  const fail = error => {
    console.warn("On-device SUMO failed", error);
    invalidateRun();
    sumoMessage = "The simulation couldn’t finish. Try again.";
    if (view !== "design") render();
  };
  try {
    const worker = new Worker(new URL("./sumo-worker.mjs", import.meta.url), { type: "module" });
    sumoWorker = worker;
    sumoMessage = "";
    worker.onerror = error => { if (sumoWorker === worker) fail(error.message); };
    worker.onmessageerror = () => { if (sumoWorker === worker) fail("Could not read worker results."); };
    worker.onmessage = ({ data }) => {
      if (sumoWorker !== worker) return;
      try {
        if (data.error) throw new Error(data.error);
        const comparison = readSumoComparison({ ...data, original: data.original ?? originalCache }, runDesign);
        original = originalCache = comparison.original;
        currentRun = comparison.edited;
        worker.terminate();
        sumoWorker = undefined;
        if (view !== "design") render();
      } catch (error) {
        fail(error);
      }
    };
    const request = sumoRequest(runDesign);
    if (originalCache && originalCache.results.finished + originalCache.results.waiting === request.trips.length) delete request.original;
    worker.postMessage(request);
  } catch (error) {
    fail(error);
  }
}

$("#reset").addEventListener("click", () => {
  history.push(design);
  design = { ...baseline };
  camera = undefined;
  invalidateRun();
  draft = { ...design };
  freeStart = freeRoad = freeNode = demandTerminal = undefined;
  roadMode = "select";
  roadMessage = "";
  save();
  $("#menu").click();
  enterView("design");
});

render();
if ("serviceWorker" in navigator) {
  const workerUrl = new URL("./sw.js", import.meta.url).href;
  const updateOfflineStatus = () => {
    if (navigator.serviceWorker.controller?.scriptURL === workerUrl) {
      $("#offline").textContent = "Ready for offline play";
    }
  };
  navigator.serviceWorker.addEventListener("controllerchange", updateOfflineStatus);
  navigator.serviceWorker.register(workerUrl).then(updateOfflineStatus)
    .catch(() => { $("#offline").textContent = "Offline setup unavailable"; });
} else $("#offline").textContent = "Offline setup unavailable";
