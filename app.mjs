import { readSumoComparison, sumoRequest } from "./sumo-export.mjs";
import { clearance } from "./sumo-network.mjs";
import { excessJunctionLanes, junctionLanePose, junctionLegs, junctionMovements, laneDropTaper, movementKey, moveNetworkNode, moveRoadLaneAnchor,
  networkLaneSamples, reconcileJunctionMovements, refreshLaneConnections, removeNetworkRoad, roadCurveFromPull, starterNetwork } from "./model.mjs";
import { avenueAnchors, avenueLanePath, avenueLaneX, avenuePieces, avenueSegmentAt, avenueSegments, laneSpacing, roadPresets, selectedLane, baseline, world, curve, pointOnCurve, duration, step, validate, greenBounds, mergeEndBounds, mergeTaper, normalizeDesign, replayMarkers, scale, schoolEntry, signalCycle, slipGeometry, slipStartMax, taperLengthBounds, vehicleDimensions, networkLaneWidth, networkNodeIssue, networkNodes, networkRoadGeometry, networkRoadIssue, connectNetworkRoad, nextNetworkNode, splitNetworkRoad, scheduledTrips, terminals, trees, tripTerminals } from "./model.mjs";

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
  draw: '<path d="m4 16-1 5 5-1L21 7l-4-4ZM14 6l4 4"/>',
  select: '<path d="M5 3v16l4-4 4 6 3-2-4-6h6Z"/>',
  node: '<path d="M3 12h5m8 0h5M12 3v5m0 8v5"/><circle cx="12" cy="12" r="4"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H10a5 5 0 0 0 0 10h3"/>',
  erase: '<path d="m3 15 10-11a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 9H8Zm5-6 9 8m-4 4h9"/>',
  stop: '<path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z" fill="#ba4345" stroke="#ffe4db"/><path d="M8 12h8" stroke="white"/>',
  yield: '<path d="M3 5h18l-9 15Z" fill="#f7e2ca" stroke="#c34743" stroke-width="3"/>',
  grid: '<path d="M4 4h16v16H4Zm0 8h16M12 4v16"/>',
  angle: '<path d="M3 19h18M3 19 16 6m-3 13a10 10 0 0 0-3-7"/>',
  reverse: '<path d="M3 8h17l-4-4m5 12H4l4 4"/>',
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
let freeApproach;
let junctionMode = "select";
let laneStart;
let selectedMovement;
let movementDrag;
let roadCamera;
let freeDrag;
let freeCurve = false;
let selectedLaneEnd;
let drawCurveGuide;
let laneFocus;
let laneCamera;
let pickingEndLane = false;
let laneFocusHeight;
let drawLanes = { forward: 1, backward: 1 };
const roadCurveHold = 360;
const snapping = { grid: false, angle: false, roads: true };
const networkUndo = [], networkRedo = [];
let demandTerminal;
let terminalHold;
let suppressHeldTouchClickUntil = 0;
const demandTrips = scheduledTrips(true);
let inspectorCollapsed = false;
let camera;
const mapPointers = new Map();
let cameraGesture;
let suppressMapClick = false;
let currentRun;
let time = 0;
let playing = false;
let playbackRate = 6;
let comparing = true;
let sumoWorker;
let sumoMessage = "";
let highlightQueues = false;
let previousFrame = 0;
let animationId;

document.addEventListener("pointerdown", () => { suppressHeldTouchClickUntil = 0; }, true);
document.addEventListener("click", event => {
  if (event.detail && performance.now() < suppressHeldTouchClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

function readSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (validate(saved)) return normalizeDesign(saved);
  } catch { /* A missing or unreadable save opens the original corridor. */ }
  return { ...baseline, network: starterNetwork() };
}

function editNetwork(network) {
  if (network === draft.network) return;
  if (draft.network) networkUndo.push(draft.network);
  if (networkUndo.length > 60) networkUndo.shift();
  networkRedo.length = 0;
  draft.network = reconcileJunctionMovements(network);
}

function clearNetworkSelection() {
  clearLaneFocus();
  pickingEndLane = false;
  freeStart = freeRoad = freeNode = freeApproach = demandTerminal = undefined;
  freeCurve = false;
  drawCurveGuide = selectedLaneEnd = undefined;
  laneStart = selectedMovement = undefined;
}

function focusLanePorts(id) {
  const node = networkNodes(draft.network).get(id);
  if (!node) return;
  if (!laneFocus) laneCamera = camera;
  laneFocus = id;
  camera = [node.x - 74, node.y - 74, 148, 148];
}

function clearLaneFocus() {
  if (laneFocus) camera = laneCamera;
  laneFocus = laneCamera = laneFocusHeight = undefined;
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
  <defs>
    <marker id="lane-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#c4f8ff"/></marker>
    <pattern id="grass-grain" width="36" height="28" patternUnits="userSpaceOnUse">
      <path d="M3 8l1-2m10 15 2-2m10-13 2 1m5 15 2-1" fill="none" stroke="#698466" stroke-opacity=".21" stroke-width=".8"/>
      <path d="m3 23 3 1m13-12 2-1m8 5h3" fill="none" stroke="#ecf1df" stroke-opacity=".45" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="-400" y="-600" width="1300" height="2000" fill="#ccd8bf"/>
  <path d="M-30 84 204 91 220 159 215 310 176 327H-30Z M330 94H525V333L347 322 320 289Z
    M-30 511 203 518 205 658-30 679Z M334 527 536 508V668L345 682Z" fill="#dce3cd"/>
  <path d="M22 108 198 102 215 146 207 302 167 316 22 311Z" fill="#b7c9a9" stroke="#e2ead5" stroke-width="2"/>
  <path d="M337 103h83v66h-83zM355 238h90v59h-90zM25 522h117v96H25z" fill="#c7d4b8" stroke="#a9bc9c" stroke-width=".7" stroke-dasharray="3 3"/>
  <path d="M-20 380C76 357 118 379 204 364M-20 391C82 365 135 394 212 374M309 485C376 461 452 483 522 463M316 494C384 470 458 493 522 472"
    fill="none" stroke="#b9c9ad" stroke-width="1.25"/>
  <rect x="-400" y="-600" width="1300" height="2000" fill="url(#grass-grain)"/>
  <path d="M44 181H143V217H134V221H44Z M138 192H204V245H138Z" fill="#d7cfb7"/>
  <path d="M61 216V228M142 215H131M171 237v27l-16 9v29" fill="none" stroke="#e3ddc8" stroke-width="5"/>
  <g fill="#556751" opacity=".2" transform="translate(3 3)">
    <path d="M48 190H131V216H48Z M143 200H199V237H143Z M36 540H126V604H36Z M358 116H406V164H358Z M371 254H431V283H371Z"/>
  </g>
  <g stroke="#8b8571" stroke-width="1.1" stroke-linejoin="round">
    <path d="M48 190H131V216H48Z M143 200H199V237H143Z" fill="#b5a48d"/>
    <path d="M48 190H131L125 202H54Z M143 200H199L192 216H150Z" fill="#ded2b7"/>
    <path d="M54 202H125L131 216H48Z M150 216H192L199 237H143Z" fill="#c8b89e"/>
    <path d="M36 540H126V604H36Z M358 116H406V164H358Z M371 254H431V283H371Z" fill="#b6816f"/>
    <path d="M36 540H126L111 569H51Z M358 116H406L394 139H370Z M371 254H431L421 267H381Z" fill="#d8a88e"/>
    <path d="M51 569H111L126 604H36Z M370 139H394L406 164H358Z M381 267H421L431 283H371Z" fill="#c9957d"/>
  </g>
  <path d="M65 193h18v6H65zM163 204h12v6h-12z" fill="#65808c" stroke="#e4ddcd" stroke-width="1"/>
  <path d="M69 193v6m5-6v6m5-6v6m88 5v6m4-6v6" stroke="#9eb5bd" stroke-width=".65"/>
  <path d="M65 555h8v8h-8zM378 123h6v7h-6zM409 257h6v6h-6z" fill="#76594e"/>
  <rect x="52" y="228" width="92" height="57" rx="6" fill="#819d70" stroke="#d7e2c7" stroke-width="1.5"/>
  <path d="M61 234h9v45h-9zm18 0h9v45h-9zm18 0h9v45h-9zm18 0h9v45h-9zm18 0h4v45h-4z" fill="#a6bb8d" opacity=".5"/>
  <path d="M59 235H137V278H59ZM98 235V278M59 246h11v21H59m78-21h-11v21h11" fill="none" stroke="#e4edda" stroke-width="1"/>
  <circle cx="98" cy="256.5" r="7" fill="none" stroke="#e4edda" stroke-width="1"/>
  ${trees.map(([x, y], i) => `<g transform="translate(${x} ${y})">
    <ellipse cx="1.7" cy="2.2" rx="5.6" ry="4.3" fill="#50674c" opacity=".21"/>
    <circle r="5.6" fill="${i % 3 === 1 ? "#758f66" : "#819b70"}"/>
    <path d="M-4 1c-2-4 1-6 4-5 3 0 4 2 3 4-2-2-4 2-7 1Z" fill="#a5b88d"/>
  </g>`).join("")}
  <text x="53" y="225" fill="#46634f" font-size="10" font-family="system-ui" font-weight="670">Alder School</text>`;
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

function mapMarkup(config, editing) {
  const primary = curve(config, 1);
  const secondary = curve(config, 2);
  const main = config.lanes & 1;
  const aux = config.lanes & 2;
  const selectedGeometry = main ? primary : secondary;
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

  const light = (road, x, y) => {
    return `<circle cx="${x}" cy="${y}" r="5" fill="#263944"/><circle data-signal-approach="${road}" cx="${x}" cy="${y}" r="2.8" fill="#ff987d"/>`;
  };
  if (!config.network) content += light("avenue", 245, 197) + light("cross", 229, 172);
  if (editing && tool === "signal") {
    content += '<path d="M254 210V365 M208 180H72" stroke="#c4f8ff" stroke-width="3" opacity=".8" stroke-dasharray="6 5"/>';
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
  if (editing && !config.network && tool === "junction") content += junctionMarkers(config);
  if (editing && !config.network && tool === "road") content += roadTargets(config);
  return content;
}

const vehicleColors = { car: "#eef1e4", bus: "#8ee4ff", pickup: "#bfaaf2", queue: "#ffd191" };

function inPeakQueue(car, frame) {
  return car.reason && (frame.queueLane ? car.lane === frame.queueLane : car.zone === frame.queueZone);
}

function vehicleMarkup(car, frame) {
  const { length, width } = vehicleDimensions(car.kind);
  const half = length / scale / 2, beam = width / scale / 2;
  const fill = vehicleColors[car.reason ? "queue" : car.kind];
  const ring = highlightQueues && inPeakQueue(car, frame)
    ? `<rect x="${-half - 1}" y="${-beam - 1}" width="${2 * half + 2}" height="${2 * beam + 2}" rx="2" fill="#ffbd613d" stroke="#ffab49" stroke-width="1"/>`
    : "";
  const bus = car.kind === "bus";
  const window = half * (bus ? .7 : .38);
  return `<g transform="translate(${car.x} ${car.y}) rotate(${car.angle * 180 / Math.PI})" class="vehicle ${car.kind}${car.reason ? " queued" : ""}">${ring}
    <rect x="${-half + .35}" y="${-beam + .48}" width="${2 * half}" height="${2 * beam}" rx="${beam}" fill="#203340" opacity=".65"/>
    <rect x="${-half}" y="${-beam}" width="${2 * half}" height="${2 * beam}" rx="${bus ? .65 : beam * .72}" fill="${fill}" stroke="#293c47" stroke-width=".38"/>
    <path d="M${window} ${-beam * .72}v${beam * 1.44}M${-window} ${-beam * .65}v${beam * 1.3}" stroke="#3c6070" stroke-width="${bus ? 1.2 : .82}"/>
    <path d="M${-half + .55} ${-beam * .66}v${beam * .34}m0 ${beam * .63}v${beam * .34}" fill="none" stroke="#bd5557" stroke-width=".48"/>
    ${bus ? `<path d="M${-window + 1.3} ${-beam * .64}H${window - 1.3}M${-window + 1.3} ${beam * .64}H${window - 1.3}" stroke="#487f95" stroke-width=".48" stroke-dasharray="1.15 .45"/>` : ""}</g>`;
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
  const intersection = editing && tool === "junction" && network.nodes.find(node => node.id === freeNode);
  const label = (x, y, name) => {
    const width = name.length * 7 + 12;
    return `<rect x="${x - width / 2}" y="${y - 14}" width="${width}" height="18" fill="transparent"/>
      <text x="${x}" y="${y}" text-anchor="middle" fill="#173f53" stroke="#e1e6d8" stroke-width="3"
        paint-order="stroke" font-size="12" font-weight="750">${name}</text>`;
  };
  const roads = network.roads.map((road, index) => {
    const geometry = networkRoadGeometry(road, nodes);
    const { path, samples } = geometry;
    const selected = editing && tool === "road" && index === freeRoad;
    const lanePaths = [true, false].flatMap(forward => Array.from({ length: forward ? road.forward : road.backward }, (_, lane) =>
      networkLaneSamples(road, network, nodes, forward, lane, geometry).map(({ x, y }) => `${x},${y}`).join(" ")));
    const stroke = (color, width) => lanePaths.map(points =>
      `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${width}"/>`).join("");
    const divider = Array.from({ length: road.forward + road.backward - 1 }, (_, lane) => {
      const offset = (lane + 1 - road.backward) * networkLaneWidth;
      const points = samples.filter((_, i) => i % 5 === 0).map(({ x, y, angle }) =>
        `${x - Math.sin(angle) * offset},${y + Math.cos(angle) * offset}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${offset === 0 ? "#ecc98f" : "#e3e6da"}" stroke-width="1" stroke-dasharray="4 4"/>`;
    }).join("");
    const mergeMarks = [true, false].flatMap(forward => {
      const drops = laneDropTaper(network, road, nodes, forward);
      return Array.from({ length: drops }, (_, lane) => {
        const points = networkLaneSamples(road, network, nodes, forward, lane, geometry);
        const p = points[Math.max(2, points.length - 6)];
        return `<path d="M-4 0h3l5-2m-3-1 3 1-2 3" fill="none" stroke="#f0dc9e" stroke-width="1.05"
          transform="translate(${p.x} ${p.y}) rotate(${p.angle * 180 / Math.PI})" pointer-events="none"/>`;
      });
    }).join("");
    const arrows = selected ? [["forward", samples[38], 0], ["backward", samples[62], 180]].map(([direction, point, turn]) =>
      road[direction] ? `<path d="M-5-4L3 0-5 4" fill="none" stroke="#c4f8ff" stroke-width="2" pointer-events="none"
        transform="translate(${point.x} ${point.y}) rotate(${point.angle * 180 / Math.PI + turn})"/>` : "").join("") : "";
    const hitPath = road.laneA || road.laneB ? `M${lanePaths[0].replaceAll(" ", "L")}` : path;
    return `<g>${stroke("#e4e9d4", networkLaneWidth + 1.8)}${stroke(selected ? "#206483" : "#404d55", networkLaneWidth + .45)}
      <g pointer-events="none">${divider}</g>${arrows}${mergeMarks}
      ${editing && tool === "road" && roadMode !== "draw" ? `<path d="${hitPath}" data-free-road="${index}" role="button" tabindex="0" aria-label="Road ${index + 1}"
        aria-pressed="${selected}" fill="none" stroke="transparent" stroke-width="${Math.max(21, 2 * networkLaneWidth * Math.max(road.forward, road.backward))}"/>` : ""}</g>`;
  }).join("");
  const stubs = Object.values(terminals).map(({ x, y, dx, dy }) =>
    `<path d="M${x} ${y}l${dx} ${dy}" stroke="#46525b" stroke-width="12"/>`).join("");
  if (!editing) return stubs + roads;
  const start = drawStartPoint(network);
  const preview = freeDrag?.point;
  const guide = drawCurveGuide;
  const endpoint = guide?.target ?? (freeDrag?.kind === "draw" || freeDrag?.kind === "draw-end" || freeDrag?.kind === "curve-draw" ? preview : undefined);
  const controls = guide && start && roadCurveFromPull(drawAnchorPoint(network, freeStart), drawAnchorPoint(network, endpoint), guide.delta);
  const previewMarkup = roadGestureMarkup(start, endpoint, controls, guide, preview);
  const selectedJunction = network.nodes.find(node => node.id === freeNode);
  const approaches = tool === "road" && roadMode === "select" && !selectedLaneEnd && selectedJunction?.control === "priority" && !selectedJunction.movements ? incomingApproaches(network, freeNode).map(approach => {
    const { x, y } = approach.point;
    return `<g class="road-target" data-approach="${approach.index}" role="button" tabindex="0"
      aria-label="${approach.label}" aria-pressed="${freeApproach === approach.index}">
      <circle cx="${x}" cy="${y}" r="16" fill="transparent"/>
      <circle cx="${x}" cy="${y}" r="8" fill="${freeApproach === approach.index ? "#c4f8ff" : approach.rule === "stop" ? "#a13f38" : "#24516a"}" stroke="#c4f8ff" stroke-width="2"/>
      <path d="M-3-3L2 0-3 3" transform="translate(${x} ${y}) rotate(${approach.angle})" stroke="${freeApproach === approach.index ? "#0f4b70" : "#c4f8ff"}"
        stroke-width="1.5" fill="none" pointer-events="none"/></g>`;
  }).join("") : "";
  const pins = intersection ? "" : [...nodes.values()].map(node => {
    const { id, x, y } = node;
    const active = id === freeStart?.id || id === freeNode || id === demandTerminal;
    return `<g class="road-target" data-free-node="${id}" role="button" tabindex="0" aria-label="${node.name ? node.name + " connection" : "Junction " + id.slice(1)}" aria-pressed="${active}">
      <circle cx="${x}" cy="${y}" r="${Math.min(21, 13 / mapScale())}" fill="transparent"/>
      <circle cx="${x}" cy="${y}" r="${active ? 9 : node.name || roadMode === "draw" ? 8 : 6.5}" fill="${active || roadMode === "draw" ? "#c4f8ff" : node.control === "traffic_light" ? "#398257" : node.control === "allway_stop" ? "#a13f38" : "#0f4b70"}" stroke="${active || roadMode === "draw" ? "#0f4b70" : "#c4f8ff"}" stroke-width="2"/>
      ${node.name ? label(x, y + (id === "north" ? 23 : -15), node.name) : ""}</g>`;
  }).join("");
  const segment = network.roads[freeRoad];
  let handles = "";
  if (freeCurve && segment) {
    const { start, a, b, end } = networkRoadGeometry(segment, nodes);
    const controls = freeDrag?.kind === "curve" && preview ? [a, b].map((p, i) => i === freeDrag.handle ? preview : p) : [a, b];
    handles = `<g fill="none" stroke="#0f4b70" stroke-width="2">
      <path d="M${start.x} ${start.y}C${controls[0].x} ${controls[0].y} ${controls[1].x} ${controls[1].y} ${end.x} ${end.y}" stroke="#c4f8ff" stroke-width="3" pointer-events="none"/>
      ${controls.map(({ x, y }, i) => `<path d="M${i ? end.x : start.x} ${i ? end.y : start.y}L${x} ${y}" stroke-dasharray="4 3" pointer-events="none"/>
        <g data-curve-handle="${i}" role="button" tabindex="0" aria-label="Curve handle ${i + 1}" class="road-target">
        <circle cx="${x}" cy="${y}" r="16" fill="transparent" stroke="none"/>
        <circle cx="${x}" cy="${y}" r="7" fill="#c4f8ff"/></g>`).join("")}</g>`;
  }
  const grid = snapping.grid && (roadMode === "draw" || freeNode && !terminals[freeNode]) ?
    '<defs><pattern id="snap-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle r="1.3" fill="#0f4b70" opacity=".38"/></pattern></defs><rect x="8" y="68" width="484" height="554" fill="url(#snap-grid)" pointer-events="none"/>' : "";
  return grid + stubs + roads + '<defs><marker id="demand-arrow" orient="auto" markerWidth="4" markerHeight="4" refX="3.5" refY="2"><path d="M0 0L4 2L0 4Z" fill="#0f7090"/></marker></defs>'
    + `<g data-demand-layer pointer-events="none">${demandMarkup()}</g>` + approaches + pins + `<g data-road-preview>${previewMarkup}</g>` + handles
    + (tool === "road" ? roadLaneAnchors(network, nodes) : "")
    + (intersection ? intersectionMarkup(network, intersection) : "");
}

function roadGestureMarkup(start, endpoint, controls, guide, preview) {
  if (freeDrag?.kind === "move" && preview) {
    const network = draft.network;
    const nodes = networkNodes(network);
    const legs = junctionLegs(network, freeDrag.id);
    const paths = legs.map(leg => {
      const geometry = networkRoadGeometry(leg.road, nodes);
      const { a, b, start, end } = geometry;
      const dx = preview.x - (leg.atA ? start.x : end.x), dy = preview.y - (leg.atA ? start.y : end.y);
      const controls = leg.atA ? [a.x + dx, a.y + dy, b.x, b.y] : [a.x, a.y, b.x + dx, b.y + dy];
      return `<path d="${draftRoadPath(leg.atA ? preview : start, leg.atA ? end : preview, controls)}" fill="none"
        stroke="#55bcd4" stroke-width="${Math.max(3, (leg.road.forward + leg.road.backward) * networkLaneWidth)}" stroke-opacity=".65"/>`;
    }).join("");
    return `<g pointer-events="none">${paths}<circle cx="${preview.x}" cy="${preview.y}" r="8" fill="#c4f8ff" stroke="#0f4b70" stroke-width="2"/></g>`;
  }
  if (freeDrag?.kind === "lane" && preview) {
    const { start: a, end: b } = networkRoadGeometry(draft.network.roads[freeRoad], networkNodes(draft.network));
    const other = freeDrag.end === "a" ? b : a;
    return `<path d="${draftRoadPath(other, preview)}" fill="none" stroke="#7ee2e5" stroke-width="5" stroke-dasharray="4 4" pointer-events="none"/>`;
  }
  return endpoint && start && roadMode === "draw" ? `<g pointer-events="none">
    <path d="${draftRoadPath(start, endpoint, controls)}" stroke="#eef7df" stroke-opacity=".8"
      fill="none" stroke-width="${drawWidth() + 3}" stroke-linecap="round"/>
    <path d="${draftRoadPath(start, endpoint, controls)}" stroke="#1d7592" fill="none"
      stroke-width="${drawWidth()}" stroke-opacity=".79" stroke-dasharray="6 4" stroke-linecap="round"/>
    ${guide ? `<line x1="${endpoint.x}" y1="${endpoint.y}" x2="${guide.finger.x}" y2="${guide.finger.y}" stroke="#c4f8ff" stroke-width="${1.25 / mapScale()}" stroke-dasharray="3 3"/>
      <g class="draw-curve-ball" transform="translate(${guide.finger.x} ${guide.finger.y - 25 / mapScale()}) scale(${1 / mapScale()})">
      <circle r="16" fill="#174157" fill-opacity=".84" stroke="#c4f8ff" stroke-width="2"/>
      <ellipse rx="8" ry="14" fill="none" stroke="#b1dfec" stroke-opacity=".66"/>
      <ellipse rx="14" ry="6" fill="none" stroke="#b1dfec" stroke-opacity=".66"/></g>` : ""}
    <circle cx="${endpoint.x}" cy="${endpoint.y}" r="${5 / mapScale()}" fill="#c4f8ff" stroke="#0f4b70" stroke-width="${2 / mapScale()}"/></g>` : "";
}

function mapScale() {
  return map.getScreenCTM()?.a || 1;
}

function drawStartPoint(network) {
  return freeStart && (freeStart.anchor ? freeStart : networkNodes(network).get(freeStart.id) ?? freeStart);
}

function drawAnchorPoint(network, point) {
  return point.id ? networkNodes(network).get(point.id) : point;
}

function drawWidth() {
  return (freeStart?.anchor || drawCurveGuide?.target.anchor ? 1 : drawLanes.forward + drawLanes.backward) * networkLaneWidth;
}

function draftRoadPath(start, end, controls) {
  return `M${start.x} ${start.y} ${controls ? `C${controls.join(" ")}` : "L"} ${end.x} ${end.y}`;
}

function availableLaneAnchors(network, nodes, direction, { exclude, end, all = false } = {}) {
  const ports = [];
  for (const node of nodes.values()) {
    if (node.id === exclude || laneFocus && node.id !== laneFocus) continue;
    const legs = junctionLegs(network, node.id, nodes);
    const hostLegs = legs.filter(leg => !leg.slip);
    const setback = Math.min(39, Math.max(laneFocus ? 29 : 21, 23 / mapScale()));
    for (const leg of hostLegs) {
      const excess = excessJunctionLanes(hostLegs, leg, direction);
      const count = all || hostLegs.length === 1 ? leg[direction] : excess;
      for (let lane = 0; lane < count; lane++) {
        const taken = direction === "incoming" && lane < excess &&
          legs.some(item => item.departureAnchor?.neighbor === leg.neighbor && item.departureAnchor.lane === lane);
        if (taken && end !== "a") continue;
        ports.push({ id: node.id, anchor: { neighbor: leg.neighbor, lane }, direction, excess: lane < excess,
          ...junctionLanePose(leg, nodes, direction, lane, setback) });
      }
    }
  }
  return ports;
}

const lanePortKey = port => `${port.id}:${port.anchor.neighbor}:${port.anchor.lane}`;

function lanePortMarkup(port, active) {
  const { id, x, y, anchor, direction } = port;
  const radius = Math.min(4.2, Math.max(2.7, 3.1 / mapScale()));
  const color = direction === "incoming" ? "#8ceccf" : "#b9c7ff";
  return `<g class="road-target lane-anchor${port.excess ? " extra-lane" : ""}" data-road-lane="${lanePortKey(port)}" data-anchor-node="${id}"
    data-anchor-neighbor="${anchor.neighbor}" data-anchor-lane="${anchor.lane}" role="button" tabindex="0"
    aria-pressed="${active}" aria-label="${direction === "incoming" ? "Start from" : "Connect to"} lane ${anchor.lane + 1} ${direction === "incoming" ? "from" : "toward"} ${terminals[anchor.neighbor]?.name ?? "junction " + anchor.neighbor.slice(1)} at ${terminals[id]?.name ?? "junction " + id.slice(1)}">
    <circle cx="${x}" cy="${y}" r="${Math.min(radius + 2, 6)}" fill="transparent"/>
    <circle cx="${x}" cy="${y}" r="${radius}" fill="${active ? "#fff0b4" : color}" stroke="#153d4e" stroke-width="1.15"/>
    <path d="M${x - radius * .52} ${y}h${radius * 1.04}m${-radius * .52} ${-radius * .52}v${radius * 1.04}" fill="none" stroke="#153d4e" stroke-width="1" pointer-events="none"/>
    </g>`;
}

function roadLaneAnchors(network, nodes) {
  const road = network.roads[freeRoad];
  if (roadMode === "draw") {
    const direction = freeStart ? "outgoing" : "incoming";
    const options = availableLaneAnchors(network, nodes, direction, { all: !!laneFocus || !freeStart && drawLanes.forward === 1 && !drawLanes.backward,
      exclude: freeStart?.id });
    return options.map(port => lanePortMarkup(port, false)).join("") +
      (freeStart?.anchor ? lanePortMarkup({ ...freeStart, direction: "incoming" }, true) : "");
  }
  if (roadMode !== "select" || !road || road.forward !== 1 || road.backward || freeCurve) return "";
  const path = networkLaneSamples(road, network, nodes, true, 0);
  const handles = [["a", path[4]], ["b", path.at(-5)]].filter(([end]) => !selectedLaneEnd || selectedLaneEnd === end)
    .map(([end, point]) => `<g class="road-target lane-anchor" data-lane-end="${end}" role="button" tabindex="0"
    aria-label="Lane ${end === "a" ? "start" : "end"} handle">
    <circle cx="${point.x}" cy="${point.y}" r="${Math.min(11, 12 / mapScale())}" fill="transparent"/>
    <circle cx="${point.x}" cy="${point.y}" r="${Math.min(5.4, 6 / mapScale())}" fill="#b9c7ff" stroke="#153d4e" stroke-width="1.6"/></g>`).join("");
  if (selectedLaneEnd || freeDrag?.kind === "lane") {
    const end = selectedLaneEnd ?? freeDrag.end;
    const options = availableLaneAnchors(network, nodes, end === "a" ? "incoming" : "outgoing",
      { all: !!laneFocus || !!freeDrag, end, exclude: road[end === "a" ? "b" : "a"] });
    return handles + options.map(port => lanePortMarkup(port, false)).join("");
  }
  return handles;
}

function intersectionLanes(network, node) {
  const nodes = networkNodes(network);
  const legs = junctionLegs(network, node.id);
  const setback = Math.max(20, ...legs.map(leg => Math.max(leg.incoming, leg.outgoing) * networkLaneWidth + 6));
  return legs.flatMap(leg => {
    const geometry = networkRoadGeometry(leg.road, nodes);
    const distance = Math.min(setback * scale, geometry.length * .62);
    const p = pointOnCurve(geometry, leg.atA ? distance : geometry.length - distance);
    const angle = p.angle + (leg.atA ? 0 : Math.PI);
    const name = terminals[leg.neighbor]?.name ?? `Junction ${leg.neighbor.slice(1)}`;
    return [["in", leg.incoming, -1], ["out", leg.outgoing, 1]].flatMap(([direction, count, side]) =>
      Array.from({ length: count }, (_, lane) => {
        const offset = side * (count - lane - .5) * networkLaneWidth;
        return {
          key: `${direction}:${leg.neighbor}:${lane}`, direction, lane, neighbor: leg.neighbor,
          label: `${direction === "in" ? "From" : "To"} ${name}, lane ${lane + 1}`,
          angle, x: p.x - Math.sin(angle) * offset, y: p.y + Math.cos(angle) * offset
        };
      }));
  });
}

function movementPath(from, to) {
  const reach = Math.hypot(to.x - from.x, to.y - from.y) * .36;
  const control = point => `${point.x - Math.cos(point.angle) * reach} ${point.y - Math.sin(point.angle) * reach}`;
  return `M${from.x} ${from.y} C${control(from)} ${control(to)} ${to.x} ${to.y}`;
}

function intersectionMarkup(network, node) {
  const lanes = intersectionLanes(network, node);
  const lookup = new Map(lanes.map(lane => [lane.key, lane]));
  const links = junctionMovements(network, node).map(move => {
    const from = lookup.get(`in:${move.from}:${move.fromLane}`), to = lookup.get(`out:${move.to}:${move.toLane}`);
    const key = movementKey(move);
    const active = selectedMovement === key;
    const color = node.control === "priority" && move.rule === "stop" ? "#ff8378" :
      node.control === "priority" && move.rule === "yield" ? "#ffcf82" : "#75e4f1";
    const visible = !laneStart || laneStart === from.key || laneStart === to.key;
    const path = movementPath(from, to);
    return `<g data-lane-link="${key.replace(">", "&gt;")}" role="button" tabindex="0" aria-pressed="${active}" aria-label="${from.label} → ${to.label}">
      <path d="${path}" fill="none" stroke="transparent" stroke-width="5" ${visible ? "" : 'pointer-events="none"'}/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="${active ? 2.4 : 1.2}"
        opacity="${active || visible ? 1 : .19}" marker-end="url(#movement-arrow)" pointer-events="none"/></g>`;
  }).join("");
  return `<defs><marker id="movement-arrow" orient="auto" markerWidth="3" markerHeight="3" refX="3" refY="1.5">
    <path d="M0 0L3 1.5 0 3Z" fill="#c4f8ff"/></marker></defs>
    <circle cx="${node.x}" cy="${node.y}" r="${Math.max(19, ...lanes.map(lane => Math.hypot(lane.x - node.x, lane.y - node.y) * .86))}" fill="#354a56" pointer-events="none"/>${links}<g data-movement-preview pointer-events="none"/>${lanes.map(lane =>
    `<g data-lane-port="${lane.key}" role="button" tabindex="0" class="road-target" aria-label="${lane.label}">
    <circle cx="${lane.x}" cy="${lane.y}" r="3.25" fill="${laneStart === lane.key ? "#fff3bb" : lane.direction === "in" ? "#7de1f2" : "#bca8f6"}"
      stroke="#12394c" stroke-width="1"/></g>`).join("")}`;
}

function destinationCounts(id) {
  const counts = new Map();
  for (const trip of demandTrips) {
    const [origin, destination] = tripTerminals(trip);
    if (origin === id) counts.set(destination, (counts.get(destination) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

function demandDetails(id) {
  const destinations = destinationCounts(id);
  return `<div class="terminal-demand" role="status"><strong>From ${terminals[id].name}</strong>
    <p>${destinations.length ? destinations.map(([to, count]) => `${terminals[to].name} · ${count} trips`).join(" / ") : "Arrival only"}</p></div>`;
}

function incomingApproaches(network, nodeId) {
  if (!nodeId || terminals[nodeId]) return [];
  const nodes = networkNodes(network);
  return network.roads.flatMap((road, index) => {
    const atA = road.a === nodeId && road.backward;
    if (!atA && !(road.b === nodeId && road.forward)) return [];
    const end = atA ? "atA" : "atB";
    const geometry = networkRoadGeometry(road, nodes);
    const offset = Math.min(28 * scale, geometry.length * .6);
    const point = pointOnCurve(geometry, atA ? offset : geometry.length - offset);
    const from = nodes.get(atA ? road.b : road.a), to = nodes.get(nodeId);
    const direction = Math.abs(from.x - to.x) > Math.abs(from.y - to.y) ?
      (from.x > to.x ? "east" : "west") : (from.y > to.y ? "south" : "north");
    const label = terminals[from.id] ? `From ${terminals[from.id].name}` : `From ${direction}`;
    return [{ index, end, label, point, angle: point.angle * 180 / Math.PI + (atA ? 180 : 0), rule: road[end] ?? "default" }];
  });
}

function freeControls() {
  const segment = draft.network.roads[freeRoad];
  const node = draft.network.nodes.find(item => item.id === freeNode);
  const approaches = incomingApproaches(draft.network, node?.id);
  const selected = approaches.find(approach => approach.index === freeApproach);
  const approachControls = node?.control === "priority" && !node.movements && approaches.length ? `<div class="row chips">
    ${approaches.map(approach => `<button data-approach-select="${approach.index}" aria-pressed="${approach === selected}">${approach.label}</button>`).join("")}</div>
    ${selected ? `<div class="row chips" aria-label="Approach rule">${[["default", "Default"], ["priority", "Right of way"], ["yield", "Yield"], ["stop", "Stop sign"]]
      .map(([rule, label]) => `<button data-approach-rule="${rule}" aria-pressed="${selected.rule === rule}">${label}</button>`).join("")}</div>` : ""}` : "";
  const lanes = roadMode === "draw" ? drawLanes : segment;
  const buttons = [
    ["draw", "Draw", 'data-road-mode="draw"', roadMode === "draw"],
    ["select", "Select", 'data-road-mode="select"', roadMode === "select"],
    ["node", "Add node", 'data-road-mode="split"', roadMode === "split"],
    ["curve", "Adjust curve", 'data-action="curve-handles"', freeCurve, !segment],
    ["undo", "Undo", 'data-action="network-undo"', undefined, !networkUndo.length],
    ["redo", "Redo", 'data-action="network-redo"', undefined, !networkRedo.length],
    ["erase", "Clear map", 'data-action="clear-map"', undefined, !draft.network.roads.length && !draft.network.nodes.length]
  ];
  const shortLabels = { draw: "Draw", select: "Select", node: "Add", curve: "Curve", undo: "Undo", redo: "Redo", erase: "Clear" };
  const tools = buttons.map(([symbol, label, data, active, disabled]) =>
    `<button ${data} aria-label="${label}" title="${label}" ${active === undefined ? "" : `aria-pressed="${active}"`}
      ${disabled ? "disabled" : ""}>${icon(symbol)}<span class="tool-label">${shortLabels[symbol]}</span></button>`).join("");
  const snaps = roadMode === "draw" || node || roadMode === "split" ? `<div class="snap-controls" aria-label="Snapping">
    ${[["grid", "Grid", "grid"], ["angle", "Angle", "angle"], ["roads", "Roads", "road"]].map(([key, label, symbol]) =>
      `<button data-snap-option="${key}" aria-label="Snap to ${label.toLowerCase()}" aria-pressed="${snapping[key]}">${icon(symbol)}${label}</button>`).join("")}</div>` : "";
  const preset = (label, forward, backward) => `<button data-free-preset="${forward}:${backward}"
    aria-pressed="${lanes.forward === forward && lanes.backward === backward}">${laneArtwork(forward, backward)}<span>${label}</span></button>`;
  const counts = (direction, side) => `<div class="lane-count">
    <button data-free-count="${direction}:1" aria-label="Add lane ${side}" ${lanes[direction] >= 4 ? "disabled" : ""}>${laneArtwork(lanes.forward, lanes.backward, side)}<span>+ ${side}</span></button>
    <button data-free-count="${direction}:-1" aria-label="Remove lane ${side}" ${!lanes[direction] || lanes.forward + lanes.backward === 1 ? "disabled" : ""}>−</button></div>`;
  const laneEnds = segment?.forward === 1 && !segment.backward && !freeCurve ? `<div class="row chips lane-edit-actions">
    <button data-action="move-lane-a" aria-pressed="${selectedLaneEnd === "a"}">Move lane start</button>
    <button data-action="move-lane-b" aria-pressed="${selectedLaneEnd === "b"}">Move lane end</button>
    ${laneFocus ? '<button data-action="lane-overview">Map overview</button>' : ""}</div>` : "";
  const branch = freeStart?.anchor ? `<div class="row chips lane-edit-actions">
    <button data-action="finish-lane">Keep lane merge</button>
    ${laneFocus ? '<button data-action="lane-overview">Map overview</button>' : ""}</div>` :
    roadMode === "draw" && drawLanes.forward === 1 && !drawLanes.backward && freeStart?.id && !laneFocus ?
      `<div class="row chips lane-edit-actions"><button data-action="start-lane-picker">Choose start lane</button>
      <button data-action="end-lane-picker" aria-pressed="${pickingEndLane}">Choose end lane</button></div>` :
      roadMode === "draw" && laneFocus ? '<div class="row chips lane-edit-actions"><button data-action="lane-overview">Map overview</button></div>' : "";
  return `<div class="builder-tools" aria-label="Road Builder tools">${tools}</div>${snaps}
    ${node ? `<div class="row chips">
      <button data-action="move-free-node">Move node</button>
      <button data-control="priority" aria-pressed="${node.control === "priority"}">Unsignalized</button>
      <button data-control="allway_stop" aria-pressed="${node.control === "allway_stop"}">All-way stop</button>
      <button data-control="traffic_light" aria-pressed="${node.control === "traffic_light"}">Traffic light</button></div>` : ""}
    ${approachControls}
    ${laneEnds}${branch}
    ${lanes && !freeCurve && !selectedLaneEnd && !freeStart?.anchor ? `<div class="lane-cards" aria-label="Road types">
      ${preset("One-way", 1, 0)}${preset("Two-lane", 1, 1)}${preset("Three-lane", 2, 1)}${preset("Four-lane", 2, 2)}</div>
      <div class="lane-adjustments">${counts("backward", "left")}${counts("forward", "right")}
        ${segment ? `<button data-action="reverse-road" aria-label="Flip lane directions" title="Flip lane directions">${icon("reverse")}</button>
        <button data-action="remove-free-road" aria-label="Remove road" title="Remove road">${icon("erase")}</button>` : ""}</div>` : ""}`;
}

function intersectionControls(node) {
  const movement = node && junctionMovements(draft.network, node).find(move => movementKey(move) === selectedMovement);
  const buttons = [
    ["draw", "Draw movement", "draw"], ["select", "Select movement", "select"],
    ["undo", "Undo", null, !networkUndo.length], ["redo", "Redo", null, !networkRedo.length],
    ["erase", "Erase movement", "erase"]
  ];
  const toolbar = node ? `<div class="builder-tools junction-tools" aria-label="Movement tools">${buttons.map(([symbol, label, mode, disabled]) =>
    `<button aria-label="${label}" title="${label}" ${mode ? `data-junction-mode="${mode}" aria-pressed="${mode === junctionMode}"` :
      `data-action="network-${symbol}"`} ${disabled ? "disabled" : ""}>${icon(symbol)}<span class="tool-label">${label.split(" ")[0]}</span></button>`).join("")}</div>` : "";
  const card = (symbol, label, data, active, disabled = false) =>
    `<button ${data} aria-pressed="${active}" ${disabled ? "disabled" : ""}>${icon(symbol)}<span>${label}</span></button>`;
  return toolbar + (node ? `<div class="junction-cards" aria-label="Intersection controls">
    ${card("signal", "Signal", 'data-intersection-control="traffic_light"', node.control === "traffic_light")}
    ${card("stop", "Stop", 'data-movement-rule="stop"', node.control === "priority" && movement?.rule === "stop", !movement)}
    ${card("yield", "Yield", 'data-movement-rule="yield"', node.control === "priority" && movement?.rule === "yield", !movement)}
    </div><div class="row chips">
    <button data-intersection-control="priority" aria-pressed="${node.control === "priority"}">Unsignalized</button>
    ${movement && node.control === "priority" ? `<button data-movement-rule="default" aria-pressed="${movement.rule === "default"}">Default</button>` : ""}
    <button data-action="intersection-overview">Map overview</button></div>` : "");
}

function editJunctionNode(updates) {
  const network = draft.network;
  editNetwork({ ...network, nodes: network.nodes.map(node => node.id === freeNode ? { ...node, ...updates } : node) });
}

function connectMovement(end) {
  const node = draft.network.nodes.find(item => item.id === freeNode);
  if (!node || !laneStart) return;
  const [, from, fromLane] = laneStart.split(":");
  const [direction, to, toLane] = end.split(":");
  if (direction !== "out" || from === to) return;
  const movements = junctionMovements(draft.network, node);
  const next = { from, to, fromLane: Number(fromLane), toLane: Number(toLane), rule: "default" };
  selectedMovement = movementKey(next);
  if (!movements.some(move => movementKey(move) === selectedMovement)) {
    if (movements.length >= 256) {
      roadMessage = "This junction already has 256 movements.";
      return;
    }
    editJunctionNode({ movements: [...movements, next] });
  }
  laneStart = undefined;
}

function selectIntersection(id) {
  freeNode = draft.network.nodes.some(node => node.id === id) ? id : undefined;
  laneStart = selectedMovement = undefined;
  junctionMode = "select";
  roadMessage = "";
  camera = undefined;
}

function editIntersection(target) {
  const lane = target.closest("[data-lane-port]")?.dataset.lanePort;
  const link = target.closest("[data-lane-link]")?.dataset.laneLink;
  const id = target.closest("[data-free-node]")?.dataset.freeNode;
  if (lane && junctionMode === "draw") {
    if (lane.startsWith("in:")) laneStart = laneStart === lane ? undefined : lane;
    else connectMovement(lane);
  } else if (lane) {
    laneStart = laneStart === lane ? undefined : lane;
    selectedMovement = undefined;
  } else if (link) {
    if (junctionMode === "erase") {
      const node = draft.network.nodes.find(item => item.id === freeNode);
      editJunctionNode({ movements: junctionMovements(draft.network, node).filter(move => movementKey(move) !== link) });
      if (selectedMovement === link) selectedMovement = undefined;
    } else if (junctionMode === "select") selectedMovement = link;
  } else if (id && id !== freeNode) selectIntersection(id);
  render();
}

function laneArtwork(forward, backward, addedSide) {
  const count = forward + backward;
  const width = Math.min(56, 13 + count * 9);
  const edge = t => 40 + (t - .5) * width;
  const horizon = t => 40 + (t - .5) * width * .37;
  const markings = Array.from({ length: count - 1 }, (_, i) => `<path d="M${horizon((i + 1) / count)} 14L${edge((i + 1) / count)} 50"
    stroke="${i + 1 === backward ? "#f4cc79" : "#edf5f1"}" stroke-width="1" ${i + 1 === backward ? "" : 'stroke-dasharray="3 3"'}/>`).join("");
  const arrows = Array.from({ length: count }, (_, i) => {
    const x = (edge((i + .5) / count) + horizon((i + .5) / count)) / 2;
    return `<path d="M0 4V-4m-2 3 2-3 2 3" transform="translate(${x} 33) rotate(${i < backward ? 180 : 0})"/>`;
  }).join("");
  return `<svg viewBox="0 0 80 50" aria-hidden="true">
    <path fill="#b7d9db" d="M0 0h80v50H0z"/><path fill="#91ac8a" d="M0 15 15 9l16 5 13-7 19 5 17-4v42H0Z"/>
    <path fill="#adbf9e" d="M0 23 24 15h42l14 7v28H0Z"/><path d="M0 35 21 30m40 2 19 5M0 45l16-3m49 1 15 4" stroke="#c5d4ad" opacity=".7"/>
    <path d="M${horizon(0) - 1.5} 14H${horizon(1) + 1.5}L${edge(1) + 4} 50H${edge(0) - 4}Z" fill="#d7d8bf"/>
    <path d="M${horizon(0)} 14H${horizon(1)}L${edge(1)} 50H${edge(0)}Z" fill="#374751" stroke="#e6e7d3" stroke-width="1"/>
    ${addedSide ? `<path d="M${horizon(addedSide === "left" ? 0 : 1)} 14l${addedSide === "left" ? -4 : 4} 0 ${addedSide === "left" ? -10 : 10} 36h${addedSide === "left" ? 14 : -14}Z" fill="#80dbea"/>` : ""}
    ${markings}<g fill="none" stroke="#f5fbff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${arrows}</g></svg>`;
}

function replaceFreeRoad(updates) {
  const network = draft.network;
  if (Object.entries(updates).every(([key, value]) => network.roads[freeRoad][key] === value)) return;
  const road = { ...network.roads[freeRoad], ...updates };
  const issue = networkRoadIssue(network, road, freeRoad);
  roadMessage = issue ?? "";
  if (!issue) editNetwork({ ...network, roads: network.roads.map((item, i) => i === freeRoad ? road : item) });
}

function closestRoadPoint(network, point, exclude) {
  const nodes = networkNodes(network);
  let best;
  const limit = Math.min(20, 15 / map.getScreenCTM().a);
  for (const [index, road] of network.roads.entries()) {
    if (road.a === exclude || road.b === exclude) continue;
    const { samples, start, end } = networkRoadGeometry(road, nodes);
    for (const [sample, p] of samples.entries()) {
      if (Math.min(Math.hypot(p.x - start.x, p.y - start.y), Math.hypot(p.x - end.x, p.y - end.y)) < 16) continue;
      const distance = Math.hypot(p.x - point.x, p.y - point.y);
      if (distance < (best?.distance ?? limit)) best = { x: p.x, y: p.y, distance, index, t: sample / (samples.length - 1) };
    }
  }
  return best;
}

function snapPoint(point, source, id, exclude) {
  const network = draft.network;
  const nodes = networkNodes(network);
  if (id && id !== exclude) return { ...nodes.get(id), id };
  if (snapping.roads) {
    const limit = Math.min(20, 16 / map.getScreenCTM().a);
    const closest = [...nodes.values()].filter(node => node.id !== exclude).reduce((best, node) => {
      const distance = Math.hypot(point.x - node.x, point.y - node.y);
      return distance < (best?.distance ?? limit) ? { ...node, distance } : best;
    }, undefined);
    if (closest) return closest;
    const onRoad = closestRoadPoint(network, point, exclude);
    if (onRoad) return onRoad;
  }
  let { x, y } = point;
  if (snapping.grid) {
    x = Math.round(x / 20) * 20;
    y = Math.round(y / 20) * 20;
  }
  if (snapping.angle && source) {
    const dx = x - source.x, dy = y - source.y;
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
    const distance = dx * Math.cos(angle) + dy * Math.sin(angle);
    x = source.x + distance * Math.cos(angle);
    y = source.y + distance * Math.sin(angle);
  }
  return { x: Math.round(x), y: Math.round(y) };
}

function drawNetworkRoad(point, pull) {
  const start = drawStartPoint(draft.network);
  if (!start || point.id && point.id === freeStart.id) {
    roadMessage = "Choose a different endpoint.";
    return;
  }
  let network = draft.network;
  let a = freeStart.id;
  if (!a) {
    const origin = nextNetworkNode(network, freeStart);
    roadMessage = networkNodeIssue(origin) ?? "";
    if (roadMessage) return;
    if (freeStart.index !== undefined) {
      const result = splitNetworkRoad(network, freeStart.index, origin, freeStart.t);
      if (!result.network) {
        roadMessage = result.issue;
        return;
      }
      network = result.network;
      if (point.index !== undefined) {
        const offset = point.index > freeStart.index ? 1 : 0;
        if (point.index === freeStart.index) {
          roadMessage = "Start and end on different roads.";
          return;
        }
        point = { ...point, index: point.index + offset };
      }
    } else network = { ...network, nodes: [...network.nodes, origin] };
    a = origin.id;
  }
  const node = point.id ? undefined : nextNetworkNode(network, point);
  if (node) {
    roadMessage = networkNodeIssue(node) ?? "";
    if (roadMessage) return;
    if (point.index !== undefined) {
      const result = splitNetworkRoad(network, point.index, node, point.t);
      if (result.issue) {
        roadMessage = result.issue;
        return;
      }
      network = result.network;
    } else network = { ...network, nodes: [...network.nodes, node] };
  }
  const b = point.id ?? node.id;
  const nodes = networkNodes(network);
  const controls = pull && roadCurveFromPull(nodes.get(a), nodes.get(b), pull);
  const attached = freeStart.anchor || point.anchor;
  const road = { a, b, ...(attached ? { forward: 1, backward: 0 } : drawLanes), bend: 0,
    ...(freeStart.anchor ? { laneA: freeStart.anchor } : {}), ...(point.anchor ? { laneB: point.anchor } : {}),
    ...(controls ? { controls } : {}) };
  const result = connectNetworkRoad(network, road);
  roadMessage = result.issue ?? "";
  if (result.network) {
    editNetwork(attached ? refreshLaneConnections(result.network, road) : result.network);
    freeStart = node && point.index === undefined ? { id: node.id } : undefined;
    pickingEndLane = false;
    clearLaneFocus();
  }
}

function lanePortFromTarget(target) {
  const port = target?.closest("[data-road-lane]");
  if (!port) return undefined;
  const { anchorNode: id, anchorNeighbor: neighbor, anchorLane } = port.dataset;
  const circle = port.querySelector("circle");
  return { id, anchor: { neighbor, lane: Number(anchorLane) }, x: circle.cx.baseVal.value, y: circle.cy.baseVal.value };
}

function lanePortNear(point, direction, options) {
  const network = draft.network;
  let nearest, distance = Math.min(7, 11 / mapScale());
  for (const port of availableLaneAnchors(network, networkNodes(network), direction, options)) {
    const gap = Math.hypot(point.x - port.x, point.y - port.y);
    if (gap < distance) {
      nearest = port;
      distance = gap;
    }
  }
  return nearest;
}

function shiftLaneEnd(end, point) {
  const result = moveRoadLaneAnchor(draft.network, freeRoad, end, point);
  roadMessage = result.issue ?? "";
  if (!result.network) return;
  editNetwork(result.network);
  const index = draft.network.roads.findIndex(road => road.a === result.road.a && road.b === result.road.b);
  freeRoad = index < 0 ? undefined : index;
  selectedLaneEnd = undefined;
  clearLaneFocus();
}

function reshapeNetworkRoad(index, handle, point) {
  const network = draft.network;
  const road = network.roads[index];
  const { a, b, start, end } = networkRoadGeometry(road, networkNodes(network));
  const anchor = handle === 0 ? start : end;
  if (Math.hypot(point.x - anchor.x, point.y - anchor.y) < 4) {
    roadMessage = "Keep the curve handle away from its endpoint.";
    return;
  }
  const along = (point.x - anchor.x) * (end.x - start.x) + (point.y - anchor.y) * (end.y - start.y);
  if (handle === 0 ? along < 0 : along > 0) {
    roadMessage = "Keep the handle on the road side of its endpoint.";
    return;
  }
  const controls = handle === 0 ? [point.x, point.y, b.x, b.y] : [a.x, a.y, point.x, point.y];
  const result = connectNetworkRoad(network, { ...road, controls, bend: 0 }, index);
  roadMessage = result.issue ?? "";
  if (result.network) {
    editNetwork(result.network);
    freeRoad = result.network.roads.findIndex(item => item.a === road.a && item.b === road.b);
    if (freeRoad < 0) {
      freeRoad = undefined;
      freeCurve = false;
    }
  }
}

function editFreeMap(target, point) {
  const network = draft.network;
  const id = target?.closest("[data-free-node]")?.dataset.freeNode;
  const roadIndex = target?.closest("[data-free-road]")?.dataset.freeRoad;
  const end = target?.closest("[data-lane-end]")?.dataset.laneEnd;
  const port = lanePortFromTarget(target);
  roadMessage = "";
  if (end) {
    selectedLaneEnd = end;
    focusLanePorts(network.roads[freeRoad][end]);
    render();
    return;
  }
  if (selectedLaneEnd && (port || id || point) && roadMode === "select") {
    const road = network.roads[freeRoad];
    if (!port && id && id !== laneFocus) {
      focusLanePorts(id);
      render();
      return;
    }
    if (road) shiftLaneEnd(selectedLaneEnd, port ?? snapPoint(point, undefined, id, road[selectedLaneEnd === "a" ? "b" : "a"]));
    render();
    return;
  }
  const approach = target?.closest("[data-approach]")?.dataset.approach;
  if (approach !== undefined) {
    freeApproach = Number(approach);
    render();
    return;
  }
  if (roadMode === "draw") {
    const start = drawStartPoint(network);
    const sameLane = port && freeStart?.anchor && lanePortKey(port) === lanePortKey(freeStart);
    if (start && (id === freeStart.id && !port || sameLane)) {
      freeStart = undefined;
      clearLaneFocus();
    } else if (!start) {
      freeStart = port ?? (id ? { id } : point && snapPoint(point));
      if (port) clearLaneFocus();
    } else if (!port && id && (freeStart.anchor || pickingEndLane) && !laneFocus &&
        junctionLegs(network, id).some(leg => leg.outgoing && !leg.slip)) {
      focusLanePorts(id);
    } else if (port || id || point) drawNetworkRoad(port ?? snapPoint(point, start, id, freeStart.id));
  } else if (roadMode === "split") {
    if (roadIndex !== undefined) {
      const index = Number(roadIndex);
      const road = network.roads[index];
      const { samples } = networkRoadGeometry(road, networkNodes(network));
      const distance = sample => Math.hypot(sample.x - point.x, sample.y - point.y);
      const nearest = point ? samples.reduce((best, item) => distance(item) < distance(best) ? item : best) : samples[50];
      const node = nextNetworkNode(network, nearest);
      const result = splitNetworkRoad(network, index, node, samples.indexOf(nearest) / 100);
      roadMessage = result.issue ?? "";
      if (result.network) {
        editNetwork(result.network);
        freeNode = node.id;
        freeApproach = freeRoad = undefined;
        roadMode = "select";
      }
    } else if (!id && point && network.nodes.length < 60) {
      const position = snapPoint(point);
      if (position.id) {
        freeNode = position.id;
        roadMode = "select";
        render();
        return;
      }
      const node = nextNetworkNode(network, position);
      roadMessage = networkNodeIssue(node) ?? "";
      if (!roadMessage) {
        editNetwork({ ...network, nodes: [...network.nodes, node] });
        freeNode = node.id;
        roadMode = "select";
      }
    }
  } else {
    if (freeRoad !== Number(roadIndex)) freeCurve = false;
    freeRoad = roadIndex === undefined ? undefined : Number(roadIndex);
    freeNode = id;
    freeApproach = undefined;
    selectedLaneEnd = undefined;
    clearLaneFocus();
    demandTerminal = terminals[id] ? id : undefined;
  }
  render();
}

function queueViewBox(frame) {
  const queued = frame.markers.filter(car => inPeakQueue(car, frame));
  if (!queued.length) return comparisonViewBox;
  const xs = queued.map(car => car.x);
  const ys = queued.map(car => car.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const width = Math.max(180, Math.max(...xs) - Math.min(...xs) + 60);
  const height = Math.max(155, Math.max(...ys) - Math.min(...ys) + 60);
  return `${centerX - width / 2} ${centerY - height / 2} ${width} ${height}`;
}

const replaySurfaces = new WeakMap();

const lampColor = color => ({ g: "#9ee6a2", y: "#ffca74", u: "#ffca74", r: "#ff987d" })[color.toLowerCase()] ?? "#89998e";

function signalMarkup(signals) {
  return (signals ?? []).map(signal => {
    const phase = signal.switches.findLast(change => change.time <= time + 1e-8)?.state ?? "";
    return signal.lanes.map(lane => {
      const colors = [...new Set(lane.links.map(index => (phase[index] ?? "o").toLowerCase()))];
      return `<g class="replay-signal" transform="translate(${lane.x} ${lane.y}) rotate(${lane.angle})">${colors.map((color, i) =>
        `<circle cx="-2" cy="${(i - (colors.length - 1) / 2) * 2.9}" r="1.75" stroke="#263944" stroke-width=".7" fill="${lampColor(color)}"/>`).join("")}</g>`;
    }).join("");
  }).join("");
}

function paintReplay(surface, config, run, bounds) {
  if (surface.getAttribute("viewBox") !== bounds) surface.setAttribute("viewBox", bounds);
  let replay = replaySurfaces.get(surface);
  if (replay?.config !== config || !replay.vehicles.isConnected) {
    surface.innerHTML = mapMarkup(config, false) + '<g class="vehicle-layer" pointer-events="none"/><g class="signal-layer" pointer-events="none"/>';
    replay = { config, vehicles: surface.querySelector(".vehicle-layer"), signalLayer: surface.querySelector(".signal-layer"),
      signals: surface.querySelectorAll("[data-signal-approach]") };
    replaySurfaces.set(surface, replay);
  }
  const frame = run?.frames[Math.floor(time / step + 1e-8)];
  replay.vehicles.innerHTML = frame ? replayMarkers(run.frames, time).map(car => vehicleMarkup(car, frame)).join("") : "";
  const signals = config.network ? signalMarkup(run?.signals) : "";
  if (signals !== replay.signalMarkup) {
    replay.signalLayer.innerHTML = signals;
    replay.signalMarkup = signals;
  }
  for (const signal of replay.signals) {
    const road = signal.dataset.signalApproach;
    const phase = frame?.phase;
    signal.setAttribute("fill", phase === road ? "#9ee6a2" : phase === road + "-yellow" ? "#ffca74" : "#ff987d");
  }
}

function paintMap() {
  const editing = view === "design";
  const split = view === "simulate" && comparing && !!currentRun;
  map.toggleAttribute("hidden", split);
  map.classList.toggle("simulation-map", !editing);
  $("#comparison").hidden = !split;
  if (split) {
    const editedFrame = currentRun.frames[Math.floor(time / step + 1e-8)];
    const bounds = highlightQueues && editedFrame.longestQueue > 0 ? queueViewBox(editedFrame) : design.network ? "0 55 500 570" : comparisonViewBox;
    paintReplay($("#original-map"), baseline, original, bounds);
    paintReplay($("#design-map"), design, currentRun, bounds);
  } else if (!editing) {
    const editedFrame = currentRun?.frames[Math.floor(time / step + 1e-8)];
    const bounds = highlightQueues && editedFrame?.longestQueue > 0 ? queueViewBox(editedFrame) : design.network ? "0 55 500 570" : comparisonViewBox;
    paintReplay(map, design, currentRun, bounds);
  } else {
    const junction = editing && tool === "junction" && draft.network?.nodes.find(node => node.id === freeNode);
    const focus = junction ? `${junction.x - 70} ${junction.y - 70} 140 140` : undefined;
    map.setAttribute("viewBox", editing && camera ? camera.join(" ") : focus ?? ((editing ? draft : design).network ? "0 62 500 560" : editing && tool === "road" ? "130 55 370 810" : editing && tool === "junction" ? "150 125 345 605" : editing && tool === "slip" ? "140 90 360 615" : editing && tool === "lanes" ? "145 145 340 476" : "0 0 500 700"));
    map.innerHTML = mapMarkup(draft, true);
  }
}

const changed = () => Object.keys(baseline).some(key => design[key] !== draft[key]);
const metric = value => Math.round(value);
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function renderInspector() {
  inspector.classList.toggle("report-panel", view === "results" && !!currentRun);
  inspector.setAttribute("aria-label", { design: "Design controls", simulate: "Simulation controls", results: "Results" }[view]);
  if (view === "design") {
    const geometry = curve(draft, draft.lanes & 1 ? 1 : 2);
    const node = tool === "junction" ? junctions(draft).find(item => item.id === selectedJunction) : undefined;
    const title = draft.network ? tool === "junction" ? "Intersections" : "Road Builder" : { road: "Road Builder", move: "Move node", curve: "Adjust curve", lanes: "Connect lanes", signal: "Signal timing", junction: node?.name ?? "Junctions", slip: "Draw slip lane" }[tool];
    const collapse = `<button class="inspector-toggle" data-action="toggle-inspector"
      aria-label="${inspectorCollapsed ? "Expand" : "Minimize"} design panel" aria-expanded="${!inspectorCollapsed}">${inspectorCollapsed ? "⌃" : "⌄"}</button>`;
    const heading = `<div class="row inspector-heading"><h1>${title}</h1>${collapse}</div>`;
    if (inspectorCollapsed) {
      inspector.innerHTML = heading;
      return;
    }
    if (draft.network) {
      const editingIntersection = tool === "junction";
      const intersection = draft.network.nodes.find(item => item.id === freeNode);
      const demand = `<div id="terminal-demand">${demandTerminal ? demandDetails(demandTerminal) : ""}</div>`;
      const detail = editingIntersection ? (!intersection ? "Select a junction on the map." :
        junctionMode === "draw" ? "Connect a blue incoming lane to a purple outgoing lane." :
        junctionMode === "erase" ? "Tap an arrow to disallow that movement." : "Tap a movement to set its rule.") :
        selectedLaneEnd ? "Choose a lane or a new position for this end." :
        roadMode === "draw" ? laneFocus ? "Tap a lane, or hold and pull to curve into it." :
          freeStart?.anchor || pickingEndLane ? "Tap the destination junction to choose a lane." :
          freeStart ? "Tap the end for a straight road. Hold and pull to curve." : "Tap to start a road, or drag from a node." :
        roadMode === "split" ? "Tap the map or a road to add a node." :
        freeCurve ? "Drag either handle to shape the curve." :
        freeNode && !terminals[freeNode] ? "Drag this node to move its connected roads." :
        freeRoad !== undefined ? "Choose lanes or turn on curve handles." : "Select a segment or node.";
      inspector.innerHTML = `<div class="row inspector-heading editor-heading"><h1 class="sr-only">${title}</h1>
        <div class="editor-switch" aria-label="Network editors">
        <button data-tool="road" aria-pressed="${!editingIntersection}">Road Builder</button>
        <button data-tool="junction" aria-pressed="${editingIntersection}">Intersections</button></div>${collapse}</div>
        <p id="detail">${roadMessage || detail}</p>${demand}${editingIntersection ? intersectionControls(intersection) : freeControls()}
        <div class="row actions"><button data-action="cancel" ${changed() ? "" : "disabled"}>Cancel</button>
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
    inspector.innerHTML = `<div class="pending-run"><h1>${view === "simulate" ? "Traffic simulation" : "School pickup results"}</h1>
      <p role="status"></p></div>${sumoMessage ? '<div class="row actions"><button data-action="retry">Retry</button></div>' : ""}`;
    inspector.querySelector("[role=status]").textContent = sumoMessage || "Running the original and your design…";
  } else if (view === "simulate") {
    const { peakFrame, longestQueue } = currentRun.results;
    const peak = longestQueue ? `<span class="timeline-peak" style="--peak-time:${peakFrame * step / duration * 100}%" aria-hidden="true"></span>` : "";
    const legend = [["car", "Car"], ["bus", "Bus"], ["pickup", "Pickup"], ["queue", "Queued"]].map(([key, label]) =>
      `<span><i style="--vehicle-color:${vehicleColors[key]}"></i>${label}</span>`).join("");
    inspector.innerHTML = `<div class="simulation-console">
      <div class="row spread"><h1>Traffic simulation</h1><button data-action="compare" aria-pressed="${comparing}">Compare</button></div>
      <div class="row playback">
        <button class="primary" id="play" data-action="play">${playing ? "Pause" : "Play"}</button>
        <button data-action="rate" title="Change playback speed">${playbackRate}×</button>
        <label class="timeline">${peak}<input id="scrub" type="range" min="0" max="${duration}" step="${step}" value="${time}" aria-label="Simulation time"></label>
        <span class="run-clock"><span id="clock">${clock(time)}</span><small>/ ${clock(duration)}</small></span>
      </div>
      <div class="row spread simulation-footer">
        <div><p id="live"></p><div class="traffic-legend" aria-label="Vehicle legend">${legend}</div></div>
        <button data-action="peak" ${longestQueue ? "" : "disabled"}>Worst backup</button>
      </div>
      <small class="engine-credit sr-only">Eclipse SUMO</small></div>`;
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
      ...(design.slipStart || design.network?.roads.some(road => road.laneA || road.laneB) ?
        [["Slip lane trips", a.slipFinished, b.slipFinished, "", -1]] : []),
      ...(b.unserved ? [["Trips with no route", a.unserved, b.unserved, "", 1]] : []),
      ["Collisions", a.collisions, b.collisions, "", 1]
    ];
    const goal = b.unserved === 0 && b.collisions === 0 && metric(b.longestQueue) < metric(a.longestQueue) &&
      metric(b.busDelay) <= metric(a.busDelay) && metric(b.crossDelay) <= metric(a.crossDelay) &&
      b.finished >= a.finished && b.pickupFinished >= a.pickupFinished && b.crossFinished >= a.crossFinished;
    const queueDelta = metric(b.longestQueue) - metric(a.longestQueue);
    const summary = b.unserved ? `${b.unserved} ${b.unserved === 1 ? "trip has" : "trips have"} no route. Check connections and turns.` :
      b.collisions ? `SUMO recorded ${b.collisions} ${b.collisions === 1 ? "collision" : "collisions"}.` :
      goal ? "Goal met. The queue fell and service held." :
      queueDelta > 0 ? "The peak queue grew. Inspect the backup to see where it formed." :
      queueDelta === 0 ? "The peak queue held steady." :
      "The peak queue fell. Check the trip and delay results for trade-offs.";
    const stat = (label, value, before, unit, lowerIsBetter) => {
      const difference = metric(value) - metric(before);
      const change = difference === 0 ? "Same as original" : `${Math.abs(difference)}${unit ? " " + unit : ""} ${difference > 0 ? "more" : "fewer"}`;
      const tone = difference === 0 ? "" : (difference < 0) === lowerIsBetter ? "gain" : "loss";
      return `<div class="report-stat"><span>${label}</span><strong>${metric(value)}${unit ? ` <small>${unit}</small>` : ""}</strong>
        <small class="${tone}">${change}${difference === 0 ? "" : " than original"}</small></div>`;
    };
    const cell = (label, before, after, unit, direction) => {
      const suffix = unit ? ` ${unit}` : "";
      const delta = metric(after) - metric(before);
      return `<tr><th scope="row">${label}</th><td>${metric(before)}${suffix}</td><td>${metric(after)}${suffix}</td>
        <td class="${delta === 0 ? "muted" : delta * direction < 0 ? "gain" : "loss"}">${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}${suffix}</td></tr>`;
    };
    inspector.innerHTML = `<div class="report-content" tabindex="0" role="region" aria-label="Simulation results">
      <div class="report-heading"><h1>School pickup results</h1><p class="report-outcome ${goal ? "success" : ""}">${summary}</p></div>
      <div class="report-key-metrics">${stat("Peak queue", b.longestQueue, a.longestQueue, "m", true)}
        ${stat("Completed trips", b.finished, a.finished, "", false)}</div>
      <table class="metrics" aria-label="Simulation results by design">
      <thead><tr><th scope="col">Measure</th><th scope="col">Original</th><th scope="col">Yours</th><th scope="col">Change</th></tr></thead>
      <tbody>${rows.map(row => cell(...row)).join("")}</tbody></table></div>
      <div class="row actions"><button class="primary" data-action="peak" ${b.longestQueue ? "" : "disabled"}>See peak queue</button></div>`;
  }
  if (view !== "design") $(".game").style.setProperty("--report-height", `${inspector.offsetHeight}px`);
}

function render() {
  document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", button.dataset.view === view));
  document.querySelectorAll("[data-tool]").forEach(button => button.setAttribute("aria-pressed", button.dataset.tool === tool));
  $(".tools").hidden = view !== "design" || !!draft.network;
  map.classList.toggle("network-edit", view === "design" && !!draft.network);
  $('[data-action="new-builder"]').hidden = !!draft.network;
  for (const button of document.querySelectorAll(".tools [data-tool]")) {
    button.hidden = !!draft.network && !["road", "junction"].includes(button.dataset.tool);
  }
  paintMap();
  renderInspector();
  sizeEditorMap();
}

function sizeEditorMap() {
  if (view !== "design" || !draft.network) return;
  const height = inspector.offsetHeight - ($("#terminal-demand")?.offsetHeight ?? 0);
  if (laneFocus && laneFocusHeight === undefined) laneFocusHeight = height;
  map.style.setProperty("--editor-height", `${laneFocusHeight ?? height}px`);
}

function updateSimulationReadout() {
  const index = Math.floor(time / step + 1e-8);
  $("#clock").textContent = clock(time);
  $("#scrub").value = time;
  const edited = currentRun.frames[index];
  for (const [name, run] of [["original", original], ["design", currentRun]]) {
    const frame = run.frames[index];
    const complete = $(`#${name}-stats`);
    const trips = run.results.finished + run.results.waiting;
    complete.textContent = `${frame.finished}/${trips} trips`;
    $(`#${name}-queue`).textContent = `${metric(frame.longestQueue)} m queued`;
    $(`[data-map-version="${name}"]`).style.setProperty("--trip-progress", `${frame.finished / Math.max(1, trips) * 100}%`);
  }
  $("#live").textContent = highlightQueues ? edited.queueZone ? `${edited.queueZone} · ${metric(edited.longestQueue)} m` : "No queue at this time" :
    `${edited.markers.length} on road · ${metric(edited.longestQueue)} m queued`;
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
  if (mapPointers.size === 1 && (event.target.closest("[role=button], [data-handle]") ||
      draft.network && tool === "road" && roadMode === "draw")) return;
  if (mapPointers.size > 1) {
    if (movementDrag) {
      movementDrag = undefined;
      laneStart = undefined;
      paintMap();
    }
    if (freeDrag) {
      clearTimeout(terminalHold);
      if (freeDrag.moved) freeStart = freeDrag.previousStart;
      freeDrag = undefined;
      drawCurveGuide = undefined;
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
  const handle = event.target.closest("[data-curve-handle]")?.dataset.curveHandle;
  const end = event.target.closest("[data-lane-end]")?.dataset.laneEnd;
  const port = lanePortFromTarget(event.target);
  if (!draft.network || tool !== "road" || view !== "design" || event.button !== 0) return;
  const drawing = roadMode === "draw";
  const kind = handle !== undefined ? "curve" : end ? "lane" : drawing ?
    freeStart ? "draw-end" : id || port ? "draw" : "pan" :
    roadMode === "select" && id && !terminals[id] && !selectedLaneEnd ? "move" : undefined;
  if (!kind && !terminals[id]) return;
  freeDrag = { id, kind, end, handle: Number(handle), road: freeRoad, pointer: event.pointerId,
    x: event.clientX, y: event.clientY, previousStart: freeStart };
  const gesture = freeDrag;
  if (kind === "draw") gesture.origin = port ?? { id };
  if (kind === "draw-end") {
    const point = mapPoint(event);
    gesture.down = point;
    gesture.target = drawLaneTarget(port) ?? snapPoint(point, drawStartPoint(draft.network), id, freeStart.id);
    terminalHold = setTimeout(() => {
      if (freeDrag !== gesture) return;
      freeDrag.kind = "curve-draw";
      freeDrag.moved = true;
      drawCurveGuide = { target: gesture.target, finger: point, delta: { x: 0, y: 0 } };
      const layer = $("[data-road-preview]");
      if (layer) layer.innerHTML = roadGestureMarkup(drawStartPoint(draft.network), gesture.target, undefined, drawCurveGuide);
    }, roadCurveHold);
  } else if (terminals[id]) terminalHold = setTimeout(() => {
    if (!freeDrag || freeDrag.pointer !== event.pointerId) return;
    freeDrag.held = true;
    demandTerminal = id;
    suppressMapClick = true;
    suppressHeldTouchClickUntil = performance.now() + 700;
    $("[data-demand-layer]").innerHTML = demandMarkup();
    const details = $("#terminal-demand");
    if (details) details.innerHTML = demandDetails(id);
  }, 450);
});

function dragNetworkPoint(event, gesture) {
  const point = mapPoint(event);
  if (gesture.kind === "curve") return point;
  const network = draft.network;
  const nodes = networkNodes(network);
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const target = hit?.closest("[data-free-node]")?.dataset.freeNode;
  const port = lanePortFromTarget(hit);
  if (gesture.kind === "lane") {
    const road = network.roads[gesture.road];
    const exclude = road[gesture.end === "a" ? "b" : "a"];
    return lanePortNear(point, gesture.end === "a" ? "incoming" : "outgoing", { all: true, end: gesture.end, exclude }) ??
      snapPoint(point, undefined, target, exclude);
  }
  const road = gesture.kind === "move" && network.roads.find(item => item.a === gesture.id || item.b === gesture.id);
  const source = road ? nodes.get(road.a === gesture.id ? road.b : road.a) : drawStartPoint(network);
  if (gesture.kind === "draw" || gesture.kind === "draw-end") {
    return drawLaneTarget(port) ?? snapPoint(point, source, target, freeStart?.id);
  }
  return snapPoint(point, source, undefined, gesture.id);
}

const drawLaneTarget = port => port && port.id !== freeStart?.id ? port : undefined;

map.addEventListener("pointermove", event => {
  if (freeDrag?.pointer !== event.pointerId || freeDrag.held ||
      Math.hypot(event.clientX - freeDrag.x, event.clientY - freeDrag.y) < 4) return;
  clearTimeout(terminalHold);
  if (!freeDrag.kind) return;
  if (freeDrag.kind === "pan") {
    freeDrag = undefined;
    startCameraGesture();
    suppressMapClick = true;
    return;
  }
  if (!map.hasPointerCapture(event.pointerId)) map.setPointerCapture(event.pointerId);
  if (!freeDrag.moved) {
    if (freeDrag.kind === "draw") freeStart = freeDrag.origin;
    if (freeDrag.kind === "move") {
      freeNode = freeDrag.id;
      freeRoad = undefined;
      freeCurve = false;
    }
    freeDrag.moved = true;
    demandTerminal = undefined;
    if (freeDrag.kind === "draw" || freeDrag.kind === "lane" || freeDrag.kind === "move") paintMap();
  }
  const start = drawStartPoint(draft.network);
  if (freeDrag.kind === "curve-draw") {
    const point = mapPoint(event);
    drawCurveGuide = { target: freeDrag.target, finger: point, delta: { x: point.x - freeDrag.down.x, y: point.y - freeDrag.down.y } };
  } else freeDrag.point = dragNetworkPoint(event, freeDrag);
  if (freeDrag.kind === "curve") {
    paintMap();
    return;
  }
  const target = drawCurveGuide?.target ?? (freeDrag.kind === "draw" || freeDrag.kind === "draw-end" ? freeDrag.point : undefined);
  const controls = drawCurveGuide && roadCurveFromPull(drawAnchorPoint(draft.network, freeStart),
    drawAnchorPoint(draft.network, target), drawCurveGuide.delta);
  const layer = $("[data-road-preview]");
  if (layer) layer.innerHTML = roadGestureMarkup(start, target, controls, drawCurveGuide, freeDrag.point);
});

for (const type of ["pointerup", "pointercancel"]) {
  map.addEventListener(type, event => {
    if (freeDrag?.pointer !== event.pointerId) return;
    clearTimeout(terminalHold);
    const gesture = freeDrag;
    const { moved, previousStart, held, id, kind } = gesture;
    freeDrag = undefined;
    const guide = drawCurveGuide;
    drawCurveGuide = undefined;
    if (held) {
      suppressHeldTouchClickUntil = performance.now() + 400;
      return;
    }
    if (!moved) return;
    suppressMapClick = true;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (type === "pointerup" && (kind === "curve-draw" || map.contains(target))) {
      roadMessage = "";
      const point = kind === "curve-draw" ? gesture.target : dragNetworkPoint(event, gesture);
      if (kind === "draw" || kind === "draw-end" || kind === "curve-draw") drawNetworkRoad(point, guide?.delta);
      if (kind === "move") {
        const result = moveNetworkNode(draft.network, id, point, point.id, point.index === undefined ? undefined : point);
        roadMessage = result.issue ?? "";
        if (result.network) {
          editNetwork(result.network);
          freeNode = point.id ?? id;
          freeApproach = undefined;
        }
      }
      if (kind === "curve") reshapeNetworkRoad(gesture.road, gesture.handle, point);
      if (kind === "lane") shiftLaneEnd(gesture.end, point);
      render();
    } else {
      freeStart = previousStart;
      paintMap();
    }
  });
}

for (const type of ["contextmenu", "selectstart", "dragstart"]) {
  map.addEventListener(type, event => event.preventDefault());
}

map.addEventListener("pointerdown", event => {
  if (!draft.network || tool !== "junction" || junctionMode !== "draw" || view !== "design" || event.button !== 0) return;
  const port = event.target.closest("[data-lane-port]");
  if (!port?.dataset.lanePort.startsWith("in:")) return;
  const circle = port.querySelector("circle");
  movementDrag = { id: event.pointerId, lane: port.dataset.lanePort, x: event.clientX, y: event.clientY,
    start: { x: circle.cx.baseVal.value, y: circle.cy.baseVal.value } };
});
map.addEventListener("pointermove", event => {
  if (movementDrag?.id !== event.pointerId || Math.hypot(event.clientX - movementDrag.x, event.clientY - movementDrag.y) < 5) return;
  if (!map.hasPointerCapture(event.pointerId)) map.setPointerCapture(event.pointerId);
  laneStart = movementDrag.lane;
  const point = mapPoint(event);
  movementDrag.point = point;
  const { start } = movementDrag;
  const layer = $("[data-movement-preview]");
  layer.innerHTML = `<path d="M${start.x} ${start.y}L${point.x} ${point.y}"
    stroke="#b3efff" stroke-width="1.5" stroke-dasharray="2 2"/>`;
});
for (const type of ["pointerup", "pointercancel"]) {
  map.addEventListener(type, event => {
    if (movementDrag?.id !== event.pointerId) return;
    const moved = movementDrag.point;
    movementDrag = undefined;
    if (!moved) return;
    suppressMapClick = true;
    const point = mapPoint(event);
    const node = draft.network.nodes.find(item => item.id === freeNode);
    const nearest = intersectionLanes(draft.network, node).filter(lane => lane.direction === "out")
      .map(lane => ({ ...lane, distance: Math.hypot(lane.x - point.x, lane.y - point.y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    const end = nearest?.distance <= 8 / map.getScreenCTM().a ? nearest.key : undefined;
    if (type === "pointerup" && end?.startsWith("out:")) connectMovement(end);
    else laneStart = undefined;
    render();
  });
}

map.addEventListener("click", event => {
  if (draft.network && view === "design") {
    demandTerminal = undefined;
    if (tool === "junction") editIntersection(event.target);
    else editFreeMap(event.target, mapPoint(event));
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
  const curveHandle = event.target.dataset.curveHandle;
  const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (draft.network && curveHandle !== undefined && nudge) {
    event.preventDefault();
    const { a, b } = networkRoadGeometry(draft.network.roads[freeRoad], networkNodes(draft.network));
    const { x, y } = curveHandle === "0" ? a : b;
    reshapeNetworkRoad(freeRoad, Number(curveHandle), { x: x + nudge[0] * 3, y: y + nudge[1] * 3 });
    render();
    map.querySelector(`[data-curve-handle="${curveHandle}"]`)?.focus();
    return;
  }
  if (draft.network && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    if (tool === "junction") {
      editIntersection(event.target);
      return;
    }
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
  time = Math.min(duration, time + elapsed * playbackRate);
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
    if (draft.network && tool !== nextTool) {
      if (nextTool === "junction") {
        const selected = freeNode;
        clearNetworkSelection();
        roadCamera = camera;
        selectIntersection(selected);
      } else {
        clearNetworkSelection();
        camera = roadCamera;
        roadMessage = "";
      }
    }
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
    laneFocusHeight = undefined;
    render();
    $(".inspector-toggle").focus();
  } else if (action === "new-builder") {
    editNetwork(starterNetwork());
    clearNetworkSelection();
    tool = "road";
    roadMode = "select";
    roadMessage = "Starter layout loaded. Apply to save it.";
    $("#menu").click();
    enterView("design");
  } else if (nextRoadMode) {
    roadMode = nextRoadMode;
    clearNetworkSelection();
    roadStart = undefined;
    roadMessage = "";
    render();
  } else if (button.dataset.snapOption) {
    const option = button.dataset.snapOption;
    snapping[option] = !snapping[option];
    render();
    inspector.querySelector(`[data-snap-option="${option}"]`)?.focus();
  } else if (action === "curve-handles") {
    freeCurve = !freeCurve;
    selectedLaneEnd = undefined;
    clearLaneFocus();
    render();
    inspector.querySelector('[data-action="curve-handles"]')?.focus();
  } else if (action === "move-lane-a" || action === "move-lane-b") {
    const end = action.at(-1);
    selectedLaneEnd = selectedLaneEnd === end ? undefined : end;
    if (selectedLaneEnd) focusLanePorts(draft.network.roads[freeRoad][end]);
    else clearLaneFocus();
    roadMessage = "";
    render();
  } else if (action === "start-lane-picker") {
    const id = freeStart.id;
    freeStart = undefined;
    pickingEndLane = false;
    focusLanePorts(id);
    render();
  } else if (action === "end-lane-picker") {
    pickingEndLane = !pickingEndLane;
    render();
  } else if (action === "lane-overview") {
    clearLaneFocus();
    render();
  } else if (action === "move-free-node") {
    roadMessage = "Drag the highlighted node. Use snapping to place it precisely.";
    render();
    map.querySelector(`[data-free-node="${freeNode}"]`)?.focus();
  } else if (action === "finish-lane") {
    freeStart = undefined;
    clearLaneFocus();
    roadMessage = "";
    render();
  } else if (action === "network-undo" || action === "network-redo") {
    const [from, to] = action === "network-undo" ? [networkUndo, networkRedo] : [networkRedo, networkUndo];
    if (!from.length) return;
    to.push(draft.network);
    draft.network = from.pop();
    if (tool === "junction") {
      laneStart = selectedMovement = undefined;
      if (!draft.network.nodes.some(node => node.id === freeNode)) selectIntersection();
    } else clearNetworkSelection();
    roadMessage = "";
    render();
  } else if (button.dataset.junctionMode) {
    junctionMode = button.dataset.junctionMode;
    laneStart = undefined;
    roadMessage = "";
    render();
  } else if (action === "intersection-overview") {
    selectIntersection();
    render();
  } else if (button.dataset.intersectionControl) {
    const node = draft.network.nodes.find(item => item.id === freeNode);
    if (node.control !== button.dataset.intersectionControl) editJunctionNode({ control: button.dataset.intersectionControl });
    render();
  } else if (button.dataset.movementRule) {
    const node = draft.network.nodes.find(item => item.id === freeNode);
    const moves = junctionMovements(draft.network, node);
    const rule = button.dataset.movementRule;
    editJunctionNode({ control: "priority", movements: moves.map(move => movementKey(move) === selectedMovement ? { ...move, rule } : move) });
    render();
  } else if (action === "clear-map") {
    editNetwork({ nodes: [], roads: [] });
    clearNetworkSelection();
    roadMode = "draw";
    roadMessage = "";
    camera = undefined;
    render();
  } else if (button.dataset.freePreset || button.dataset.freeCount) {
    const [first, second] = (button.dataset.freePreset ?? button.dataset.freeCount).split(":");
    const segment = roadMode === "draw" ? drawLanes : draft.network.roads[freeRoad];
    const updates = button.dataset.freePreset ? { forward: Number(first), backward: Number(second) } :
      { [first]: segment[first] + Number(second) };
    if (roadMode === "draw") drawLanes = { ...drawLanes, ...updates };
    else replaceFreeRoad(updates);
    render();
  } else if (action === "reverse-road") {
    const { forward, backward } = draft.network.roads[freeRoad];
    replaceFreeRoad({ forward: backward, backward: forward });
    render();
  } else if (button.dataset.approachSelect !== undefined) {
    freeApproach = Number(button.dataset.approachSelect);
    render();
  } else if (button.dataset.approachRule) {
    const network = draft.network;
    const approach = incomingApproaches(network, freeNode).find(item => item.index === freeApproach);
    if (!approach) return;
    editNetwork({ ...network, roads: network.roads.map((road, index) => index === approach.index ?
      { ...road, [approach.end]: button.dataset.approachRule } : road) });
    render();
  } else if (button.dataset.control) {
    const network = draft.network;
    editNetwork({ ...network, nodes: network.nodes.map(node =>
      node.id === freeNode ? { ...node, control: button.dataset.control } : node) });
    render();
  } else if (action === "remove-free-road") {
    editNetwork(removeNetworkRoad(draft.network, freeRoad));
    freeRoad = undefined;
    selectedLaneEnd = undefined;
    clearLaneFocus();
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
    clearNetworkSelection();
    networkUndo.length = networkRedo.length = 0;
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
  } else if (action === "rate") {
    const rates = [1, 3, 6, 12];
    playbackRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    button.textContent = `${playbackRate}×`;
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
  if (["green", "road-bend"].includes(event.target.id)) {
    if (event.target.id === "green") draft.green = Number(event.target.value);
    else {
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
  design = draft.network ? { ...baseline, network: starterNetwork() } : { ...baseline };
  camera = undefined;
  invalidateRun();
  draft = { ...design };
  clearNetworkSelection();
  networkUndo.length = networkRedo.length = 0;
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
