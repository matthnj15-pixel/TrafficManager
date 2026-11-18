import { readSumoComparison, sumoRequest } from "./sumo-export.mjs";
import { clearance } from "./sumo-network.mjs";
import * as routing from "./sumo-network.mjs";
import * as roadModel from "./model.mjs";
import { applyRoadJoin, buildNetworkRoundabout, commitRoadDraft, curveHandleControls, editNetworkCurve, excessJunctionLanes, freeformBendControls, incomingLaneKey, junctionCrossingAxes, junctionLanePose, junctionLegs, junctionMovements,
  laneAnchoredCurve, laneDropTaper, levelStart, levelTrips, levels, maxLaneShift, movementKey, moveNetworkNode, moveRoadLaneAnchor, networkLaneSamples, reconcileJunctionMovements,
  previewRoadDraft, removeNetworkNode, removeNetworkRoad, roadDraftControls, roadGrade, roadJoinDraft, roadShapeIssue, roadSurfaceSamples, roundaboutLoops, separateNetworkJunction, setNetworkRoadGrade, shiftNetworkRoad, slideJoinOptions, starterNetwork } from "./model.mjs";
import { avenueAnchors, avenueLanePath, avenueLaneX, avenuePieces, avenueSegmentAt, avenueSegments, laneSpacing, roadPresets, selectedLane, baseline, world, curve, pointOnCurve, duration, step, validate, greenBounds, mergeEndBounds, mergeTaper, normalizeDesign, replayMarkers, scale, schoolEntry, signalCycle, slipGeometry, slipStartMax, taperLengthBounds, vehicleDimensions, networkLaneWidth, networkMap, networkNodeIssue, networkNodes, networkRoadGeometry, networkRoadIssue, networkTerminals, nextNetworkNode, splitNetworkRoad, trees, tripTerminals } from "./model.mjs";

const $ = selector => document.querySelector(selector);
const map = $("#map");
const inspector = $("#inspector");
const appPath = new URL(".", import.meta.url).pathname;
const storageSuffix = appPath.includes("/previews/") ? `:${appPath}` : "";
const designKey = id => `traffic-manager.${id}.${id === "school-pickup" ? "v1" : "v2"}${storageSuffix}`;
const roadLevels = [[0, "Surface"], [1, "Overpass"], [-1, "Underpass"]];
const gradeName = grade => roadLevels.find(([value]) => value === grade)[1];
const roundaboutEligible = legs => legs.length >= 3 && legs.length <= 5 &&
  legs.every(leg => !leg.slip && !roadGrade(leg.road) && !leg.road.roundabout);
let level = levels[0];
let menuOpen = true;
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
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  shift: '<path d="M3 12h18M6 8l-4 4 4 4m12-8 4 4-4 4M12 4v3m0 10v3"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  slip: '<path d="M5 22V3m0 14c5 0 4-10 16-10m-3-3 3 3-3 3"/>',
  junction: '<path d="M5 22V2m-3 3 3-3 3 3m-3 13c5 0 4-10 16-10m-3-3 3 3-3 3"/>',
  crossing: '<path d="M3 5h18M3 9h18M3 15h18M3 19h18M9 2v3m6-3v3M9 19v3m6-3v3"/>',
  roundabout: '<path d="M19 10a7 7 0 0 0-11-4m-2 2 2-4 2 4m9 6a7 7 0 0 1-7 5m-1 0 3-3m-3 3 3 3m-7-5a7 7 0 0 1-1-6m0-1 3 3m-3-3-3 3"/>',
  signal: '<rect x="6" y="2" width="12" height="20" rx="4"/><circle cx="12" cy="7" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="17" r="1"/>',
  lanes: '<path d="M6 21V4m-3 3 3-3 3 3m4 14v-7q0-7 8-7m-3-3 3 3-3 3"/>',
  design: '<path d="m3 9 9-5 9 5-9 5zm0 4 9 5 9-5M3 17l9 5 9-5"/>',
  simulate: '<path d="m7 4 14 8-14 8z"/>',
  results: '<path d="M5 20v-7m7 7V4m7 16V9"/>'
};
const comparisonViewBox = "150 130 330 345";
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
document.querySelectorAll("[data-tool]").forEach(button => { button.innerHTML = icon(button.dataset.tool); });
document.querySelectorAll("[data-view]").forEach(button => {
  button.innerHTML = icon(button.dataset.view) + `<span>${button.textContent}</span>`;
});
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const existingDesign = readSave(level.id);
let design = existingDesign ?? levelStart(level.id);
let startingDesign = existingDesign && !existingDesign.network ? baseline : levelStart(level.id);
let draft = { ...design };
let view = "design";
let tool = draft.network ? "road" : "move";
let laneSelected = false;
let drag;
let slipAnchor;
let selectedJunction;
let roadSelected;
let roadStart;
let roadMode = existingDesign ? "select" : "move";
let roadDrag;
let roadDrawPointer;
let roadMessage = "";
const roadShapes = ["auto", "freeform", "straight", "curve", "complex"];
let drawShape = "auto";
const freeformDraw = () => drawShape === "freeform" || drawShape === "auto";
let rampDraft;
let rampPreview;
let rampPicker;
let selectedRamp;
let rampReassign;
let rampDrag;
let rampCurveHandles = false;
let crossingDraft;
let drawGrade = 0;
let drawing = { points: [], handles: [] };
const drawUndo = [], drawRedo = [];
let freeRoad;
let freeNode;
let junctionMode = "select";
let buildingStructure = false;
let laneStart;
let selectedIncoming;
let selectedMovement;
let movementDrag;
let roadCamera;
let freeDrag;
let freeCurve = false;
let curveAngles = false;
let movingSegment = false;
let erasing = false;
let roadOptions = false;
let selectedLaneEnd;
let laneFocus;
let laneCamera;
let pickingEndLane = false;
let drawLanes = { forward: 1, backward: 1 };
const roadCurveHold = 360;
const snapping = { grid: false, angle: false, roads: true, nodes: true };
const networkUndo = [], networkRedo = [];
let demandTerminal;
let terminalHold;
let suppressHeldTouchClickUntil = 0;
let demandTrips = levelTrips(level.id, { network: true });
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
let highlightWeaves = false;
let previousFrame = 0;
let animationId;

document.addEventListener("pointerdown", () => { suppressHeldTouchClickUntil = 0; }, true);
document.addEventListener("click", event => {
  if (event.detail && performance.now() < suppressHeldTouchClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

function readSave(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(designKey(id)));
    if (validate(saved) && (id === "school-pickup" ? !saved.network?.map : saved.network?.map === id)) return normalizeDesign(saved);
  } catch { /* Missing or unreadable saves start from the level layout. */ }
}

function renderLevelMenu() {
  $("#level-list").innerHTML = levels.map((item, index) => {
    const { network } = levelStart(item.id);
    const nodes = networkNodes(network);
    const roads = network.roads.map(road => networkRoadGeometry(road, nodes).path).join(" ");
    const lights = network.nodes.map(node => `<circle cx="${node.x}" cy="${node.y}" r="15" fill="#132a25" stroke="${item.accent}" stroke-width="6"/>`).join("");
    return `<li><button class="level-card" type="button" data-level="${item.id}" style="--level-accent:${item.accent}">
      <svg class="level-plan" viewBox="10 63 480 560" aria-hidden="true"><path d="${roads}" fill="none" stroke="#526d60" stroke-width="26" stroke-linecap="round"/><path d="${roads}" fill="none" stroke="${item.accent}" stroke-width="11"
        stroke-linejoin="round" stroke-linecap="round"/>${lights}</svg>
      <span class="level-copy"><strong><span class="level-number">${String(index + 1).padStart(2, "0")}</span>${item.name}</strong><small>${item.problem}</small></span>
      <span class="level-card-action">${readSave(item.id) ? "Resume" : "Play"}${icon("chevron")}</span>
      </button></li>`;
  }).join("");
}

function openLevels() {
  playing = false;
  cancelAnimationFrame(animationId);
  menuOpen = true;
  $("#menu-panel").hidden = true;
  $("#menu").setAttribute("aria-expanded", "false");
  render();
  $("#level-heading").focus();
}

function playLevel(id) {
  const selected = levels.find(item => item.id === id);
  if (!selected) return;
  if (selected !== level) {
    clearNetworkSelection();
    history.length = networkUndo.length = networkRedo.length = 0;
    const saved = readSave(id);
    level = selected;
    design = saved ?? levelStart(id);
    draft = { ...design };
    startingDesign = design.network ? levelStart(id) : baseline;
    tool = design.network ? "road" : "move";
    roadMode = design.network ? "move" : "select";
    drawShape = "auto";
    drawGrade = 0;
    camera = undefined;
    inspectorCollapsed = false;
    roadMessage = "";
    invalidateRun();
    originalCache = undefined;
    demandTrips = levelTrips(id, { network: true });
  }
  menuOpen = false;
  view = "design";
  save();
  render();
  const mode = draft.network ? $('[data-action="mode-move"]') : $('.tools [aria-pressed="true"]');
  mode?.focus({ preventScroll: true });
}

function editNetwork(network) {
  if (network === draft.network) return;
  if (draft.network) networkUndo.push(draft.network);
  if (networkUndo.length > 60) networkUndo.shift();
  networkRedo.length = 0;
  draft.network = reconcileJunctionMovements(network);
  persistNetwork();
}

function persistNetwork() {
  if (!design.network || design.network === draft.network) return;
  design = { ...draft };
  invalidateRun();
  save();
}

function changeDrawing(next) {
  drawUndo.push(drawing);
  drawRedo.length = 0;
  drawing = next;
}

function clearDrawing() {
  drawing = { points: [], handles: [] };
  drawUndo.length = drawRedo.length = 0;
  pickingEndLane = false;
  clearRampDraft();
  clearLaneFocus();
}

function clearNetworkSelection() {
  clearDrawing();
  selectedRamp = crossingDraft = undefined;
  buildingStructure = false;
  freeRoad = freeNode = demandTerminal = undefined;
  freeCurve = curveAngles = movingSegment = erasing = roadOptions = false;
  selectedLaneEnd = undefined;
  laneStart = selectedIncoming = selectedMovement = undefined;
}

function clearRampDraft() {
  clearTimeout(rampDrag?.timer);
  rampDraft = rampPreview = rampPicker = rampReassign = rampDrag = undefined;
  rampCurveHandles = false;
}

function unfinishedRoadEdit() {
  return changed() || drawing.points.length || hasRampChanges() || !!rampPicker || !!crossingDraft?.grade;
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
  laneFocus = laneCamera = undefined;
}

function save() {
  try {
    localStorage.setItem(designKey(level.id), JSON.stringify(design));
  } catch {
    $("#subtitle").textContent = "Storage unavailable. Edits last for this session.";
    $("#subtitle").hidden = false;
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

function mapScenery(network) {
  if (!network?.map) return scenery;
  const { grass, plots, parcels, foliage, water, waterPath, railPath, buildings, trees } = networkMap(network);
  return `<g pointer-events="none" class="map-terrain">
    <defs><pattern id="terrain-grain" width="32" height="28" patternUnits="userSpaceOnUse">
      <path d="M5 8l2-2m10 17 2-2m8-14 1 2m-22 14 2 1" fill="none" stroke="#345545" stroke-width=".8" opacity=".21"/>
    </pattern><pattern id="harbor-wave" width="36" height="20" patternUnits="userSpaceOnUse">
      <path d="M5 9h12m7 7h7" fill="none" stroke="#edf9f5" stroke-width="1" opacity=".35"/>
    </pattern></defs>
    <rect x="-400" y="-600" width="1300" height="2000" fill="${grass}"/>
    ${parcels.map(path => `<path d="${path}" fill="${plots}" stroke="#6d826b" stroke-opacity=".22" stroke-dasharray="3 4"/>`).join("")}
    <rect x="-400" y="-600" width="1300" height="2000" fill="url(#terrain-grain)"/>
    ${waterPath ? `<path d="${waterPath}" fill="${water}" stroke="#ebefe1" stroke-width="4"/><path d="${waterPath}" fill="url(#harbor-wave)"/>
      <path d="M348 541l18 24m-38-16 18 25m55-54 17 20" stroke="#c1b59d" stroke-width="8"/>` : ""}
    ${railPath ? `<path d="${railPath}" fill="none" stroke="#7c827c" stroke-width="8" stroke-dasharray="2 3"/>
      <path d="${railPath}" fill="none" stroke="#596564" stroke-width="4.5"/><path d="${railPath}" fill="none" stroke="#cccabc" stroke-width="2.1"/>` : ""}
    ${buildings.map(({ name, x, y, w, h, color }) => `<g transform="translate(${x} ${y})">
      <rect x="4" y="5" width="${w}" height="${h}" rx="2" fill="#46504c" opacity=".23"/>
      <rect width="${w}" height="${h}" rx="2" fill="${color}" stroke="#635e55" stroke-opacity=".6"/>
      <path d="M1 1H${w - 1}L${w - 10} ${h / 2}H10Z" fill="#fff8e2" opacity=".36"/>
      <path d="M10 ${h / 2}H${w - 10}L${w - 1} ${h - 1}H1Z" fill="#263533" opacity=".11"/>
      <path d="M13 8h${w - 26}" fill="none" stroke="#f3eece" opacity=".5" stroke-width="2" stroke-dasharray="4 2"/>
      <text x="${w / 2}" y="${h / 2 + 3}" text-anchor="middle" fill="#24372f" stroke="#f2eddb" stroke-width="2.5" paint-order="stroke"
        font-size="10.5" font-weight="700">${name}</text>
    </g>`).join("")}
    ${trees.map(([x, y], i) => `<g transform="translate(${x} ${y})">
      <ellipse cx="2" cy="2.4" rx="6" ry="4.9" fill="#445b48" opacity=".2"/>
      <circle r="${i % 3 === 1 ? 5 : 6}" fill="${foliage}"/><path d="M-3 1q-2-5 4-6 3 0 4 3-4-1-8 3Z" fill="#e9ebc0" opacity=".52"/>
    </g>`).join("")}</g>`;
}
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
  let content = mapScenery(config.network) + (config.network ? freeNetworkMarkup(config.network, editing) :
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

function vehicleMarkup(car, frame, pixelsPerUnit) {
  const { length, width } = vehicleDimensions(car.kind);
  const half = Math.max(length / scale * .58, Math.min(5, 1.4 / pixelsPerUnit));
  const beam = Math.max(width / scale * .78, Math.min(2.9, .9 / pixelsPerUnit));
  const fill = vehicleColors[car.reason ? "queue" : car.kind];
  const ring = highlightQueues && inPeakQueue(car, frame)
    ? `<rect x="${-half - 1}" y="${-beam - 1}" width="${2 * half + 2}" height="${2 * beam + 2}" rx="2" fill="#ffbd613d" stroke="#ffab49" stroke-width="1"/>`
    : "";
  const bus = car.kind === "bus";
  const window = half * (bus ? .7 : .38);
  return `<g transform="translate(${car.x} ${car.y}) rotate(${car.angle * 180 / Math.PI})" class="vehicle ${car.kind}${car.reason ? " queued" : ""}">${ring}
    <rect x="${-half + .35}" y="${-beam + .48}" width="${2 * half}" height="${2 * beam}" rx="${beam}" fill="#203340" opacity=".65"/>
    <rect x="${-half}" y="${-beam}" width="${2 * half}" height="${2 * beam}" rx="${bus ? .65 : beam * .72}" fill="${fill}" stroke="#293c47" stroke-width=".55"/>
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
  const terminals = networkTerminals(draft.network);
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
  const terminals = networkTerminals(network);
  const intersection = editing && tool === "junction" && network.nodes.find(node => node.id === freeNode);
  const label = (x, y, name) => {
    const width = name.length * 7 + 12;
    x = clamp(x, width / 2 + 5, 495 - width / 2);
    return `<rect x="${x - width / 2}" y="${y - 14}" width="${width}" height="18" fill="transparent"/>
      <text x="${x}" y="${y}" text-anchor="middle" fill="#173f53" stroke="#e1e6d8" stroke-width="3"
        paint-order="stroke" font-size="12" font-weight="750">${name}</text>`;
  };
  const roads = network.roads.map((road, index) => {
    const shownRoad = freeDrag?.road === index && freeDrag.kind === "segment" && freeDrag.point !== undefined ?
      { ...road, laneShift: freeDrag.point } : freeDrag?.road === index && freeDrag.kind === "curve" && freeDrag.point ?
        { ...road, controls: curveHandleControls(road, network, nodes, freeDrag.handle, freeDrag.point, curveAngles), bend: 0 } : road;
    const geometry = networkRoadGeometry(shownRoad, nodes);
    const geometryNetwork = shownRoad === road ? network : { ...network, roads: network.roads.map(item => item === road ? shownRoad : item) };
    const surface = roadSurfaceSamples(shownRoad, geometryNetwork, nodes, geometry);
    const selected = editing && tool === "road" && index === freeRoad;
    const divider = Array.from({ length: road.forward + road.backward - 1 }, (_, lane) => {
      const offset = (lane + 1 - road.backward + (shownRoad.laneShift ?? 0)) * networkLaneWidth;
      const points = geometry.samples.map(({ x, y, angle }) =>
        ({ x: x - Math.sin(angle) * offset, y: y + Math.cos(angle) * offset }));
      return `<path d="${linePath(points)}" fill="none" stroke="${lane + 1 === road.backward ? "#ecc98f" : "#e3e6da"}"
        stroke-width="1" stroke-dasharray="4 4"/>`;
    }).join("");
    const markers = [true, false].map(forward => {
      const count = forward ? road.forward : road.backward;
      if (!count) return "";
      const arrows = selected || road.roundabout ? [count - 1] : [];
      const drops = laneDropTaper(geometryNetwork, shownRoad, nodes, forward);
      return [...new Set([...arrows, ...drops])].map(lane => {
        const points = networkLaneSamples(shownRoad, geometryNetwork, nodes, forward, lane, geometry);
        const p = points[drops.includes(lane) ? Math.floor(points.length * .76) : Math.floor(points.length * .4)];
        return `<path d="${drops.includes(lane) ? "M-4 0h3l5-2m-3-1 3 1-2 3" : "M-5-3L3 0-5 3"}" fill="none"
          stroke="${drops.includes(lane) ? "#f0dc9e" : "#c4f8ff"}" stroke-width="1.35"
          transform="translate(${p.x} ${p.y}) rotate(${p.angle * 180 / Math.PI})"/>`;
      }).join("");
    }).join("");
    const body = surfacePath(surface);
    const grade = roadGrade(road);
    const structure = road.rampId ? rampName(network.ramps?.[road.rampId]) : road.roundabout ? "Roundabout lane" : grade ? gradeName(grade) : "Road";
    const marking = grade === 1 ? `<path d="${linePath(surface.left)} ${linePath(surface.right)}" fill="none" stroke="#bcd6d7" stroke-width="1.7"/>` :
      grade === -1 ? `<path d="${body}" fill="none" stroke="#dbd3b2" stroke-width="1.65" stroke-dasharray="3.5 3"/>` : "";
    return {
      body, grade, marking,
      detail: `<g pointer-events="none">${divider}${markers}</g>`,
      selected,
      hit: editing && tool === "road" && roadMode !== "move" && roadMode !== "draw" ?
        `<path d="${body}" data-free-road="${index}" role="button" tabindex="0" aria-label="${structure} ${index + 1}"
        aria-pressed="${selected}" fill="transparent" stroke="transparent" stroke-width="9"/>` : ""
    };
  });
  const islands = [...roundaboutLoops(network)].map(([id, ring]) => {
    const exits = new Map(ring.map(road => [road.a, road]));
    let road = ring[0], island = "";
    for (let i = 0; i < ring.length; i++) {
      const part = networkRoadGeometry(road, nodes).path;
      island += i === 0 ? part : part.slice(part.indexOf(" C"));
      road = exits.get(road.b);
    }
    return `<path data-roundabout="${id}" d="${island}Z" fill="#a4b690" stroke="#dce4ca" stroke-width="2.6"/>`;
  }).join("");
  const stubs = Object.values(terminals).map(({ x, y, dx, dy }) =>
    `<path d="M${x} ${y}l${dx} ${dy}" stroke="#46525b" stroke-width="12"/>`).join("");
  const roadMarkup = [-1, 0, 1].map(grade => {
    const layer = roads.filter(road => road.grade === grade);
    const shoulders = layer.map(road => `<path d="${road.body}" fill="none" stroke="${grade === 1 ? "#31464b" : "#e4e9d4"}"
      stroke-width="${grade === 1 ? 4 : 1.8}" stroke-linejoin="round"/>`).join("");
    const pavement = layer.map(road => `<path d="${road.body}" data-pavement fill="${road.selected ? "#246682" : grade === -1 ? "#52616b" : grade === 1 ? "#50606b" : "#404d55"}"/>`).join("");
    return `<g data-road-level="${grade}">${grade === 0 ? stubs + islands : ""}${shoulders}${pavement}${layer.map(road => road.detail + road.marking + road.hit).join("")}</g>` +
      (editing ? "" : `<g class="vehicle-layer" data-vehicle-level="${grade}" pointer-events="none"${grade === -1 ? ' opacity=".77"' : ""}/>`);
  }).join("");
  if (!editing) return roadMarkup;
  if (roadMode === "move") return roadMarkup + `<g pointer-events="none">${Object.values(terminals).map(node => label(node.x, node.y + (node.id === "north" ? 23 : -15), node.name)).join("")}</g>` +
    `<g data-ramp-overlay>${rampMapMarkup(network)}</g>`;
  const preview = freeDrag?.point;
  const pins = intersection ? "" : [...nodes.values()].map(node => {
    const { id, x, y } = node;
    const active = drawing.points.some(point => point.id === id) || id === freeNode || id === demandTerminal;
    return `<g class="road-target" data-free-node="${id}" role="button" tabindex="0" aria-label="${node.name ? node.name + " connection" : "Junction " + id.slice(1)}" aria-pressed="${active}">
      <circle cx="${x}" cy="${y}" r="${Math.min(21, 13 / mapScale())}" fill="transparent"/>
      <circle cx="${x}" cy="${y}" r="${active ? 9 : node.name || roadMode === "draw" ? 8 : 6.5}" fill="${active || roadMode === "draw" ? "#c4f8ff" : node.control === "traffic_light" ? "#398257" : node.control === "allway_stop" ? "#a13f38" : node.control === "yield" ? "#9a602a" : "#0f4b70"}" stroke="${active || roadMode === "draw" ? "#0f4b70" : "#c4f8ff"}" stroke-width="2"/>
      ${node.name ? label(x, y + (id === "north" ? 23 : -15), node.name) : ""}</g>`;
  }).join("");
  const segment = network.roads[freeRoad];
  let handles = "";
  if (freeCurve && segment) {
    const active = freeDrag?.kind === "curve" && preview;
    const road = active ? { ...segment, controls: curveHandleControls(segment, network, nodes, freeDrag.handle, preview, curveAngles), bend: 0 } : segment;
    const curve = laneAnchoredCurve(road, network, nodes) ?? networkRoadGeometry(road, nodes);
    const unit = 1 / mapScale();
    const joins = ["a", "b"].map((side, index) => {
      if (!slideJoinOptions(network, freeRoad, side, nodes)) return "";
      const point = index ? curve.end : curve.start;
      return `<g data-road-join="${side}" class="draft-target" role="button" tabindex="0"
        aria-label="Slide ${index ? "exit" : "entry"} join" transform="translate(${point.x} ${point.y}) scale(${unit})">
        <circle r="16" fill="transparent"/><rect x="-6" y="-6" width="12" height="12" rx="3"
          fill="#efdb9e" stroke="#544a2d" stroke-width="1.8"/></g>`;
    }).join("");
    handles = `<g fill="none">
      <path d="${curve.path}" stroke="#b8f3ed" stroke-width="${1.5 * unit}" stroke-dasharray="${5 * unit} ${3 * unit}" pointer-events="none"/>
      ${[curve.a, curve.b].map(({ x, y }, i) => {
        const end = i ? curve.end : curve.start;
        return `<path d="M${end.x} ${end.y}L${x} ${y}" stroke="#b8f3ed" stroke-width="${unit}" stroke-dasharray="${3 * unit} ${3 * unit}" pointer-events="none"/>
          <g data-curve-handle="${i}" role="button" tabindex="0" aria-label="${i ? "Exit" : "Entry"} curve handle" class="draft-target">
            <circle cx="${x}" cy="${y}" r="${19 * unit}" fill="transparent"/>
            <circle cx="${x}" cy="${y}" r="${7 * unit}" fill="#b8f3ed" stroke="#134d63" stroke-width="${2 * unit}"/>
            <text x="${x}" y="${y + 3.2 * unit}" text-anchor="middle" fill="#12475e" font-size="${9 * unit}" font-weight="750">${i ? "2" : "1"}</text>
          </g>`;
      }).join("")}${joins}</g>`;
  }
  const grid = snapping.grid && tool === "road" && (roadMode === "draw" || freeNode && !terminals[freeNode]) ?
    '<defs><pattern id="snap-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle r="1.3" fill="#0f4b70" opacity=".38"/></pattern></defs><rect x="8" y="68" width="484" height="554" fill="url(#snap-grid)" pointer-events="none"/>' : "";
  return grid + roadMarkup + '<defs><marker id="demand-arrow" orient="auto" markerWidth="4" markerHeight="4" refX="3.5" refY="2"><path d="M0 0L4 2L0 4Z" fill="#0f7090"/></marker></defs>'
    + `<g data-demand-layer pointer-events="none">${demandMarkup()}</g>` + pins + `<g data-road-preview>${roadGestureMarkup()}</g>` + handles
    + (tool === "road" ? roadLaneAnchors(network, nodes) + segmentShiftMarkup(segment, nodes) : "")
    + (intersection && !buildingStructure && !junctionLegs(network, intersection.id).some(leg => leg.road.roundabout) ? intersectionMarkup(network, intersection) : "")
    + (intersection && buildingStructure ? crossingMapMarkup(network, intersection) : "")
    + `<g data-ramp-overlay>${rampMapMarkup(network)}</g>`;
}

function roadGestureMarkup() {
  const preview = freeDrag?.point;
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
  if (tool !== "road" || roadMode !== "draw") return "";
  const current = freeDrag?.drawing ?? drawing;
  const { points } = current;
  if (!points.length) return "";
  const controls = drawingControls(current);
  const previewDraft = previewRoadDraft(draft.network, points, drawLanes, controls, drawGrade);
  const paved = previewDraft.roads.map(road => roadSurfaceSamples(road, previewDraft.graph, previewDraft.nodes));
  const path = paved.map(surface => surfacePath(surface)).join(" ");
  const middle = paved.map(surface => surface.geometry.path).join(" ");
  const unit = 1 / mapScale();
  const isShaped = drawShape === "curve" || drawShape === "complex";
  const onRoad = (point, index) => !point.anchor ? point :
    paved[index]?.geometry.start ?? paved[index - 1]?.geometry.end ?? point;
  const anchors = points.map((item, index) => {
    const point = onRoad(item, index);
    const editable = isShaped && points.length > 1 && index > 0;
    const canStartBend = freeformDraw() && index === points.length - 1;
    const label = drawShape === "complex" && index === 1 ? "Complex break" : "End angle";
    return `<g pointer-events="none" transform="translate(${point.x} ${point.y}) scale(${unit})">
      <circle r="${index === 0 ? 6 : 5}" fill="#c4f8ff" stroke="#14576a" stroke-width="2"/>
      ${editable ? `<circle r="12" fill="transparent" pointer-events="all" data-draft-tangent="${index}"
        class="draft-target" role="button" tabindex="0" aria-label="Hold and drag ${label.toLowerCase()}"/>` : ""}
      ${canStartBend ? `<circle r="12" fill="transparent" pointer-events="all" data-draft-anchor="${index}"
        class="draft-target" aria-hidden="true"/>` : ""}
      </g>`;
  }).join("");
  const tangentGuides = points.map((item, index) => {
    const point = onRoad(item, index);
    const handle = current.handles[index];
    if (!isShaped || !index || points.length < 2) return "";
    const before = controls[index - 1];
    const laneCurve = item.anchor && paved[index - 1]?.geometry;
    const base = laneCurve ? { x: laneCurve.b.x - point.x, y: laneCurve.b.y - point.y } :
      handle ?? { x: point.x - before[2], y: point.y - before[3] };
    const length = Math.hypot(base.x, base.y) || 1;
    const reach = clamp(length, 23 * unit, 53 * unit);
    const x = point.x + base.x * reach / length, y = point.y + base.y * reach / length;
    return `<path d="M${point.x} ${point.y}L${x} ${y}" fill="none" stroke="#6553a2" stroke-width="${1.7 * unit}"
      stroke-dasharray="${4 * unit} ${3 * unit}" pointer-events="none"/>
      <g data-draft-tangent="${index}" class="draft-target" role="button" tabindex="0"
        aria-label="${item.anchor ? "Exit curve reach" : drawShape === "complex" && index === 1 ? "Complex break angle" : "End angle"}"
        transform="translate(${x} ${y}) scale(${unit})">
        <circle r="13" fill="transparent"/>
        <circle r="6.5" fill="#c8b6ff" stroke="#54418a" stroke-width="1.8" pointer-events="none"/>
      </g>`;
  }).join("");
  const ball = freeDrag?.ready && freeDrag.ball;
  return `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${path ? `<path data-draft-surface d="${path}" fill="${previewDraft.issue ? "#9d554d" : drawGrade ? "#465a8e" : "#197a8c"}"
      stroke="#f3f5db" stroke-width="${drawGrade === 1 ? 2.75 : 1.4}" ${drawGrade === -1 ? 'stroke-dasharray="4 3"' : ""} pointer-events="none"/>
      <path d="${middle}" stroke="#b8f3ed" stroke-width="${unit}" stroke-dasharray="${5 * unit} ${4 * unit}" pointer-events="none"/>` : ""}
    ${anchors}${tangentGuides}
    ${ball ? `<g class="draw-curve-ball" pointer-events="none" transform="translate(${ball.x} ${ball.y - 23 * unit}) scale(${unit})">
      <circle r="15" fill="#174157" stroke="#c4f8ff" stroke-width="2"/>
      <ellipse rx="7" ry="13" stroke="#b1dfec" opacity=".75"/>
      <ellipse rx="13" ry="6" stroke="#b1dfec" opacity=".75"/></g>` : ""}
    </g>`;
}

function segmentShiftMarkup(road, nodes) {
  if (!movingSegment || !road) return "";
  const { x, y, angle } = networkRoadGeometry(road, nodes).samples[50];
  const shift = (freeDrag?.kind === "segment" && freeDrag.point !== undefined ? freeDrag.point : road.laneShift ?? 0) * networkLaneWidth;
  const unit = 1 / mapScale();
  const centerX = x - Math.sin(angle) * shift, centerY = y + Math.cos(angle) * shift;
  return `<g data-segment-shift role="slider" tabindex="0" aria-label="Segment lane position" aria-valuemin="${-maxLaneShift}"
    aria-valuemax="${maxLaneShift}" aria-valuenow="${shift / networkLaneWidth}" class="draft-target"
    transform="translate(${centerX} ${centerY}) rotate(${angle * 180 / Math.PI + 90}) scale(${unit})">
    <circle r="23" fill="transparent"/><circle r="17" fill="#173b48" stroke="#a2f0e4" stroke-width="2"/>
    <path d="M-11 0h22m-17-4-5 4 5 4m12-8 5 4-5 4" stroke="#a2f0e4" stroke-width="1.8" fill="none" pointer-events="none"/>
    </g>`;
}

function mapScale() {
  return map.getScreenCTM()?.a || 1;
}

const rampName = ramp => ramp?.shape === "loop" ? "Loop ramp" : "Direct ramp";
const rampEndName = end => end === "a" ? "Exit" : "Merge";
const sameHost = (a, b) => a?.a === b?.a && a?.b === b?.b;
const sameRampLane = (a, b) => sameHost(a?.host, b?.host) && a?.forward === b?.forward && a?.lane === b?.lane;
const sameRampEnd = (a, b) => sameRampLane(a, b) && a?.t === b?.t;
const rampEndpoint = end => end === "a" ? "start" : "end";
const autoTargeting = () => tool === "road" && roadMode === "draw" && drawShape === "auto" && !drawing.points.length && !laneFocus;
const rampTargetEnd = () => rampReassign ?? (autoTargeting() && !rampDraft?.end ? rampDraft?.start ? "b" : "a" : undefined);
const roadEndName = (network, id) => networkTerminals(network)[id]?.name ?? `Junction ${id?.replace(/^j/, "")}`;

function hasRampChanges() {
  if (!rampDraft) return false;
  const saved = draft.network.ramps?.[rampDraft.replace];
  return !saved || !sameRampEnd(saved.start, rampDraft.start) || !sameRampEnd(saved.end, rampDraft.end) ||
    ["shape", "grade", "direction", "reach", "startReach", "endReach"].some(key => saved[key] !== rampDraft[key]);
}

function rampCandidate(next, shape = next?.shape) {
  if (!next?.end) return undefined;
  const graph = draft.network;
  const main = { ...next, shape };
  const result = roadModel.previewRamp(graph, main);
  if (shape !== "loop" || !result.issue || next.direction) return { next: main, ...result };
  const opposite = { ...main, direction: -1 };
  const other = roadModel.previewRamp(graph, opposite);
  return other.issue ? { next: main, ...result } : { next: opposite, ...other };
}

function setRampDraft(next, chooseShape = false) {
  rampDraft = next;
  rampPreview = rampCandidate(next);
  if (chooseShape && rampPreview?.issue) {
    const loop = rampCandidate(next, "loop");
    if (loop?.network) rampPreview = loop;
  }
  if (rampPreview) rampDraft = rampPreview.next;
  roadMessage = "";
}

function rampTargets(point, end, host, radius = Math.min(26, 21 / mapScale())) {
  return roadModel.rampLaneTargets?.(draft.network, point, end, { host, radius, replace: rampDraft?.replace }) ?? [];
}

function rampLaneName(port) {
  const { host, lane, forward } = port;
  const network = draft.network;
  const [from, to] = forward ? [host.a, host.b] : [host.b, host.a];
  return `${roadEndName(network, from)} → ${roadEndName(network, to)} · Lane ${lane + 1}`;
}

function acceptRampLane(port, end) {
  const key = rampEndpoint(end);
  const wasDrawing = !rampDraft?.replace;
  const next = { shape: "direct", grade: 0, ...rampDraft, [key]: port };
  rampPicker = rampReassign = undefined;
  setRampDraft(next, wasDrawing && end === "b");
}

function pickRampLane(point, end, exact) {
  if (exact) {
    acceptRampLane(exact, end);
    return true;
  }
  const candidates = rampTargets(point, end);
  if (!candidates.length) return false;
  const best = candidates[0];
  const reference = end === "a" ? rampDraft?.end : rampDraft?.start;
  const rightSide = port => {
    const target = reference ?? point;
    return Math.cos(port.angle) * (target.y - port.y) - Math.sin(port.angle) * (target.x - port.x);
  };
  const crowded = candidates.filter(item => Math.hypot(item.x - best.x, item.y - best.y) * mapScale() < 13);
  if (crowded.length > 1) {
    const outside = crowded.find(item => sameHost(best.host, item.host) && best.forward === item.forward && item.lane === 0);
    const suggested = outside && rightSide(best) >= -1 ? outside : best;
    rampPicker = { end, options: [suggested, ...crowded.filter(item => item !== suggested)] };
    return true;
  }
  acceptRampLane(best, end);
  return true;
}

function rampLaneArrows(network, end) {
  const nodes = networkNodes(network);
  return network.roads.map((road, index) => {
    if (road.roundabout || road.slip || road.rampId) return "";
    const geometry = networkRoadGeometry(road, nodes);
    return [true, false].map(forward => Array.from({ length: forward ? road.forward : road.backward }, (_, lane) => {
      const samples = networkLaneSamples(road, network, nodes, forward, lane, geometry);
      const point = samples[Math.round((samples.length - 1) * (forward ? .53 : .46))];
      return `<g class="ramp-lane-arrow" data-ramp-lane-arrow="${index}:${+forward}:${lane}" data-x="${point.x}" data-y="${point.y}"
        transform="translate(${point.x} ${point.y}) rotate(${point.angle * 180 / Math.PI})" role="button" tabindex="0"
        aria-label="${end === "a" ? "Exit from" : "Merge into"} ${rampLaneName({ host: road, forward, lane })}">
        <circle r="4.2" fill="transparent"/><path d="M-3.5 0h7m-2.6-2.2L3.5 0 .9 2.2" fill="none" stroke="#bcffea" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/></g>`;
    }).join("")).join("");
  }).join("");
}

function rampArrowTarget(target, end) {
  const arrow = target?.closest("[data-ramp-lane-arrow]");
  if (!arrow) return undefined;
  const [index, forward, lane] = arrow.dataset.rampLaneArrow.split(":").map(Number);
  const road = draft.network.roads[index];
  return rampTargets({ x: Number(arrow.dataset.x), y: Number(arrow.dataset.y) }, end, road, 24)
    .find(item => item.forward === Boolean(forward) && item.lane === lane);
}

function rampMapMarkup(network) {
  if (erasing || tool !== "road") return "";
  const target = rampTargetEnd();
  const arrows = target && !rampPicker ? rampLaneArrows(network, target) : "";
  if (!rampDraft) return arrows;
  const { start, end, grade, replace } = rampDraft;
  const unit = 1 / mapScale();
  const canMove = replace && roadMode === "move";
  const handle = (point, kind, name, symbol, editable = false) => {
    if (!point) return "";
    return `<g class="ramp-handle${editable ? " draft-target" : ""}" data-ramp-handle="${kind}"
      ${editable ? `role="button" tabindex="0" aria-label="${name}"` : 'pointer-events="none"'}
      transform="translate(${point.x} ${point.y}) scale(${unit})">
      <circle r="19" fill="transparent"/><circle r="9" fill="${kind === "b" ? "#d7c8ff" : "#bcebdc"}" stroke="#173845" stroke-width="2"/>
      <path d="${symbol}" fill="none" stroke="#173845" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  };
  const { samples, handles, crossings, network: previewNetwork, roads, issue, issuePoint, warnings } = rampPreview ?? {};
  const previewNodes = previewNetwork && networkNodes(previewNetwork);
  const pavement = previewNodes && roads?.map(road => surfacePath(roadSurfaceSamples(road, previewNetwork, previewNodes))).join(" ");
  const marks = crossings?.map(({ x, y }) =>
    `<circle cx="${x}" cy="${y}" r="${4.5 * unit}" fill="#fff1be" stroke="#173845" stroke-width="${1.4 * unit}"/>`).join("") ?? "";
  const path = samples?.length > 1 && linePath(samples);
  const middle = handles?.middle ?? samples?.[Math.floor(samples.length / 2)];
  const tangent = rampCurveHandles ? ["start", "end"].map(key => {
    const point = handles?.[key], anchor = rampDraft[key];
    if (!point) return "";
    return `<path d="M${anchor.x} ${anchor.y}L${point.x} ${point.y}" fill="none" stroke="#315f79" stroke-width="${unit}" pointer-events="none"/>
      ${handle(point, key, `${key === "start" ? "Entry" : "Exit"} curve handle`, "M-3 -3l6 6m0-6-6 6", true)}`;
  }).join("") : "";
  const ballLabel = rampDraft.shape === "loop" ? "Resize loop" : "Bend connector";
  return arrows + `<g data-ramp-preview="${rampDraft.shape}" data-ramp-grade="${grade}">
    <g pointer-events="none">
      ${pavement ? `<path data-ramp-surface d="${pavement}" class="ramp-surface"/>` : ""}
      ${path ? `<path d="${path}" fill="none" stroke="${issue ? "#a2382d" : "#e3f7e9"}" stroke-width="${(issue ? 2.7 : 1.2) * unit}"
        stroke-dasharray="${4 * unit} ${3 * unit}" stroke-linecap="round"/>` : ""}${marks}
      ${(issuePoint ? [issuePoint] : warnings ?? []).map(({ x, y }) => `<circle data-ramp-constraint cx="${x}" cy="${y}" r="${7 * unit}"
        stroke-width="${2 * unit}" stroke="${issuePoint ? "#a2382d" : "#6c4d14"}" fill="${issuePoint ? "#ffb497" : "#ffe397"}"/>`).join("")}
    </g>
    ${handle(start, "a", "Slide exit along host", "M-4 0h8m-3-3 3 3-3 3", canMove)}
    ${handle(end, "b", "Slide merge along host", "M-4 0h8m-3-3 3 3-3 3", canMove)}
    ${handle(middle, "bend", ballLabel, "M-4 1q2-6 8-3m-8 4 2-1m0 0-1-2", roadMode !== "select")}
    ${tangent}
  </g>`;
}

function updateRampPreview() {
  const layer = $("[data-ramp-overlay]");
  if (layer) layer.innerHTML = rampMapMarkup(draft.network);
  const detail = $("#detail");
  if (detail) detail.textContent = networkDetail();
}

function drawingControls(current) {
  if (freeformDraw() || drawShape === "straight") return current.handles;
  const network = draft.network;
  const nodes = networkNodes(network);
  const points = current.points.map(point => point.anchor ? nodes.get(point.id) : point);
  const tangents = [...current.handles];
  if (points.length > 1 && points[0].id) {
    const heading = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
    const anchor = current.points[0].anchor;
    const legs = junctionLegs(network, points[0].id, nodes).filter(leg => leg.incoming && (!anchor || anchor.neighbor === leg.neighbor));
    const best = legs.reduce((candidate, leg) => {
      const alignment = -Math.cos(heading - leg.bearing);
      return alignment > (candidate?.alignment ?? (anchor ? -Infinity : .1)) ? { leg, alignment } : candidate;
    }, undefined);
    if (best) tangents[0] = { x: -Math.cos(best.leg.bearing), y: -Math.sin(best.leg.bearing) };
  }
  const last = current.points.at(-1);
  if (last?.anchor && points.length > 1) {
    const host = junctionLegs(network, last.id, nodes).find(leg => leg.neighbor === last.anchor.neighbor);
    if (host) {
      const lane = junctionLanePose(host, nodes, "outgoing", last.anchor.lane);
      const reach = tangents[points.length - 1]?.reach;
      tangents[points.length - 1] = { x: Math.cos(lane.angle), y: Math.sin(lane.angle), reach };
    }
  }
  return roadDraftControls(points, tangents);
}

function linePath(points) {
  return "M" + points.map(({ x, y }) => `${x.toFixed(3)} ${y.toFixed(3)}`).join("L");
}

function surfacePath({ left, right }) {
  return linePath(left) + linePath([...right].reverse()).replace(/^M/, "L") + "Z";
}

function draftRoadPath(start, end, controls) {
  return `M${start.x} ${start.y} ${controls ? `C${controls.join(" ")}` : "L"} ${end.x} ${end.y}`;
}

function availableLaneAnchors(network, nodes, direction, { exclude, end, all = false } = {}) {
  const ports = [];
  for (const node of nodes.values()) {
    if (node.id === exclude || laneFocus && node.id !== laneFocus) continue;
    const legs = junctionLegs(network, node.id, nodes);
    const hostLegs = legs.filter(leg => !leg.slip && !roadGrade(leg.road) && !leg.road.roundabout);
    const setback = Math.min(39, Math.max(laneFocus ? 29 : 21, 23 / mapScale()));
    for (const leg of hostLegs) {
      const excess = excessJunctionLanes(hostLegs, leg, direction);
      const laneNumbers = all || hostLegs.length === 1 ? Array.from({ length: leg[direction] }, (_, index) => index) : excess;
      for (const lane of laneNumbers) {
        const taken = direction === "incoming" && excess.includes(lane) &&
          legs.some(item => item.departureAnchor?.neighbor === leg.neighbor && item.departureAnchor.lane === lane);
        if (taken && end !== "a") continue;
        ports.push({ id: node.id, anchor: { neighbor: leg.neighbor, lane }, direction, excess: excess.includes(lane),
          ...junctionLanePose(leg, nodes, direction, lane, setback) });
      }
    }
  }
  return ports;
}

const lanePortKey = port => `${port.id}:${port.anchor.neighbor}:${port.anchor.lane}`;

function lanePortMarkup(port, active) {
  const terminals = networkTerminals(draft.network);
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
  if (erasing) return "";
  if (roadMode === "draw") {
    if (drawGrade || rampDraft || rampPicker) return "";
    const start = drawing.points[0];
    const direction = start ? "outgoing" : "incoming";
    if (start && (drawShape === "complex" && drawing.points.length === 1 ||
      !freeformDraw() && drawingComplete() || drawing.points.at(-1).anchor && drawing.points.length > 1)) return "";
    const options = availableLaneAnchors(network, nodes, direction, { all: !!laneFocus || !start && drawLanes.forward === 1 && !drawLanes.backward,
      exclude: start?.id });
    return options.map(port => lanePortMarkup(port, false)).join("") +
      (start?.anchor ? lanePortMarkup({ ...start, direction: "incoming" }, true) : "");
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
  const terminals = networkTerminals(network);
  const legs = junctionLegs(network, node.id);
  const setback = Math.max(20, ...legs.map(leg => Math.max(leg.incoming, leg.outgoing) * networkLaneWidth + 6));
  return legs.flatMap(leg => {
    const name = terminals[leg.neighbor]?.name ?? `Junction ${leg.neighbor.slice(1)}`;
    return [["in", "incoming"], ["out", "outgoing"]].flatMap(([direction, travel]) =>
      Array.from({ length: leg[travel] }, (_, lane) => ({
        ...junctionLanePose(leg, nodes, travel, lane, setback),
        angle: leg.bearing, key: `${direction}:${leg.neighbor}:${lane}`, direction, lane, neighbor: leg.neighbor,
        label: `${direction === "in" ? "From" : "To"} ${name}, lane ${lane + 1}`
      })));
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
    const rule = node.control === "allway_stop" ? "stop" : node.control === "yield" ? "yield" : node.control === "priority" ? move.rule : "default";
    const color = rule === "stop" ? "#ff8378" : rule === "yield" ? "#ffcf82" : "#75e4f1";
    const filter = laneStart ?? selectedIncoming;
    const visible = !filter || filter === from.key || filter === to.key;
    const path = movementPath(from, to);
    return `<g data-lane-link="${key.replace(">", "&gt;")}" role="button" tabindex="0" aria-pressed="${active}" aria-label="${from.label} → ${to.label}">
      <path d="${path}" fill="none" stroke="transparent" stroke-width="5" ${visible ? "" : 'pointer-events="none"'}/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="${active ? 2.4 : 1.2}"
        opacity="${active || visible ? 1 : .19}" marker-end="url(#movement-arrow)" pointer-events="none"/></g>`;
  }).join("");
  return `<defs><marker id="movement-arrow" orient="auto" markerWidth="3" markerHeight="3" refX="3" refY="1.5">
    <path d="M0 0L3 1.5 0 3Z" fill="#c4f8ff"/></marker></defs>
    <circle cx="${node.x}" cy="${node.y}" r="${Math.max(19, ...lanes.map(lane => Math.hypot(lane.x - node.x, lane.y - node.y) * .86))}" fill="#354a56" pointer-events="none"/>${links}<g data-movement-preview pointer-events="none"/>${lanes.map(lane =>
    `<g data-lane-port="${lane.key}" role="button" tabindex="0" class="road-target" aria-label="${lane.label}" aria-pressed="${laneStart === lane.key || selectedIncoming === lane.key}">
    <circle cx="${lane.x}" cy="${lane.y}" r="3.25" fill="${laneStart === lane.key || selectedIncoming === lane.key ? "#fff3bb" : lane.direction === "in" ? "#7de1f2" : "#bca8f6"}"
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
  const terminals = networkTerminals(draft.network);
  const destinations = destinationCounts(id);
  return `<div class="terminal-demand" role="status"><strong>From ${terminals[id].name}</strong>
    <p>${destinations.length ? destinations.map(([to, count]) => `${terminals[to].name} · ${count} trips`).join(" / ") : "Arrival only"}</p></div>`;
}

function editorButton(symbol, label, attributes, active, disabled = false, showText = false) {
  return `<button ${attributes} aria-label="${label}" title="${label}" ${active === undefined ? "" : `aria-pressed="${active}"`}
    ${disabled ? "disabled" : ""}>${icon(symbol)}${showText ? `<span>${label}</span>` : ""}</button>`;
}

function editorToolbar(intersection) {
  const pressedMove = roadMode === "move";
  const pressedDraw = !erasing && !intersection && roadMode === "draw";
  const pressedSelect = !erasing && !pressedDraw && !pressedMove;
  const staging = roadMode === "draw" && !intersection && !!(drawUndo.length || drawRedo.length);
  const undo = staging && drawUndo.length ? drawUndo : networkUndo;
  const redo = staging ? drawRedo : networkRedo;
  const pending = hasRampChanges() || !!crossingDraft?.grade || !!rampPicker;
  const name = erasing ? "Delete all roads" : "Eraser";
  const empty = !draft.network.roads.length && !draft.network.nodes.length;
  return `<div class="builder-tools" role="group" aria-label="Road Builder tools">
    <div class="editor-mode" role="group" aria-label="Editing mode">
      ${editorButton("move", "Move", 'data-action="mode-move"', pressedMove, false, true)}
      ${editorButton("draw", "Draw", 'data-action="mode-draw"', pressedDraw, false, true)}
      ${editorButton("select", "Select", 'data-action="mode-select"', pressedSelect, false, true)}
    </div>
    <div class="editor-history" role="group" aria-label="History">
      ${editorButton("undo", "Undo", 'data-action="network-undo"', undefined, pending || !undo.length)}
      ${editorButton("redo", "Redo", 'data-action="network-redo"', undefined, pending || !redo.length)}
    </div>
    ${editorButton("erase", name, 'class="editor-eraser" data-action="eraser"', erasing, empty && !erasing)}
  </div>`;
}

function roadShapeArtwork(shape) {
  const path = {
    auto: "M13 39V5M13 30C25 30 27 13 45 13",
    straight: "M17 39V5",
    curve: "M12 39V25Q12 11 30 9L42 9",
    complex: "M9 40C9 27 18 23 27 22S44 17 44 5",
    freeform: "M9 40V25Q9 19 15 19H28Q37 19 37 11V5"
  }[shape];
  return `<svg class="shape-art" viewBox="0 0 52 44" aria-hidden="true">
    <path d="${path}" fill="none" stroke="#91ac92" stroke-width="14"/>
    <path d="${path}" fill="none" stroke="#d4ded0" stroke-width="11"/>
    <path d="${path}" fill="none" stroke="#394c50" stroke-width="9"/>
    <path d="${path}" fill="none" stroke="#e3d596" stroke-width=".8" stroke-dasharray="2.6 2"/>
    </svg>`;
}

function drawingComplete() {
  return drawing.points.length >= (drawShape === "complex" ? 3 : 2);
}

function drawControls() {
  if (rampPicker || rampDraft) return rampControls();
  const start = drawing.points[0];
  const draftExists = !!start || !!drawRedo.length;
  const issue = drawingComplete() && previewRoadDraft(draft.network, drawing.points, drawLanes, drawingControls(drawing), drawGrade).issue;
  const shapeButtons = roadShapes.map(shape => `<button data-draw-shape="${shape}" aria-pressed="${drawShape === shape}">
    ${roadShapeArtwork(shape)}<span>${shape[0].toUpperCase() + shape.slice(1)}</span></button>`).join("");
  const snaps = [["roads", "Road", "road"], ["angle", "Angle", "angle"], ["grid", "Grid", "grid"], ["nodes", "Node", "node"]]
    .map(([key, label, symbol]) => `<button data-snap-option="${key}" title="Snap to ${label.toLowerCase()}"
      aria-label="Snap to ${{ roads: "roads", nodes: "nodes" }[key] ?? label.toLowerCase()}" aria-pressed="${snapping[key]}">
      ${icon(symbol)}${label}</button>`).join("");
  const presets = [["One-way", 1, 0], ["Two-lane", 1, 1], ["Three-lane", 2, 1], ["Four-lane", 2, 2]];
  const presetMenu = presets.map(([label, forward, backward]) => `<option value="${forward}:${backward}"
    ${forward === drawLanes.forward && backward === drawLanes.backward ? "selected" : ""}>${label}</option>`).join("");
  let accessory = "";
  if (laneFocus) accessory = '<button data-action="lane-overview">Map overview</button>';
  else if (start?.anchor && !drawingComplete()) accessory = '<button data-action="finish-lane">Keep lane merge</button>';
  else if (!drawGrade && start?.id && !drawingComplete() && !drawLanes.backward) accessory =
    '<button data-action="start-lane-picker">Choose start lane</button><button data-action="end-lane-picker">Choose end lane</button>';
  return `<div class="draw-layout"><div class="mode-group"><div class="group-label">Road shape</div><div class="shape-controls">${shapeButtons}</div></div>
    <div class="mode-group"><div class="group-label">Snap to</div><div class="snap-controls" aria-label="Snapping">${snaps}</div></div>
    <div class="draw-footer">
      ${start?.anchor ? '' : `<div class="draft-presets"><label class="lane-preset"><span class="sr-only">Lane layout</span>
        <select data-lane-preset>${presetMenu}</select>${icon("chevron")}</label>
        <label class="lane-preset elevation-preset"><span class="sr-only">Road elevation</span>
          <select data-draw-grade>${roadLevels.map(([grade, name]) => `<option value="${grade}"${grade === drawGrade ? " selected" : ""}>${name}</option>`).join("")}</select>${icon("chevron")}</label></div>`}
      ${accessory ? (start?.anchor && !laneFocus ? accessory : `<details class="draft-accessory"><summary aria-label="Lane options">${icon("lanes")}</summary>
        <div>${accessory}</div></details>`) : ""}
      ${draftExists ? editorButton("close", "Cancel", 'data-action="cancel-drawing"', undefined) : ""}
      <button class="primary apply-road" data-action="apply" ${drawingComplete() && !issue ? "" : "disabled"}>Apply</button>
    </div></div>`;
}

function rampLanePicker() {
  const { end, options } = rampPicker;
  return `<div class="ramp-editor">
    <div class="ramp-stage"><strong>Choose ${rampEndName(end).toLowerCase()} lane</strong>
      <button data-action="cancel-ramp-picker">Back</button></div>
    <div class="ramp-picker" role="group" aria-label="Magnified lane picker">
      ${options.map((port, index) => `<button class="${index === 0 ? "suggested" : ""}" data-ramp-pick="${index}">
        <svg viewBox="0 0 44 26" width="44" height="26" aria-hidden="true">
          <path d="M1 2h42v22H1Z" fill="#314d51"/><path d="M1 2h42M1 24h42" stroke="#d8e8d7" stroke-width="1.7"/>
          <path d="M10 13h24m-8-5 8 5-8 5" stroke="#bcebdc" stroke-width="2" fill="none"
            ${port.forward ? "" : 'transform="rotate(180 22 13)"'}/></svg>
        <span>${rampLaneName(port)}${index === 0 ? "<small>Suggested</small>" : ""}</span>
      </button>`).join("")}
    </div></div>`;
}

function rampGradeButtons(grade) {
  return `<div class="ramp-grade" role="group" aria-label="Ramp elevation">
    ${[[0, "Surface"], [1, "Over"], [-1, "Under"]].map(([value, label]) =>
      `<button data-ramp-grade-button="${value}" aria-pressed="${grade === value}">${label}</button>`).join("")}</div>`;
}

function rampControls() {
  if (rampPicker) return rampLanePicker();
  if (!rampDraft.end) return `<div class="ramp-editor"><div class="ramp-stage"><strong>Exit lane selected</strong>
    <button data-action="cancel-ramp">Cancel</button></div><p>${rampLaneName(rampDraft.start)}</p></div>`;
  const draw = !rampDraft.replace;
  const manual = roadMode === "move";
  const choices = draw ? `<div class="ramp-shapes" role="group" aria-label="Connector shape">
    ${["direct", "loop"].map(shape => {
      const active = rampDraft.shape === shape;
      const alternate = !active && rampCandidate({ ...rampDraft, reach: undefined, direction: undefined }, shape);
      const label = shape === "direct" ? "Direct" : "Loop";
      const path = shape === "direct" ? "M7 29h9C27 29 24 10 36 10h9" : "M7 28h16c23 0 24-22 8-22-14 0-11 18 0 18h14";
      return `<button data-ramp-shape="${shape}" aria-pressed="${active}" ${alternate?.issue ? "disabled" : ""}>
        <svg class="shape-art" viewBox="0 0 52 38" aria-hidden="true">
          <path d="${path}" fill="none" stroke="#344e56" stroke-width="8" stroke-linecap="round"/>
          <path d="${path}" fill="none" stroke="#f9edb6" stroke-width="1" stroke-dasharray="3 2"/></svg>${label}</button>`;
    }).join("")}</div>` : "";
  return `<div class="ramp-editor">
    ${choices}
    ${manual ? `<div class="ramp-edit-tools" role="group" aria-label="Ramp editing">
      <button data-ramp-reassign="a" aria-pressed="${rampReassign === "a"}">Reassign exit lane</button>
      <button data-ramp-reassign="b" aria-pressed="${rampReassign === "b"}">Reassign merge lane</button>
      ${rampDraft.shape === "direct" ? `<button data-action="ramp-adjust-curve" aria-pressed="${rampCurveHandles}">Adjust curve</button>` : ""}
    </div>` : ""}
    ${!manual ? rampGradeButtons(rampDraft.grade) : ""}
    <div class="ramp-stage">${rampDraft.shape === "loop" ? '<button data-action="ramp-flip">Reverse loop</button>' : ""}
      <button data-action="cancel-ramp">Cancel</button>
      <button class="primary" data-action="apply-ramp" ${rampPreview?.network && hasRampChanges() ? "" : "disabled"}>Apply</button></div>
  </div>`;
}

function startRampMove(id) {
  const saved = draft.network.ramps?.[id];
  if (!saved) return false;
  selectedRamp = id;
  roadMode = "move";
  setRampDraft({ ...saved, replace: id });
  return true;
}

function applyRamp() {
  if (!rampPreview?.network || !hasRampChanges()) return;
  const { network, rampId } = rampPreview;
  const named = rampName(rampDraft);
  editNetwork(network);
  clearRampDraft();
  selectedRamp = rampId;
  freeRoad = network.roads.findIndex(road => road.rampId === rampId);
  if (roadMode === "move") startRampMove(rampId);
  roadMessage = `${named} applied.`;
}

function rampSelectionControls(road) {
  if (rampDraft?.replace) return rampControls();
  const network = draft.network;
  const ramp = network.ramps?.[road.rampId];
  if (!ramp) return "";
  const demand = routing.rampDemandPreview?.(network, demandTrips, road.rampId);
  const terminals = networkTerminals(network);
  return `<div class="ramp-editor">
    <div class="ramp-stage"><strong>${rampName(ramp)}</strong><button data-action="mode-move">Edit ramp</button></div>
    ${rampGradeButtons(ramp.grade)}
    ${demand ? `<div class="ramp-demand"><p>${demand.scheduled} scheduled trips routed through this ramp.</p>
      ${demand.movements.slice(0, 3).map(({ from, to, scheduled }) => `<p>${terminals[from]?.name ?? from} → ${terminals[to]?.name ?? to} · ${scheduled}</p>`).join("")}
    </div>` : ""}
  </div>`;
}

function segmentControls(road) {
  if (road.roundabout) return `<div class="level-brief"><strong>Roundabout</strong><p>One lane, counterclockwise. Vehicles entering yield to circulating traffic.</p></div>`;
  if (road.rampId && draft.network.ramps?.[road.rampId]) return rampSelectionControls(road);
  if (freeCurve) {
    const nodes = networkNodes(draft.network);
    const curve = laneAnchoredCurve(road, draft.network, nodes) ?? networkRoadGeometry(road, nodes);
    const canSlide = ["a", "b"].some(end => slideJoinOptions(draft.network, freeRoad, end, nodes));
    return `<div class="curve-controls">
      <div><strong>Adjust curve</strong><p id="network-curve-readout">${curveReadout(curve)}</p>
      ${canSlide ? '<p>Squares move the joins. Circles shape the bend.</p>' : ""}</div>
      <div class="row"><button data-action="curve-handles">Done</button>
      ${road.laneA || road.laneB ? "" : `<button data-action="curve-angles" aria-pressed="${curveAngles}">Free angles</button>`}</div>
      </div>`;
  }
  const changes = [["backward", "left", 1], ["forward", "right", 1], ["backward", "left", -1], ["forward", "right", -1]]
    .map(([direction, side, delta]) => {
      const label = `${delta > 0 ? "Add" : "Remove"} lane ${side}`;
      const disabled = delta > 0 ? road[direction] >= 4 : !road[direction] || road.forward + road.backward === 1;
      return `<button data-free-count="${direction}:${delta}" aria-label="${label}" title="${label}" ${disabled ? "disabled" : ""}>
        ${laneArtwork(road.forward, road.backward, side, delta)}<span>${delta > 0 ? "+" : "−"} ${side}</span></button>`;
    }).join("");
  const weave = routing.networkWeaves?.(draft.network).find(item => item.roadIndices.length === 1 && item.roadIndices[0] === freeRoad);
  const local = weave?.hostLanes.find(lane => lane.roadIndex === freeRoad);
  return `<div class="segment-layout">
    <div class="mode-group"><div class="group-label">Lanes · ${road.backward} left, ${road.forward} right</div>
      <div class="segment-lanes">${changes}</div>
      <details class="segment-options"${roadOptions ? " open" : ""}><summary aria-label="Segment options">${icon("more")}More tools</summary>
      <div>
        <button data-action="split-mode">Add node</button>
        ${roadLevels.filter(([grade]) => grade !== roadGrade(road)).map(([grade, name]) => `<button data-segment-grade="${grade}">${name === "Surface" ? "Bring to surface" : `Make ${name.toLowerCase()}`}</button>`).join("")}
        ${!roadGrade(road) && road.forward === 1 && !road.backward ? `<button data-action="move-lane-a" aria-pressed="${selectedLaneEnd === "a"}">Move lane start</button>
          <button data-action="move-lane-b" aria-pressed="${selectedLaneEnd === "b"}">Move lane end</button>
          ${laneFocus ? '<button data-action="lane-overview">Map overview</button>' : ""}` : ""}
      </div></details></div>
    <div class="mode-group"><div class="group-label">${weave ? `Weave · ${Math.round(weave.distance)} m` : roadGrade(road) ? gradeName(road.grade) : "Road segment"}</div><div class="segment-actions">
      ${local ? `<button data-free-count="${local.forward ? "forward" : "backward"}:1" class="widen-weave" ${road[local.forward ? "forward" : "backward"] >= 4 ? "disabled" : ""}>Widen weave</button>` : ""}
      ${editorButton("reverse", "Flip asymmetry", 'data-action="reverse-road"', undefined, road.forward === road.backward, true)}
      ${editorButton("shift", "Move segment", 'data-action="move-segment"', movingSegment, false, true)}
      ${editorButton("curve", "Adjust curve", 'data-action="curve-handles"', freeCurve, false, true)}
    </div></div></div>`;
}

function crossingLegName(network, leg) {
  return networkTerminals(network)[leg.neighbor]?.name ??
    ["East", "South", "West", "North"][Math.round((leg.bearing + 2 * Math.PI) / (Math.PI / 2)) % 4];
}

function stageCrossing(node, pair, grade) {
  const network = draft.network;
  const axes = junctionCrossingAxes(network, node.id);
  const [a, b] = axes.find(legs => legs[0].neighbor === pair) ?? [];
  if (!a) return;
  const result = grade ? separateNetworkJunction(network, node.id, pair, grade) : { network };
  const isThrough = move => axes.some(legs => legs.some(leg => leg.neighbor === move.from) && legs.some(leg => leg.neighbor === move.to));
  const turns = [...new Map(junctionMovements(network, node).filter(move => !isThrough(move))
    .map(move => [`${move.from}:${move.to}`, move])).values()];
  const demand = grade ? routing.crossingDemandPreview?.(network, demandTrips, node.id,
    axes.map(legs => legs.map(leg => leg.neighbor))) : undefined;
  const reachable = grade && result.network && routing.networkDemandPreview?.(result.network, demandTrips, network);
  crossingDraft = { pair, grade, result, turns, demand, reachable };
  roadMessage = "";
}

function crossingMapMarkup(network, node) {
  if (!crossingDraft) return "";
  const { pair, grade, turns } = crossingDraft;
  const axes = junctionCrossingAxes(network, node.id);
  const nodes = networkNodes(network);
  const unit = 1 / mapScale();
  const paths = axes.flatMap(legs => legs.map(leg => {
    const active = legs[0].neighbor === pair;
    const geometry = networkRoadGeometry(leg.road, nodes);
    const samples = leg.atA ? geometry.samples : [...geometry.samples].reverse();
    const nearby = samples.filter(sample => Math.hypot(sample.x - node.x, sample.y - node.y) < 91);
    const path = linePath(nearby.length < 2 ? samples.slice(0, 2) : nearby);
    return `<path data-crossing-arm="${leg.neighbor}" data-chosen="${active}" d="${path}" fill="none"
      stroke="${active ? "#bcebdc" : "#ebeee8"}" stroke-width="${(active ? 6 : 2.5) * unit}"
      ${active && grade !== -1 ? "" : 'stroke-dasharray="4 3"'} stroke-linecap="round"/>`;
  })).join("");
  const lanes = grade ? intersectionLanes(network, node) : [];
  const removed = grade ? turns.map(turn => {
    const from = lanes.find(lane => lane.direction === "in" && lane.neighbor === turn.from && lane.lane === turn.fromLane);
    const to = lanes.find(lane => lane.direction === "out" && lane.neighbor === turn.to && lane.lane === turn.toLane);
    return from && to ? `<path data-crossing-turn d="${movementPath(from, to)}" fill="none" stroke="#ffb497"
      stroke-width="${1.8 * unit}" stroke-dasharray="${3 * unit} ${2 * unit}"/>` : "";
  }).join("") : "";
  return `<g data-crossing-preview="${grade}" pointer-events="none">${paths}${removed}</g>`;
}

function crossingImpact(network) {
  if (!crossingDraft?.grade) return "";
  const { turns, demand, reachable } = crossingDraft;
  const terminals = networkTerminals(network);
  const affected = demand?.movements.filter(move => move.affected) ?? [];
  return `<div class="crossing-impact" aria-label="Separation impact">
    <p><strong>${turns.length} ${turns.length === 1 ? "turn closes" : "turns close"}</strong>
      ${demand ? ` · ${demand.affected} scheduled trips affected` : ""}
      ${reachable?.lost ? ` · ${reachable.lost} lose a route` : ""}</p>
    ${affected.length ? `<details><summary>Affected demand</summary><div>
      ${affected.map(({ from, to, affected }) => `<p>${terminals[from]?.name ?? from} → ${terminals[to]?.name ?? to} · ${affected}</p>`).join("")}
    </div></details>` : ""}
  </div>`;
}

function structureControls(network, node) {
  const legs = junctionLegs(network, node.id);
  const roundabout = roundaboutEligible(legs);
  const axes = junctionCrossingAxes(network, node.id);
  const name = leg => crossingLegName(network, leg);
  const staged = !!crossingDraft;
  return `<div class="structure-layout">
    ${roundabout && !staged ? `<div class="mode-group"><div class="group-label">${icon("roundabout")} Roundabout</div><div class="structure-sizes">
      ${[[26, "Compact"], [34, "Standard"], [42, "Wide"]].map(([radius, size]) =>
        `<button data-build-roundabout="${radius}" aria-label="${size} roundabout">${size}</button>`).join("")}
    </div></div>` : ""}
    ${axes.length ? `<div class="mode-group"><div class="group-label">${icon("crossing")} Separate through roads</div>
      ${axes.map(([a, b]) => `<div class="crossing-axis" data-active="${crossingDraft?.pair === a.neighbor}"><span>${name(a)} ↔ ${name(b)}</span>
        ${[["Surface", "Surface", 0], ["Over", "Overpass", 1], ["Under", "Underpass", -1]].map(([label, long, grade]) =>
          `<button data-crossing="${a.neighbor}:${grade}" aria-label="${long} from ${name(a)} to ${name(b)}"
            aria-pressed="${crossingDraft?.pair === a.neighbor && crossingDraft.grade === grade}">${label}</button>`).join("")}</div>`).join("")}
    </div>` : ""}
    ${crossingImpact(network)}
    ${staged ? `<div class="ramp-stage"><button data-action="cancel-crossing">Cancel</button>
      <button data-action="apply-crossing" class="primary" ${crossingDraft.grade && crossingDraft.result.network ? "" : "disabled"}>Apply</button></div>` :
      '<button class="structure-back" data-action="junction-structures" aria-pressed="true">Back to intersection</button>'}
  </div>`;
}

function intersectionControls(node) {
  const network = draft.network;
  const legs = junctionLegs(network, node.id);
  if (legs.some(leg => leg.road.roundabout)) return `<div class="level-brief"><strong>Roundabout entry</strong>
    <p>Entering traffic yields to vehicles already in the circle.</p><button data-action="intersection-overview">Map overview</button></div>`;
  if (buildingStructure) return structureControls(network, node);
  const buildable = roundaboutEligible(legs);
  const movement = junctionMovements(network, node, false).find(move => movementKey(move) === selectedMovement);
  const laneKey = selectedIncoming?.slice(3);
  const laneRule = laneKey ? node.laneRules?.[laneKey] : movement?.rule;
  const suffix = laneKey || !movement ? "lane" : "movement";
  const sign = (symbol, label, key, active, disabled) =>
    editorButton(symbol, label, key, active, disabled);
  const props = (attribute, value) => `data-${attribute}="${value}"`;
  const bulk = (label, action, disabled = false) =>
    `<button data-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
  const ruleDisabled = !laneKey && !movement;
  return `<div class="junction-layout">
    <div class="mode-group intersection-rules"><div class="group-label">Whole intersection</div>
      <div class="junction-signs">
      ${sign("signal", "Signal", props("intersection-control", "traffic_light"), node.control === "traffic_light")}
      ${sign("stop", "All-way stop", props("intersection-control", "allway_stop"), node.control === "allway_stop")}
      ${sign("yield", "All-way yield", props("intersection-control", "yield"), node.control === "yield")}
      </div>
      <div class="group-label">${suffix === "lane" ? "By lane" : "By movement"}</div>
      <div class="junction-signs">
      ${sign("stop", `Stop ${suffix}`, props("movement-rule", "stop"), node.control === "priority" && laneRule === "stop", ruleDisabled)}
      ${sign("yield", `Yield ${suffix}`, props("movement-rule", "yield"), node.control === "priority" && laneRule === "yield", ruleDisabled)}
      ${sign("close", `Clear ${suffix} rule`, props("movement-rule", "default"), undefined, ruleDisabled || !["stop", "yield"].includes(laneRule))}
      </div></div>
    <div class="mode-group intersection-movements${buildable ? " with-structures" : ""}"><div class="group-label">Allowed movements</div><div class="movement-actions">
      ${bulk("Remove all", "remove-movements", node.movements?.length === 0)}
      ${bulk("Reset default", "reset-movements", !node.movements)}
      <button data-action="draw-movements" aria-label="Draw movement" aria-pressed="${junctionMode === "draw" && !erasing}">Draw</button>
      ${buildable ? `<button data-action="junction-structures" aria-pressed="false">${icon("crossing")} Build structure</button>` : ""}
    </div></div>
    <div class="intersection-footer">
      <button data-action="intersection-overview">Map overview</button>
      <details class="intersection-options"><summary aria-label="Junction options">${icon("more")}</summary><div>
        <button data-action="move-free-node">Move node</button>
        ${movement ? '<button data-action="remove-selected-movement" aria-label="Remove movement">Remove turn</button>' : ""}
        ${node.control !== "priority" ? '<button data-intersection-control="priority">Clear control</button>' : ""}
      </div></details>
    </div></div>`;
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
  const movements = junctionMovements(draft.network, node, false);
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
  if (tool !== "junction") roadCamera = camera;
  tool = "junction";
  freeNode = id;
  laneStart = selectedIncoming = selectedMovement = undefined;
  junctionMode = "select";
  buildingStructure = false;
  crossingDraft = undefined;
  roadMessage = "";
  camera = undefined;
}

function leaveIntersection() {
  tool = "road";
  clearNetworkSelection();
  camera = roadCamera;
  roadMessage = "";
}

function editIntersection(target) {
  const lane = target.closest("[data-lane-port]")?.dataset.lanePort;
  const link = target.closest("[data-lane-link]")?.dataset.laneLink;
  const node = draft.network.nodes.find(item => item.id === freeNode);
  if (!node || buildingStructure || junctionLegs(draft.network, node.id).some(leg => leg.road.roundabout)) return;
  if (erasing && link) {
    editJunctionNode({ movements: junctionMovements(draft.network, node, false).filter(move => movementKey(move) !== link) });
    if (selectedMovement === link) selectedMovement = undefined;
  } else if (junctionMode === "draw" && lane && !erasing) {
    if (lane.startsWith("in:")) laneStart = laneStart === lane ? undefined : lane;
    else connectMovement(lane);
  } else if (lane?.startsWith("in:")) {
    selectedIncoming = selectedIncoming === lane ? undefined : lane;
    selectedMovement = undefined;
  } else if (link && junctionMode === "select") {
    selectedMovement = link;
    selectedIncoming = undefined;
  } else if (!lane) {
    selectedIncoming = selectedMovement = undefined;
  }
  render();
}

function laneArtwork(forward, backward, addedSide, delta = 1) {
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
    ${addedSide ? `<path d="M${horizon(addedSide === "left" ? 0 : 1)} 14l${addedSide === "left" ? -4 : 4} 0 ${addedSide === "left" ? -10 : 10} 36h${addedSide === "left" ? 14 : -14}Z" fill="${delta > 0 ? "#80dbea" : "#e5908a"}"/>` : ""}
    ${markings}<g fill="none" stroke="#f5fbff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${arrows}</g></svg>`;
}

function replaceFreeRoad(updates) {
  const network = draft.network;
  if (Object.entries(updates).every(([key, value]) => network.roads[freeRoad][key] === value)) return;
  const road = { ...network.roads[freeRoad], ...updates };
  if (roadModel.resizeRoadLanes) {
    const result = roadModel.resizeRoadLanes(network, freeRoad, road.forward, road.backward);
    if (result.network) editNetwork(result.network);
    roadMessage = result.issue ?? "";
    return;
  }
  const issue = roadShapeIssue(network, road, networkNodes(network)) ?? networkRoadIssue(network, road, freeRoad);
  roadMessage = issue ?? "";
  if (!issue) editNetwork({ ...network, roads: network.roads.map((item, i) => i === freeRoad ? road : item) });
}

function closestRoadPoint(network, point, exclude, grade = 0) {
  const nodes = networkNodes(network);
  let best;
  const limit = Math.min(20, 15 / map.getScreenCTM().a);
  for (const [index, road] of network.roads.entries()) {
    if (road.a === exclude || road.b === exclude || road.roundabout || roadGrade(road) !== grade) continue;
    const { samples, start, end } = networkRoadGeometry(road, nodes);
    for (const [sample, p] of samples.entries()) {
      if (Math.min(Math.hypot(p.x - start.x, p.y - start.y), Math.hypot(p.x - end.x, p.y - end.y)) < 16) continue;
      const offset = (road.laneShift ?? 0) * networkLaneWidth;
      const distance = Math.hypot(p.x - Math.sin(p.angle) * offset - point.x, p.y + Math.cos(p.angle) * offset - point.y);
      if (distance < (best?.distance ?? limit)) best = { x: p.x, y: p.y, distance, index, t: sample / (samples.length - 1) };
    }
  }
  return best;
}

function snapPoint(point, source, id, exclude, grade) {
  const network = draft.network;
  grade ??= roadMode === "draw" ? drawGrade : 0;
  const nodes = networkNodes(network);
  if (id && id !== exclude) return { ...nodes.get(id), id };
  if (snapping.nodes) {
    const limit = Math.min(20, 16 / map.getScreenCTM().a);
    const closest = [...nodes.values()].filter(node => node.id !== exclude).reduce((best, node) => {
      const distance = Math.hypot(point.x - node.x, point.y - node.y);
      return distance < (best?.distance ?? limit) ? { ...node, distance } : best;
    }, undefined);
    if (closest) return closest;
  }
  if (snapping.roads) {
    const onRoad = closestRoadPoint(network, point, exclude, grade);
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

function appendDraft(current, point) {
  if (!point) return current;
  const last = current.points.at(-1);
  if (last && (point.id && last.id === point.id || Math.hypot(last.x - point.x, last.y - point.y) < 16)) return current;
  if (freeformDraw() && (current.points.length >= 30 || last?.anchor && current.points.length > 1)) return current;
  const limit = drawShape === "complex" ? 3 : 2;
  const points = !freeformDraw() && current.points.length === limit ?
    [...current.points.slice(0, -1), point] : [...current.points, point];
  const handles = current.handles.slice(0, points.length - (freeformDraw() ? 1 : 0));
  if (points.length === current.points.length) handles[points.length - 1] = undefined;
  if (freeformDraw() && current.nextBend && last) {
    handles[current.points.length - 1] = freeformBendControls(last, point, current.nextBend);
  }
  return { points, handles };
}

function resolveDraftPoint(point, target, current = drawing) {
  const id = target?.closest("[data-free-node]")?.dataset.freeNode;
  const network = draft.network;
  const last = current.points.at(-1);
  const start = current.points[0];
  const mid = drawShape === "complex" && current.points.length === 1;
  const port = mid || drawGrade ? undefined : lanePortFromTarget(target);
  if (port && port.id !== last?.id && (!last || !start?.anchor || port.id !== start.id)) return port;
  if (id) return id === last?.id ? undefined : { ...networkNodes(network).get(id), id };
  if (!point) return undefined;
  if (!drawGrade && !mid && last && snapping.nodes && (laneFocus || start?.anchor || pickingEndLane)) {
    const near = lanePortNear(point, "outgoing", { all: !!laneFocus, exclude: start.id });
    if (near) return near;
  }
  return snapPoint(point, last, undefined, last?.id);
}

function applyDrawing() {
  if (!drawingComplete()) return;
  const controls = drawingControls(drawing);
  const result = commitRoadDraft(draft.network, drawing.points, drawLanes, controls, drawGrade);
  if (!result.network) {
    roadMessage = result.issue;
    return;
  }
  editNetwork(result.network);
  clearDrawing();
  roadMessage = `${drawGrade ? gradeName(drawGrade) : "Road"} added.`;
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
  const nodes = networkNodes(network);
  const controls = curveHandleControls(road, network, nodes, handle, point, curveAngles);
  const result = editNetworkCurve(network, index, controls);
  roadMessage = result.issue ?? "";
  if (!result.network) return;
  editNetwork(result.network);
  freeRoad = result.network.roads.findIndex(item => item.a === road.a && item.b === road.b);
  if (freeRoad < 0) {
    freeRoad = undefined;
    freeCurve = false;
  }
}

function editFreeMap(target, point) {
  const network = draft.network;
  const terminals = networkTerminals(network);
  const id = target?.closest("[data-free-node]")?.dataset.freeNode;
  const roadIndex = target?.closest("[data-free-road]")?.dataset.freeRoad;
  const end = target?.closest("[data-lane-end]")?.dataset.laneEnd;
  const port = lanePortFromTarget(target);
  if (target?.closest("[data-ramp-handle]")) return;
  const rampEnd = !erasing && rampTargetEnd();
  if (rampPicker) return;
  if (rampEnd && !port && (!id || rampDraft)) {
    const exact = !point && rampArrowTarget(target, rampEnd);
    if ((point || exact) && pickRampLane(point, rampEnd, exact)) {
      render();
      (rampPicker ? $("[data-ramp-pick]") : $('[data-action="apply-ramp"]'))?.focus({ preventScroll: true });
      return;
    }
    if (rampDraft) {
      roadMessage = `Tap a ${rampEndName(rampEnd).toLowerCase()} lane on a road.`;
      render();
      return;
    }
  }
  if (roadMode === "move" || rampDraft) return;
  if (target?.closest("[data-draft-tangent], [data-draft-anchor], [data-segment-shift], [data-curve-handle], [data-road-join]")) return;
  roadMessage = "";
  if (erasing) {
    if (id && !terminals[id]) {
      const result = removeNetworkNode(network, id);
      if (result.network) editNetwork(result.network);
      roadMessage = result.issue ?? "Junction removed. Tap the eraser again to delete all.";
    } else if (roadIndex !== undefined) {
      const index = Number(roadIndex);
      const next = removeNetworkRoad(network, index);
      const issue = next.roads.map((road, i) => roadGrade(road) && networkRoadIssue(next, road, i)).find(Boolean);
      if (!issue) editNetwork(next);
      roadMessage = issue || `${network.roads[index].roundabout ? "Roundabout" : "Road"} removed. Tap the eraser again to delete all.`;
    }
  } else if (end) {
    selectedLaneEnd = end;
    focusLanePorts(network.roads[freeRoad][end]);
  } else if (selectedLaneEnd && (port || id || point) && roadMode === "select") {
    const road = network.roads[freeRoad];
    if (!port && id && id !== laneFocus) focusLanePorts(id);
    else if (road) shiftLaneEnd(selectedLaneEnd, port ?? snapPoint(point, undefined, id, road[selectedLaneEnd === "a" ? "b" : "a"]));
  } else if (roadMode === "draw") {
    const start = drawing.points[0];
    const last = drawing.points.at(-1);
    const canPickEnd = drawShape !== "complex" || drawing.points.length > 1;
    if (!port && id && id !== last?.id && canPickEnd && (start?.anchor || pickingEndLane) && !laneFocus &&
        junctionLegs(network, id).some(leg => leg.outgoing && !leg.slip)) {
      focusLanePorts(id);
    } else {
      const next = appendDraft(drawing, resolveDraftPoint(point, target));
      if (next !== drawing) {
        changeDrawing(next);
        if (port) clearLaneFocus();
      }
    }
  } else if (roadMode === "split") {
    if (roadIndex !== undefined) {
      const index = Number(roadIndex);
      const road = network.roads[index];
      const { samples } = networkRoadGeometry(road, networkNodes(network));
      const distance = sample => Math.hypot(sample.x - point.x, sample.y - point.y);
      const nearest = point ? samples.reduce((best, item) => distance(item) < distance(best) ? item : best) : samples[50];
      const node = nextNetworkNode(network, nearest);
      const result = splitNetworkRoad(network, index, node, samples.indexOf(nearest) / (samples.length - 1));
      roadMessage = result.issue ?? "";
      if (result.network) {
        editNetwork(result.network);
        freeNode = node.id;
        freeRoad = undefined;
        roadMode = "select";
      }
    } else if (!id && point && network.nodes.length < 60) {
      const position = snapPoint(point);
      const node = nextNetworkNode(network, position);
      roadMessage = position.id ? "" : networkNodeIssue(node, network) ?? "";
      if (!roadMessage) {
        if (!position.id) editNetwork({ ...network, nodes: [...network.nodes, node] });
        freeNode = position.id ?? node.id;
        roadMode = "select";
      }
    }
  } else {
    freeCurve = movingSegment = roadOptions = false;
    freeRoad = roadIndex === undefined ? undefined : Number(roadIndex);
    selectedRamp = network.roads[freeRoad]?.rampId;
    freeNode = id;
    selectedLaneEnd = undefined;
    clearLaneFocus();
    demandTerminal = terminals[id] ? id : undefined;
    if (id && !terminals[id]) selectIntersection(id);
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
  if (replay?.config !== config || !replay.signalLayer.isConnected) {
    const legacyLayer = config.network ? "" : '<g class="vehicle-layer" data-vehicle-level="0" pointer-events="none"/>';
    surface.innerHTML = mapMarkup(config, false) + legacyLayer +
      '<g class="weave-layer" pointer-events="none"/><g class="signal-layer" pointer-events="none"/>';
    replay = { config, vehicles: surface.querySelectorAll(".vehicle-layer"), signalLayer: surface.querySelector(".signal-layer"),
      weaveLayer: surface.querySelector(".weave-layer"), signals: surface.querySelectorAll("[data-signal-approach]") };
    replaySurfaces.set(surface, replay);
  }
  if (replay.highlightWeaves !== highlightWeaves) {
    const weaves = highlightWeaves && config.network ? routing.networkWeaves?.(config.network) ?? [] : [];
    replay.weaveLayer.innerHTML = weaves.filter(item => item.samples.length > 1).map(item => {
      const path = linePath(item.samples);
      return `<g data-simulation-weave="${item.id}"><path d="${path}" class="weave-outline"/>
        <path d="${path}" class="weave-marking"/><title>Weave · ${Math.round(item.distance)} m</title></g>`;
    }).join("");
    replay.highlightWeaves = highlightWeaves;
  }
  const frame = run?.frames[Math.floor(time / step + 1e-8)];
  const layers = { "-1": "", 0: "", 1: "" };
  const pixelsPerUnit = surface.getScreenCTM()?.a || 1;
  if (frame) for (const car of replayMarkers(run.frames, time)) layers[car.grade ?? 0] += vehicleMarkup(car, frame, pixelsPerUnit);
  for (const layer of replay.vehicles) layer.innerHTML = layers[layer.dataset.vehicleLevel];
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
    paintReplay($("#original-map"), startingDesign, original, bounds);
    paintReplay($("#design-map"), design, currentRun, bounds);
  } else if (!editing) {
    const editedFrame = currentRun?.frames[Math.floor(time / step + 1e-8)];
    const bounds = highlightQueues && editedFrame?.longestQueue > 0 ? queueViewBox(editedFrame) : design.network ? "0 55 500 570" : comparisonViewBox;
    paintReplay(map, design, currentRun, bounds);
  } else {
    const junction = editing && tool === "junction" && draft.network?.nodes.find(node => node.id === freeNode);
    const zoom = buildingStructure ? 230 : 130;
    const focus = junction ? `${junction.x - zoom / 2} ${junction.y - zoom / 2} ${zoom} ${zoom}` : undefined;
    map.setAttribute("viewBox", editing && camera ? camera.join(" ") : focus ?? ((editing ? draft : design).network ? "0 32 500 600" : editing && tool === "road" ? "130 55 370 810" : editing && tool === "junction" ? "150 125 345 605" : editing && tool === "slip" ? "140 90 360 615" : editing && tool === "lanes" ? "145 145 340 476" : "0 0 500 700"));
    const display = freeDrag?.kind === "join" && freeDrag.network ? { ...draft, network: freeDrag.network } : draft;
    map.innerHTML = mapMarkup(display, true);
  }
}

const changed = () => Object.keys(baseline).some(key => design[key] !== draft[key]);
const metric = value => Math.round(value);
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const curveReadout = curve => Number.isFinite(curve.radius) ?
  `Min radius ${Math.round(curve.radius)} m · ${Math.round(curve.speed * 3.6)} km/h` : "Straight · ends aligned";

function networkDetail(intersection) {
  const network = draft.network;
  const terminals = networkTerminals(network);
  if (roadMessage) return roadMessage;
  if (rampPicker) return "Use the lane arrows to check travel direction.";
  if (rampReassign) return `Tap a road to reassign the ${rampEndName(rampReassign).toLowerCase()} lane.`;
  if (rampDraft) {
    if (!rampDraft.end) return "Tap a receiving lane. Hold and pull to bend the connector.";
    if (rampPreview?.issue) return rampPreview.issue;
    if (rampPreview?.warnings?.length) return rampPreview.warnings[0].message;
    if (roadMode === "move") return "Drag either join along its host lane. Pull the curve ball to adjust the bend.";
    return "Pull the curve ball to refine the preview, then tap Apply.";
  }
  if (crossingDraft) return crossingDraft.result.issue ?? (crossingDraft.grade ? "Review the closed turns and demand, then tap Apply." : "Both roads stay at the surface.");
  if (roadMode === "move") return "Drag anywhere to pan. Pinch to zoom.";
  if (erasing) return "Tap to erase. Tap the eraser again to delete all roads.";
  if (roadMode === "split") return "Tap a road or an open spot to add a node.";
  if (intersection && buildingStructure) return junctionCrossingAxes(network, intersection.id).length ?
    "Choose a roundabout size or separate the crossing roads." : "Choose a roundabout size.";
  if (intersection && junctionLegs(network, intersection.id).some(leg => leg.road.roundabout)) return "Roundabout entry";
  if (intersection) return junctionMode === "draw" ? "Connect a blue lane to a purple lane." :
    "Tap an incoming lane or a turn arrow.";
  if (movingSegment) return "Drag the handle sideways. Each step shifts one lane.";
  if (freeCurve) return curveAngles ? "Drag the handles to set entry and exit angles." :
    "Slide the entry and exit handles to shape the bend.";
  if (selectedLaneEnd) return "Drag the endpoint or tap a lane to reconnect it.";
  if (roadMode !== "draw") {
    if (network.roads[freeRoad]?.roundabout) return "Roundabout lane";
    if (selectedRamp) return "Edit the ramp’s elevation, lane anchors, or curve.";
    if (freeNode && !terminals[freeNode]) return "Drag the highlighted junction to move its roads.";
    return freeRoad === undefined ? "Tap a road or junction to edit." : "Edit this segment’s lanes, alignment, or curve.";
  }
  if (laneFocus) return "Tap a lane to connect to it.";
  const count = drawing.points.length;
  if (!count) return drawShape === "auto" && network.roads.length ? "Tap an exit lane to start a connector, or tap open ground to draw a road." :
    drawGrade ? `Tap a start point for the ${gradeName(drawGrade).toLowerCase()}.` : "Tap a start point or a lane.";
  if (freeformDraw()) return count === 1 ? "Tap to extend. Hold and drag to bend." : "Tap to extend or hold a segment to bend it.";
  if (drawShape === "complex" && count === 1) return "Tap the break point.";
  if (!drawingComplete()) return "Tap an endpoint or node.";
  const issue = previewRoadDraft(draft.network, drawing.points, drawLanes, drawingControls(drawing), drawGrade).issue;
  if (issue) return issue;
  return drawShape === "straight" ? "Tap Apply to build the road." : "Drag the angle handle, then tap Apply.";
}

function renderInspector() {
  inspector.classList.toggle("report-panel", view === "results" && !!currentRun);
  inspector.classList.toggle("editor-tray", view === "design" && !!draft.network && !inspectorCollapsed);
  inspector.setAttribute("aria-label", { design: "Design controls", simulate: "Simulation controls", results: "Results" }[view]);
  if (view === "design") {
    const geometry = curve(draft, draft.lanes & 1 ? 1 : 2);
    const node = tool === "junction" ? junctions(draft).find(item => item.id === selectedJunction) : undefined;
    const title = draft.network ? tool === "junction" ? "Intersections" : "Road Builder" : { road: "Road Builder", move: "Move node", curve: "Adjust curve", lanes: "Connect lanes", signal: "Signal timing", junction: node?.name ?? "Junctions", slip: "Draw slip lane" }[tool];
    const collapse = `<button class="inspector-toggle" data-action="toggle-inspector"
      aria-label="${inspectorCollapsed ? "Expand" : "Minimize"} design panel" aria-expanded="${!inspectorCollapsed}">${icon("chevron")}</button>`;
    const heading = `<div class="row inspector-heading"><h1>${title}</h1>${collapse}</div>`;
    if (inspectorCollapsed) {
      inspector.innerHTML = heading;
      return;
    }
    if (draft.network) {
      const intersection = tool === "junction" && draft.network.nodes.find(item => item.id === freeNode);
      const road = draft.network.roads[freeRoad];
      const terminalPanel = demandTerminal ? demandDetails(demandTerminal) : "";
      let content = "";
      if (intersection) content = intersectionControls(intersection);
      else if (roadMode === "draw" && !erasing) content = drawControls();
      else if (roadMode === "move" && rampDraft) content = rampControls();
      else if (road && !erasing) content = segmentControls(road);
      else if (roadMode === "move" && !erasing) content = `<div class="level-brief">
        <strong>${level.name}</strong><p>${level.problem} ${level.goal} Keep all routes open and avoid collisions.</p>
        <div class="row"><button data-action="map-overview">Map overview</button></div></div>`;
      else if (!erasing && roadMode !== "move") content = `<div class="empty-tools">
        <button data-action="split-mode" aria-pressed="${roadMode === "split"}">${icon("node")}Add node</button>
        ${changed() && draft.network ? '<button data-action="apply" class="primary">Apply</button>' : ""}
        </div>`;
      inspector.innerHTML = `<h1 class="sr-only">${title}</h1>${editorToolbar(intersection)}
        <div class="tray-status"><p id="detail" role="status">${networkDetail(intersection)}</p>${collapse}</div>
        <div class="tray-content">${content}</div><div id="terminal-demand">${terminalPanel}</div>`;
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
    inspector.innerHTML = `<div class="pending-run"><h1>${view === "simulate" ? "Traffic simulation" : level.name + " results"}</h1>
      <p role="status"></p></div>${sumoMessage ? '<div class="row actions"><button data-action="retry">Retry</button></div>' : ""}`;
    inspector.querySelector("[role=status]").textContent = sumoMessage || "Running the original and your design…";
  } else if (view === "simulate") {
    const { peakFrame, longestQueue } = currentRun.results;
    const peak = longestQueue ? `<span class="timeline-peak" style="--peak-time:${peakFrame * step / duration * 100}%" aria-hidden="true"></span>` : "";
    const legend = [["car", "Car"], ["bus", "Bus"], ["pickup", "Pickup"], ["queue", "Queued"]].map(([key, label]) =>
      `<span><i style="--vehicle-color:${vehicleColors[key]}"></i>${label}</span>`).join("");
    const weaves = currentRun.results.weaves ?? [];
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
      ${weaves.length ? `<div class="weave-controls">
        <button data-action="highlight-weaves" aria-pressed="${highlightWeaves}">Weaves</button>
        ${highlightWeaves ? `<p>${weaves.map(weave => `${Math.round(weave.distance)} m · ${Math.round(weave.peakQueue)} m peak queue`).join(" / ")}</p>` : ""}
      </div>` : ""}
      <small class="engine-credit sr-only">Eclipse SUMO</small></div>`;
    updateSimulationReadout();
  } else {
    const a = original.results;
    const b = currentRun.results;
    const rows = [
      ["Peak queue", a.longestQueue, b.longestQueue, "m", 1],
      ...(["pickupFinished", "busDelay"].includes(level.metric) ? [["Bus delay", a.busDelay, b.busDelay, "s", 1]] : []),
      [level.metric === "northFinished" ? "Highway traffic delay" : design.network?.map === "four-way-backup" ? "Traffic delay" : "Cross-street delay", a.crossDelay, b.crossDelay, "s", 1],
      ...(level.metric === "pickupFinished" ? [["Pickup trips", a.pickupFinished, b.pickupFinished, "", -1],
        ["Cross-street trips", a.crossFinished, b.crossFinished, "", -1]] : []),
      ...(level.metric === "northFinished" ? [["North highway trips", a.northFinished, b.northFinished, "", -1]] : []),
      ["All trips", a.finished, b.finished, "", -1],
      ...(design.slipStart || design.network?.roads.some(road => road.laneA || road.laneB) ?
        [["Slip lane trips", a.slipFinished, b.slipFinished, "", -1]] : []),
      ...(b.unserved ? [["Trips with no route", a.unserved, b.unserved, "", 1]] : []),
      ["Collisions", a.collisions, b.collisions, "", 1]
    ];
    const higher = ["finished", "pickupFinished", "northFinished"].includes(level.metric);
    const improved = higher ? b[level.metric] > a[level.metric] : metric(b[level.metric]) < metric(a[level.metric]);
    const goal = b.unserved === 0 && b.collisions === 0 && improved && b.finished >= a.finished;
    const summary = b.unserved ? `${b.unserved} ${b.unserved === 1 ? "trip has" : "trips have"} no route. Check connections and turns.` :
      b.collisions ? `SUMO recorded ${b.collisions} ${b.collisions === 1 ? "collision" : "collisions"}.` :
      goal ? "Goal met." : level.goal + " Use the original to compare your run.";
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
    const objective = {
      pickupFinished: ["Pickup trips", "pickupFinished", "", false],
      northFinished: ["North highway trips", "northFinished", "", false],
      busDelay: ["Bus delay", "busDelay", "s", true]
    }[level.metric] ?? ["Peak queue", "longestQueue", "m", true];
    const [label, field, unit, lowerIsBetter] = objective;
    const terminals = design.network ? networkTerminals(design.network) : {};
    const ramps = b.ramps ?? [];
    const movements = (b.movements ?? []).filter(movement => movement.demand);
    inspector.innerHTML = `<div class="report-content" tabindex="0" role="region" aria-label="Simulation results">
      <div class="report-heading"><h1>${level.name} results</h1><p class="report-outcome ${goal ? "success" : ""}">${summary}</p></div>
      <div class="report-key-metrics">${stat(label, b[field], a[field], unit, lowerIsBetter)}
        ${stat("Completed trips", b.finished, a.finished, "", false)}</div>
      <table class="metrics" aria-label="Simulation results by design">
      <thead><tr><th scope="col">Measure</th><th scope="col">Original</th><th scope="col">Yours</th><th scope="col">Change</th></tr></thead>
        <tbody>${rows.map(row => cell(...row)).join("")}</tbody></table>
      ${ramps.length ? `<details class="movement-report"><summary>Ramp traffic</summary><ul>
        ${ramps.map(ramp => `<li>${rampName(design.network.ramps?.[ramp.id])} · ${ramp.entered} entered · ${ramp.completed}/${ramp.scheduled} completed · ${Math.round(ramp.peakQueue)} m peak queue</li>`).join("")}
      </ul></details>` : ""}
      ${movements.length ? `<details class="movement-report"><summary>Trips by movement</summary><ul>
        ${movements.map(move => `<li>${terminals[move.from]?.name ?? move.from} → ${terminals[move.to]?.name ?? move.to}
          · ${move.completed}/${move.demand} completed · ${Math.round(move.averageDelay)} s average delay</li>`).join("")}
      </ul></details>` : ""}</div>
      <div class="row actions"><button class="primary" data-action="peak" ${b.longestQueue ? "" : "disabled"}>See peak queue</button></div>`;
  }
  if (view !== "design") $(".game").style.setProperty("--report-height", `${inspector.offsetHeight}px`);
}

function render() {
  $("#level-menu").hidden = !menuOpen;
  $("#playfield").hidden = menuOpen;
  if (menuOpen) {
    renderLevelMenu();
    return;
  }
  $("#scenario-name").textContent = level.name;
  map.setAttribute("aria-label", `${level.name} road map`);
  document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", button.dataset.view === view));
  document.querySelectorAll("[data-tool]").forEach(button => button.setAttribute("aria-pressed", button.dataset.tool === tool));
  $(".tools").hidden = view !== "design" || !!draft.network;
  map.classList.toggle("network-edit", view === "design" && !!draft.network);
  map.classList.toggle("erasing", view === "design" && erasing);
  map.classList.toggle("navigating", view === "design" && roadMode === "move");
  $('[data-action="new-builder"]').hidden = !!draft.network;
  $(".game").classList.toggle("tray-collapsed", inspectorCollapsed);
  renderInspector();
  paintMap();
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
  if (mapPointers.size === 1 && ((roadMode !== "move" && (event.target.closest("[role=button], [role=slider], [data-handle]") ||
      draft.network && tool === "road" && roadMode === "draw")) || rampReassign || event.target.closest("[data-ramp-handle][role]"))) return;
  if (mapPointers.size > 1) {
    if (rampDrag) {
      clearTimeout(rampDrag.timer);
      setRampDraft(rampDrag.before);
      rampDrag = undefined;
      updateRampPreview();
    }
    if (movementDrag) {
      movementDrag = undefined;
      laneStart = undefined;
      paintMap();
    }
    if (freeDrag) {
      clearTimeout(terminalHold);
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

function draftSpanAt(point) {
  const curves = drawingControls(drawing);
  let index, nearest = 16 / mapScale();
  for (let i = 0; i < drawing.points.length - 1; i++) {
    const start = drawing.points[i], end = drawing.points[i + 1];
    const nodes = new Map([["a", start], ["b", end]]);
    const { samples } = networkRoadGeometry({ a: "a", b: "b", bend: 0, controls: curves[i] }, nodes);
    for (const sample of samples) {
      const gap = Math.hypot(sample.x - point.x, sample.y - point.y);
      if (gap > nearest) continue;
      nearest = gap;
      index = i;
    }
  }
  return index;
}

function armRoadHold(gesture) {
  terminalHold = setTimeout(() => {
    if (freeDrag !== gesture) return;
    gesture.ready = true;
    gesture.ball = gesture.down;
    if (gesture.kind === "draw-road" && !freeformDraw()) {
      const tangent = gesture.tangent ?? (gesture.candidate.points.length - 1);
      if (tangent > 0) gesture.drawing = gesture.candidate;
    }
    updateRoadPreview();
  }, roadCurveHold);
}

function updateRoadPreview() {
  const layer = $("[data-road-preview]");
  if (layer) layer.innerHTML = roadGestureMarkup();
}

function updateRampHandle(kind, point, before, down, handles) {
  if (kind === "a" || kind === "b") {
    const key = rampEndpoint(kind);
    const port = before[key];
    const targets = rampTargets(point, kind, port.host, 55).filter(item => item.forward === port.forward);
    const lateral = Math.cos(port.angle) * (point.y - down.y) - Math.sin(port.angle) * (point.x - down.x);
    const lane = Math.abs(lateral) > 3 ? targets[0]?.lane : port.lane;
    const next = targets.find(item => item.lane === lane);
    if (next && !sameRampEnd(next, rampDraft[key])) setRampDraft({ ...before, [key]: next });
    return;
  }
  const { start, end } = before;
  if (kind === "start" || kind === "end") {
    const anchor = before[kind];
    const direction = kind === "start" ? 1 : -1;
    const reach = ((point.x - anchor.x) * Math.cos(anchor.angle) + (point.y - anchor.y) * Math.sin(anchor.angle)) * direction;
    setRampDraft({ ...before, [`${kind}Reach`]: clamp(reach, 3, 180) });
    return;
  }
  const dx = end.x - start.x, dy = end.y - start.y;
  const chord = Math.hypot(dx, dy) || 1;
  const pull = (dx * (point.y - down.y) - dy * (point.x - down.x)) / chord;
  const middle = handles?.middle;
  const side = middle ? Math.sign(dx * (middle.y - start.y) - dy * (middle.x - start.x)) || 1 : 1;
  const directReach = handles?.start && Math.hypot(handles.start.x - start.x, handles.start.y - start.y);
  const defaultReach = before.shape === "loop" ? Math.max(22, chord / 3) : directReach || chord / 3;
  const reach = clamp((before.reach ?? defaultReach) + side * pull, 10, 150);
  setRampDraft({ ...before, reach, startReach: undefined, endReach: undefined });
}

map.addEventListener("pointerdown", event => {
  if (!draft.network || view !== "design" || erasing || event.button !== 0) return;
  const handle = event.target.closest("[data-ramp-handle][role]")?.dataset.rampHandle;
  if (!handle && !rampDraft) return;
  event.stopImmediatePropagation();
  const down = mapPoint(event);
  if (handle) {
    rampDrag = { kind: handle, pointer: event.pointerId, down, before: rampDraft, handles: rampPreview?.handles };
    map.setPointerCapture(event.pointerId);
  } else if (rampTargetEnd() === "b" && !rampDraft.end && !rampPicker) {
    const port = rampTargets(down, "b")[0];
    if (!port) return;
    const gesture = { pointer: event.pointerId, down, before: rampDraft };
    rampDrag = gesture;
    gesture.timer = setTimeout(() => {
      if (rampDrag !== gesture) return;
      acceptRampLane(port, "b");
      gesture.kind = "bend";
      gesture.held = true;
      gesture.beforePull = rampDraft;
      gesture.handles = rampPreview?.handles;
      map.setPointerCapture(event.pointerId);
      updateRampPreview();
    }, roadCurveHold);
  }
});

map.addEventListener("pointermove", event => {
  const gesture = rampDrag;
  if (gesture?.pointer !== event.pointerId) return;
  const point = mapPoint(event);
  if (Math.hypot(point.x - gesture.down.x, point.y - gesture.down.y) * mapScale() < 4 && !gesture.moved) return;
  event.stopImmediatePropagation();
  clearTimeout(gesture.timer);
  if (!gesture.kind) return;
  gesture.moved = true;
  updateRampHandle(gesture.kind, point, gesture.beforePull ?? gesture.before, gesture.down, gesture.handles);
  updateRampPreview();
});

for (const type of ["pointerup", "pointercancel"]) {
  map.addEventListener(type, event => {
    const gesture = rampDrag;
    if (gesture?.pointer !== event.pointerId) return;
    event.stopImmediatePropagation();
    clearTimeout(gesture.timer);
    rampDrag = undefined;
    if (type === "pointercancel") {
      setRampDraft(gesture.before);
      render();
      return;
    }
    if (!gesture.kind) return;
    suppressMapClick = true;
    if (!gesture.moved && (gesture.kind === "a" || gesture.kind === "b")) {
      rampReassign = rampReassign === gesture.kind ? undefined : gesture.kind;
      roadMessage = "";
    }
    render();
  });
}

map.addEventListener("pointerdown", event => {
  if (!draft.network || view !== "design" || erasing || event.button !== 0) return;
  const target = event.target;
  const terminals = networkTerminals(draft.network);
  const id = target.closest("[data-free-node]")?.dataset.freeNode;
  const handle = target.closest("[data-curve-handle]")?.dataset.curveHandle;
  const join = target.closest("[data-road-join]")?.dataset.roadJoin;
  const end = target.closest("[data-lane-end]")?.dataset.laneEnd;
  const tangent = target.closest("[data-draft-tangent]");
  const anchor = target.closest("[data-draft-anchor]")?.dataset.draftAnchor;
  const atShift = target.closest("[data-segment-shift]");
  const point = mapPoint(event);
  let kind;
  if (tool === "road" && roadMode === "draw") kind = "draw-road";
  else if (handle !== undefined) kind = "curve";
  else if (join) kind = "join";
  else if (end) kind = "lane";
  else if (atShift || movingSegment && target.closest(`[data-free-road="${freeRoad}"]`)) kind = "segment";
  else if (tool === "road" && roadMode === "select" && id && !terminals[id] && !selectedLaneEnd) kind = "move";
  if (!kind && !terminals[id]) return;
  const gesture = { id, kind, end, join, handle: Number(handle), road: freeRoad, pointer: event.pointerId,
    x: event.clientX, y: event.clientY, down: point };
  freeDrag = gesture;
  if (kind === "join") {
    map.setPointerCapture(event.pointerId);
    const road = draft.network.roads[freeRoad];
    gesture.joinStart = networkNodes(draft.network).get(road[join]);
  } else if (kind === "segment") {
    map.setPointerCapture(event.pointerId);
    const road = draft.network.roads[freeRoad];
    gesture.laneShift = road.laneShift ?? 0;
    gesture.angle = networkRoadGeometry(road, networkNodes(draft.network)).samples[50].angle;
  } else if (kind === "draw-road") {
    const resolved = resolveDraftPoint(point, target);
    gesture.fromNode = !drawing.points.length && (id || resolved?.anchor);
    gesture.tangent = tangent ? Number(tangent.dataset.draftTangent) : undefined;
    gesture.outgoing = freeformDraw() && anchor !== undefined;
    if (freeformDraw() && !gesture.outgoing && !id && !resolved?.anchor && drawing.points.length > 1) {
      gesture.span = draftSpanAt(point);
    }
    gesture.candidate = gesture.tangent !== undefined || gesture.span !== undefined || gesture.outgoing ? drawing : appendDraft(drawing, resolved);
    if (tangent?.tagName.toLowerCase() === "g") gesture.ready = true;
    else if (drawShape !== "straight" && (drawing.points.length || !terminals[id])) armRoadHold(gesture);
  }
  if (terminals[id] && (kind !== "draw-road" || !drawing.points.length)) {
    clearTimeout(terminalHold);
    terminalHold = setTimeout(() => {
      if (freeDrag !== gesture) return;
      gesture.held = true;
      demandTerminal = id;
      suppressMapClick = true;
      suppressHeldTouchClickUntil = performance.now() + 700;
      $("[data-demand-layer]").innerHTML = demandMarkup();
      const details = $("#terminal-demand");
      if (details) details.innerHTML = demandDetails(id);
    }, 450);
  }
});

function dragNetworkPoint(event, gesture) {
  const point = mapPoint(event);
  if (gesture.kind === "curve") return point;
  if (gesture.kind === "join") return { x: gesture.joinStart.x + point.x - gesture.down.x,
    y: gesture.joinStart.y + point.y - gesture.down.y };
  if (gesture.kind === "segment") {
    const cross = (point.y - gesture.down.y) * Math.cos(gesture.angle) - (point.x - gesture.down.x) * Math.sin(gesture.angle);
    return clamp(gesture.laneShift + Math.round(cross / networkLaneWidth), -maxLaneShift, maxLaneShift);
  }
  const network = draft.network;
  const nodes = networkNodes(network);
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const target = hit?.closest("[data-free-node]")?.dataset.freeNode;
  const port = lanePortFromTarget(hit);
  if (gesture.kind === "lane") {
    const road = network.roads[gesture.road];
    const exclude = road[gesture.end === "a" ? "b" : "a"];
    return port ?? (snapping.nodes ? lanePortNear(point, gesture.end === "a" ? "incoming" : "outgoing", { all: true, end: gesture.end, exclude }) : undefined) ??
      snapPoint(point, undefined, target, exclude);
  }
  const road = network.roads.find(item => item.a === gesture.id || item.b === gesture.id);
  const source = road && nodes.get(road.a === gesture.id ? road.b : road.a);
  return snapPoint(point, source, undefined, gesture.id);
}

function changeTangent(current, index, delta) {
  if (!current.points[index] || index < 1) return current;
  let bearing = Math.atan2(delta.y, delta.x);
  if (snapping.angle) bearing = Math.round(bearing / (Math.PI / 4)) * Math.PI / 4;
  const handles = [...current.handles];
  handles[index] = { x: Math.cos(bearing), y: Math.sin(bearing), reach: Math.hypot(delta.x, delta.y) };
  return { ...current, handles };
}

function updateDraftDrag(event, gesture) {
  const point = mapPoint(event);
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  if (!gesture.ready) {
    if (gesture.fromNode) {
      gesture.drawing = appendDraft(gesture.candidate, resolveDraftPoint(point, hit, gesture.candidate));
      return;
    }
    freeDrag = undefined;
    startCameraGesture();
    suppressMapClick = true;
    return;
  }
  gesture.ball = point;
  if (freeformDraw()) {
    const current = gesture.candidate;
    const delta = { x: point.x - gesture.down.x, y: point.y - gesture.down.y };
    if (gesture.outgoing || current.points.length === 1) {
      gesture.drawing = { ...current, nextBend: delta };
      return;
    }
    if (current.points.length < 2) return;
    const index = gesture.span ?? current.points.length - 2;
    const start = current.points[index], end = current.points[index + 1];
    const limit = Math.hypot(end.x - start.x, end.y - start.y);
    const handles = [...current.handles];
    const prior = handles[index];
    const base = prior ? { x: (prior[0] - start.x * 2 / 3 - end.x / 3) * .75,
      y: (prior[1] - start.y * 2 / 3 - end.y / 3) * .75 } : { x: 0, y: 0 };
    handles[index] = freeformBendControls(start, end, {
      x: clamp(base.x + delta.x, -limit, limit), y: clamp(base.y + delta.y, -limit, limit)
    });
    gesture.drawing = { ...current, handles };
  } else {
    const current = gesture.candidate;
    const index = gesture.tangent ?? current.points.length - 1;
    const anchor = current.points[index];
    if (anchor) gesture.drawing = changeTangent(current, index, { x: point.x - anchor.x, y: point.y - anchor.y });
  }
}

map.addEventListener("pointermove", event => {
  const gesture = freeDrag;
  if (gesture?.pointer !== event.pointerId || gesture.held || gesture.kind !== "segment" &&
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 4) return;
  clearTimeout(terminalHold);
  if (!gesture.kind) return;
  if (gesture.kind === "draw-road") {
    updateDraftDrag(event, gesture);
    if (freeDrag !== gesture) return;
  } else gesture.point = dragNetworkPoint(event, gesture);
  if (!map.hasPointerCapture(event.pointerId)) map.setPointerCapture(event.pointerId);
  if (!gesture.moved) {
    if (gesture.kind === "move") {
      freeNode = gesture.id;
      freeRoad = undefined;
      freeCurve = movingSegment = false;
    }
    gesture.moved = true;
    demandTerminal = undefined;
    if (gesture.kind === "lane" || gesture.kind === "move") paintMap();
  }
  if (gesture.kind === "join") {
    gesture.network = roadJoinDraft(draft.network, gesture.road, gesture.join, gesture.point);
    paintMap();
  } else if (gesture.kind === "curve" || gesture.kind === "segment") {
    paintMap();
    if (gesture.kind === "curve") {
      const graph = draft.network;
      const nodes = networkNodes(graph);
      const current = graph.roads[gesture.road];
      const road = { ...current, controls: curveHandleControls(current, graph, nodes, gesture.handle, gesture.point, curveAngles), bend: 0 };
      const readout = $("#network-curve-readout");
      if (readout) readout.textContent = curveReadout(laneAnchoredCurve(road, graph, nodes) ?? networkRoadGeometry(road, nodes));
    }
  } else updateRoadPreview();
});

for (const type of ["pointerup", "pointercancel"]) {
  map.addEventListener(type, event => {
    const gesture = freeDrag;
    if (gesture?.pointer !== event.pointerId) return;
    clearTimeout(terminalHold);
    freeDrag = undefined;
    if (gesture.held) {
      suppressHeldTouchClickUntil = performance.now() + 400;
      return;
    }
    if (type === "pointercancel") {
      paintMap();
      return;
    }
    if (gesture.kind === "segment") {
      const point = dragNetworkPoint(event, gesture);
      if (!gesture.moved && point === gesture.laneShift) return;
      suppressMapClick = true;
      applyLaneShift(point);
      render();
      return;
    }
    if (!gesture.moved) {
      if (gesture.ready) updateRoadPreview();
      return;
    }
    suppressMapClick = true;
    roadMessage = "";
    if (gesture.kind === "draw-road") {
      if (gesture.drawing && gesture.drawing !== drawing) {
        changeDrawing(gesture.drawing);
        if (drawing.points.at(-1)?.anchor) clearLaneFocus();
      }
    } else {
      const { id, kind } = gesture;
      const point = dragNetworkPoint(event, gesture);
      if (kind === "move") {
        const result = moveNetworkNode(draft.network, id, point, point.id, point.index === undefined ? undefined : point);
        roadMessage = result.issue ?? "";
        if (result.network) {
          editNetwork(result.network);
          freeNode = point.id ?? id;
        }
      } else if (kind === "curve") reshapeNetworkRoad(gesture.road, gesture.handle, point);
      else if (kind === "join") slideRoadJoin(gesture.road, gesture.join, point);
      else if (kind === "lane") shiftLaneEnd(gesture.end, point);
    }
    render();
  });
}

function slideRoadJoin(index, end, point) {
  const network = draft.network;
  const next = roadJoinDraft(network, index, end, point);
  const result = applyRoadJoin(network, next);
  roadMessage = result.issue ?? "";
  if (result.network) editNetwork(result.network);
}

function applyLaneShift(value) {
  const result = shiftNetworkRoad(draft.network, freeRoad, value);
  roadMessage = result.issue ?? "";
  if (result.network) editNetwork(result.network);
}

for (const type of ["contextmenu", "selectstart", "dragstart"]) {
  map.addEventListener(type, event => event.preventDefault());
}

map.addEventListener("pointerdown", event => {
  if (!draft.network || tool !== "junction" || junctionMode !== "draw" || erasing || view !== "design" || event.button !== 0) return;
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
  const { curveHandle, draftTangent, segmentShift, roadJoin, rampHandle } = event.target.dataset;
  if (draft.network && segmentShift !== undefined && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    applyLaneShift(clamp((draft.network.roads[freeRoad].laneShift ?? 0) + (event.key === "ArrowLeft" ? -1 : 1), -maxLaneShift, maxLaneShift));
    render();
    $("[data-segment-shift]")?.focus();
    return;
  }
  const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (rampHandle && nudge && rampDraft) {
    const point = ["a", "b"].includes(rampHandle) ? rampDraft[rampEndpoint(rampHandle)] :
      rampPreview?.handles?.[rampHandle === "bend" ? "middle" : rampHandle];
    if (!point) return;
    event.preventDefault();
    updateRampHandle(rampHandle, { x: point.x + nudge[0] * 6, y: point.y + nudge[1] * 6 }, rampDraft, point, rampPreview?.handles);
    render();
    map.querySelector(`[data-ramp-handle="${rampHandle}"]`)?.focus();
    return;
  }
  if (["a", "b"].includes(rampHandle) && ["Enter", " "].includes(event.key) && roadMode === "move") {
    event.preventDefault();
    rampReassign = rampReassign === rampHandle ? undefined : rampHandle;
    render();
    map.querySelector(`[data-ramp-handle="${rampHandle}"]`)?.focus();
    return;
  }
  if (draft.network && roadJoin && nudge) {
    event.preventDefault();
    const options = slideJoinOptions(draft.network, freeRoad, roadJoin);
    if (!options) return;
    slideRoadJoin(freeRoad, roadJoin, { x: options.node.x + nudge[0] * 5, y: options.node.y + nudge[1] * 5 });
    render();
    map.querySelector(`[data-road-join="${roadJoin}"]`)?.focus();
    return;
  }
  if (draft.network && draftTangent !== undefined && nudge && Number(draftTangent) > 0) {
    event.preventDefault();
    const index = Number(draftTangent);
    const point = drawing.points[index];
    const controls = drawingControls(drawing)[index - 1];
    const handle = drawing.handles[index];
    const bearing = Math.atan2(handle?.y ?? point.y - controls[3], handle?.x ?? point.x - controls[2]) +
      (nudge[0] || -nudge[1]) * Math.PI / 12;
    changeDrawing(changeTangent(drawing, index, { x: Math.cos(bearing) * 32, y: Math.sin(bearing) * 32 }));
    render();
    map.querySelector(`g[data-draft-tangent="${index}"]`)?.focus();
    return;
  }
  if (draft.network && curveHandle !== undefined && nudge) {
    event.preventDefault();
    const road = draft.network.roads[freeRoad];
    const nodes = networkNodes(draft.network);
    const { a, b } = laneAnchoredCurve(road, draft.network, nodes) ?? networkRoadGeometry(road, nodes);
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
    if (event.key === " " && networkTerminals(draft.network)[id]) {
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
    highlightWeaves = false;
  }
  view = next;
  if (next !== "design" && !currentRun && !sumoMessage) runDeviceSumo();
  render();
}

document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const { tool: nextTool, view: nextView, action, lane, rule, roadMode: nextRoadMode, roadPreset, roadCount, movement } = button.dataset;
  if (button.dataset.level) {
    playLevel(button.dataset.level);
  } else if (action === "choose-level") {
    openLevels();
  } else if (nextTool) {
    slipAnchor = undefined;
    tool = nextTool;
    if (nextTool === "road" && draft.road?.length === 0) roadMode = "draw";
    laneSelected = false;
    render();
  } else if (nextView) {
    if (nextView !== "design" && unfinishedRoadEdit()) {
      inspectorCollapsed = false;
      roadMessage = "Apply or cancel your draft before leaving Design.";
      render();
      $("#detail").textContent = roadMessage;
      return;
    }
    enterView(nextView);
  } else if (action === "toggle-inspector") {
    inspectorCollapsed = !inspectorCollapsed;
    render();
    $(".inspector-toggle").focus();
  } else if (action === "new-builder") {
    editNetwork(starterNetwork());
    startingDesign = levelStart(level.id);
    originalCache = undefined;
    clearNetworkSelection();
    tool = "road";
    roadMode = "select";
    roadMessage = "Starter layout loaded. Apply to save it.";
    $("#menu").click();
    enterView("design");
  } else if (nextRoadMode) {
    roadMode = nextRoadMode;
    roadStart = undefined;
    roadMessage = "";
    render();
  } else if (action === "mode-move") {
    const ramp = selectedRamp;
    const bounds = map.viewBox.baseVal;
    const currentCamera = [bounds.x, bounds.y, bounds.width, bounds.height];
    tool = "road";
    clearNetworkSelection();
    camera = currentCamera;
    roadMode = "move";
    if (ramp) startRampMove(ramp);
    roadMessage = "";
    render();
  } else if (action === "map-overview") {
    camera = undefined;
    render();
  } else if (action === "mode-draw" || action === "mode-select" || action === "draw-movements") {
    const draw = action !== "mode-select";
    const drawingMovements = action === "draw-movements" && (junctionMode !== "draw" || erasing);
    erasing = false;
    roadMessage = "";
    if (tool === "junction" && action !== "mode-draw") {
      buildingStructure = false;
      junctionMode = drawingMovements ? "draw" : "select";
      laneStart = selectedIncoming = selectedMovement = undefined;
    } else {
      const mode = draw ? "draw" : "select";
      if (tool === "junction") leaveIntersection();
      else if (roadMode !== mode) clearNetworkSelection();
      roadMode = mode;
    }
    render();
  } else if (button.dataset.drawShape) {
    if (drawShape === button.dataset.drawShape) return;
    const start = drawing.points[0];
    clearDrawing();
    if (start) drawing.points.push(start);
    drawShape = button.dataset.drawShape;
    roadMessage = "";
    render();
  } else if (button.dataset.rampPick !== undefined) {
    const { end, options } = rampPicker;
    acceptRampLane(options[Number(button.dataset.rampPick)], end);
    render();
    map.querySelector(`[data-ramp-handle="${end}"]`)?.focus({ preventScroll: true });
  } else if (action === "cancel-ramp-picker") {
    rampPicker = undefined;
    roadMessage = "";
    render();
  } else if (button.dataset.rampShape) {
    setRampDraft({ ...rampDraft, shape: button.dataset.rampShape, reach: undefined, direction: undefined });
    render();
    inspector.querySelector(`[data-ramp-shape="${rampDraft.shape}"]`)?.focus({ preventScroll: true });
  } else if (button.dataset.rampGradeButton !== undefined) {
    const grade = Number(button.dataset.rampGradeButton);
    setRampDraft({ ...(rampDraft ?? { ...draft.network.ramps[selectedRamp], replace: selectedRamp }), grade });
    render();
    inspector.querySelector(`[data-ramp-grade-button="${grade}"]`)?.focus({ preventScroll: true });
  } else if (button.dataset.rampReassign) {
    const end = button.dataset.rampReassign;
    rampReassign = rampReassign === end ? undefined : end;
    roadMessage = "";
    render();
    inspector.querySelector(`[data-ramp-reassign="${end}"]`)?.focus({ preventScroll: true });
  } else if (action === "ramp-flip") {
    setRampDraft({ ...rampDraft, direction: -(rampDraft.direction ?? 1) });
    render();
  } else if (action === "ramp-adjust-curve") {
    rampCurveHandles = !rampCurveHandles;
    render();
    $('[data-action="ramp-adjust-curve"]')?.focus({ preventScroll: true });
  } else if (action === "apply-ramp") {
    applyRamp();
    render();
  } else if (action === "cancel-ramp") {
    clearRampDraft();
    if (roadMode === "move") {
      freeRoad = draft.network.roads.findIndex(road => road.rampId === selectedRamp);
      roadMode = "select";
    }
    roadMessage = "";
    render();
  } else if (button.dataset.snapOption) {
    const option = button.dataset.snapOption;
    snapping[option] = !snapping[option];
    render();
    if (!event.detail) inspector.querySelector(`[data-snap-option="${option}"]`)?.focus();
  } else if (action === "cancel-drawing") {
    clearDrawing();
    roadMessage = "";
    render();
  } else if (action === "split-mode") {
    clearNetworkSelection();
    roadMode = roadMode === "split" ? "select" : "split";
    roadMessage = "";
    render();
  } else if (action === "curve-handles" || action === "move-segment") {
    freeCurve = action === "curve-handles" && !freeCurve;
    const road = draft.network.roads[freeRoad];
    curveAngles = freeCurve && !road.laneA && !road.laneB &&
      !Number.isFinite(networkRoadGeometry(road, networkNodes(draft.network)).radius);
    movingSegment = action === "move-segment" && !movingSegment;
    selectedLaneEnd = undefined;
    clearLaneFocus();
    roadMessage = "";
    render();
  } else if (action === "curve-angles") {
    curveAngles = !curveAngles;
    render();
  } else if (action === "move-lane-a" || action === "move-lane-b") {
    const end = action.at(-1);
    freeCurve = movingSegment = false;
    selectedLaneEnd = selectedLaneEnd === end ? undefined : end;
    if (selectedLaneEnd) focusLanePorts(draft.network.roads[freeRoad][end]);
    else clearLaneFocus();
    roadMessage = "";
    render();
  } else if (action === "start-lane-picker") {
    const id = drawing.points[0].id;
    clearDrawing();
    focusLanePorts(id);
    render();
  } else if (action === "end-lane-picker") {
    pickingEndLane = !pickingEndLane;
    roadMessage = pickingEndLane ? "Tap a destination junction to choose a lane." : "";
    render();
  } else if (action === "lane-overview") {
    clearLaneFocus();
    render();
  } else if (action === "move-free-node") {
    const node = freeNode;
    leaveIntersection();
    roadMode = "select";
    freeNode = node;
    roadMessage = "Drag the highlighted node to move its connected roads.";
    render();
    map.querySelector(`[data-free-node="${node}"]`)?.focus();
  } else if (action === "finish-lane") {
    clearDrawing();
    roadMessage = "";
    render();
  } else if (action === "network-undo" || action === "network-redo") {
    const isUndo = action === "network-undo";
    if (tool === "road" && roadMode === "draw" && (isUndo ? drawUndo.length : drawUndo.length || drawRedo.length)) {
      const [from, to] = isUndo ? [drawUndo, drawRedo] : [drawRedo, drawUndo];
      if (!from.length) return;
      to.push(drawing);
      drawing = from.pop();
    } else {
      const [from, to] = isUndo ? [networkUndo, networkRedo] : [networkRedo, networkUndo];
      if (!from.length) return;
      to.push(draft.network);
      draft.network = from.pop();
      persistNetwork();
      if (tool === "junction") {
        laneStart = selectedIncoming = selectedMovement = undefined;
        if (!draft.network.nodes.some(node => node.id === freeNode)) leaveIntersection();
      } else clearNetworkSelection();
    }
    roadMessage = "";
    render();
  } else if (action === "intersection-overview") {
    leaveIntersection();
    roadMode = "select";
    render();
  } else if (action === "junction-structures") {
    buildingStructure = !buildingStructure;
    crossingDraft = undefined;
    junctionMode = "select";
    laneStart = selectedIncoming = selectedMovement = undefined;
    roadMessage = "";
    render();
    inspector.querySelector(buildingStructure ? "[data-build-roundabout]" : '[data-action="junction-structures"]')?.focus({ preventScroll: true });
  } else if (button.dataset.crossing) {
    const [pair, grade] = button.dataset.crossing.split(":");
    const node = draft.network.nodes.find(item => item.id === freeNode);
    stageCrossing(node, pair, Number(grade));
    render();
    inspector.querySelector(`[data-crossing="${button.dataset.crossing}"]`)?.focus({ preventScroll: true });
  } else if (action === "cancel-crossing") {
    crossingDraft = undefined;
    render();
  } else if (action === "apply-crossing") {
    const { result, grade } = crossingDraft;
    if (!result.network || !grade) return;
    editNetwork(result.network);
    leaveIntersection();
    roadMode = "select";
    roadMessage = `${gradeName(grade)} built.`;
    render();
    $('[data-action="mode-select"]')?.focus({ preventScroll: true });
  } else if (button.dataset.buildRoundabout) {
    const choice = `[data-build-roundabout="${button.dataset.buildRoundabout}"]`;
    const result = buildNetworkRoundabout(draft.network, freeNode, Number(button.dataset.buildRoundabout));
    if (result.network) {
      editNetwork(result.network);
      leaveIntersection();
      roadMode = "select";
    }
    roadMessage = result.issue ?? "Roundabout built.";
    render();
    inspector.querySelector(result.issue ? choice : '[data-action="mode-select"]')?.focus({ preventScroll: true });
  } else if (button.dataset.segmentGrade !== undefined) {
    const grade = Number(button.dataset.segmentGrade);
    const result = setNetworkRoadGrade(draft.network, freeRoad, grade);
    if (result.network) {
      editNetwork(result.network);
      clearNetworkSelection();
    }
    roadMessage = result.issue ?? `${gradeName(grade)} road updated.`;
    render();
  } else if (button.dataset.intersectionControl) {
    const node = draft.network.nodes.find(item => item.id === freeNode);
    if (node.control !== button.dataset.intersectionControl) editJunctionNode({ control: button.dataset.intersectionControl });
    roadMessage = "";
    render();
  } else if (button.dataset.movementRule) {
    const node = draft.network.nodes.find(item => item.id === freeNode);
    const rule = button.dataset.movementRule;
    if (selectedIncoming) {
      const [, neighbor, lane] = selectedIncoming.split(":");
      const key = incomingLaneKey(neighbor, lane);
      const laneRules = { ...node.laneRules };
      if (rule === "default") delete laneRules[key];
      else laneRules[key] = rule;
      editJunctionNode({ control: "priority", laneRules: Object.keys(laneRules).length ? laneRules : undefined });
    } else if (selectedMovement) {
      const moves = junctionMovements(draft.network, node, false);
      editJunctionNode({ control: "priority", movements: moves.map(move => movementKey(move) === selectedMovement ? { ...move, rule } : move) });
    }
    render();
  } else if (["remove-movements", "reset-movements", "remove-selected-movement"].includes(action)) {
    const node = draft.network.nodes.find(item => item.id === freeNode);
    const movements = action === "reset-movements" ? undefined :
      action === "remove-movements" ? [] : junctionMovements(draft.network, node, false).filter(move => movementKey(move) !== selectedMovement);
    editJunctionNode({ movements });
    laneStart = selectedIncoming = selectedMovement = undefined;
    roadMessage = "";
    render();
  } else if (action === "eraser") {
    if (erasing) {
      const { map } = draft.network;
      editNetwork({ ...(map ? { map } : {}), nodes: [], roads: [] });
      clearNetworkSelection();
      tool = "road";
      roadMode = "draw";
      drawShape = "freeform";
      camera = undefined;
      roadMessage = "Roads cleared. Undo restores them.";
    } else {
      if (tool === "road") {
        clearNetworkSelection();
        roadMode = "select";
      } else laneStart = selectedIncoming = selectedMovement = undefined;
      erasing = true;
      roadMessage = "";
    }
    render();
    inspector.querySelector('[data-action="eraser"]:not(:disabled)')?.focus({ preventScroll: true });
  } else if (button.dataset.freeCount) {
    const [direction, delta] = button.dataset.freeCount.split(":");
    const segment = draft.network.roads[freeRoad];
    replaceFreeRoad({ [direction]: segment[direction] + Number(delta) });
    render();
  } else if (action === "reverse-road") {
    const { forward, backward } = draft.network.roads[freeRoad];
    replaceFreeRoad({ forward: backward, backward: forward });
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
    if (draft.network && drawingComplete()) {
      applyDrawing();
      if (drawing.points.length) {
        render();
        return;
      }
    }
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
  } else if (action === "highlight-weaves") {
    highlightWeaves = !highlightWeaves;
    render();
    $('[data-action="highlight-weaves"]')?.focus({ preventScroll: true });
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
inspector.addEventListener("change", event => {
  if (event.target.matches("[data-draw-grade]")) {
    drawGrade = Number(event.target.value);
    if (drawing.points.some(point => point.anchor || point.index !== undefined && roadGrade(draft.network.roads[point.index]) !== drawGrade)) clearDrawing();
    clearLaneFocus();
    roadMessage = "";
  } else if (event.target.matches("[data-lane-preset]")) {
    const [forward, backward] = event.target.value.split(":").map(Number);
    drawLanes = { forward, backward };
  } else return;
  render();
  if (event.target.matches("[data-draw-grade]")) inspector.querySelector("[data-draw-grade]")?.focus({ preventScroll: true });
});
inspector.addEventListener("toggle", event => {
  if (event.target.matches(".segment-options")) roadOptions = event.target.open;
}, true);
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
  const levelId = runDesign.network ? level.id : undefined;
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
        const comparison = readSumoComparison({ ...data, original: data.original ?? originalCache }, runDesign, levelId);
        original = originalCache = comparison.original;
        currentRun = comparison.edited;
        worker.terminate();
        sumoWorker = undefined;
        if (view !== "design") render();
      } catch (error) {
        fail(error);
      }
    };
    const request = sumoRequest(runDesign, levelId);
    if (originalCache && originalCache.results.finished + originalCache.results.waiting === request.trips.length) delete request.original;
    worker.postMessage(request);
  } catch (error) {
    fail(error);
  }
}

$("#reset").addEventListener("click", () => {
  history.push(design);
  design = draft.network ? levelStart(level.id) : { ...baseline };
  camera = undefined;
  invalidateRun();
  draft = { ...design };
  clearNetworkSelection();
  networkUndo.length = networkRedo.length = 0;
  tool = design.network ? "road" : "move";
  roadMode = design.network ? "move" : "select";
  roadMessage = "";
  save();
  $("#menu").click();
  enterView("design");
});

render();
if ("serviceWorker" in navigator) {
  const workerUrl = new URL("./sw.js", import.meta.url).href;
  let pageWorker = navigator.serviceWorker.controller;
  const updateOfflineStatus = () => {
    if (navigator.serviceWorker.controller?.scriptURL === workerUrl) {
      $("#offline").textContent = "Ready for offline play";
      $("#menu-offline").textContent = "Ready for offline play";
    }
  };
  $("#reload-update").addEventListener("click", () => {
    if (unfinishedRoadEdit() && !confirm("Reload and discard your unfinished road edit?")) return;
    location.reload();
  });
  $("#dismiss-update").addEventListener("click", () => { $("#update-ready").hidden = true; });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    updateOfflineStatus();
    const controller = navigator.serviceWorker.controller;
    if (pageWorker?.scriptURL === workerUrl && controller?.scriptURL === workerUrl && controller !== pageWorker) {
      $("#update-ready").hidden = false;
    }
    if (!pageWorker) pageWorker = controller;
  });
  navigator.serviceWorker.register(workerUrl, { updateViaCache: "none" }).then(registration => {
    updateOfflineStatus();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && navigator.onLine) registration.update().catch(() => {});
    });
  })
    .catch(() => { $("#offline").textContent = $("#menu-offline").textContent = "Offline setup unavailable"; });
} else $("#offline").textContent = $("#menu-offline").textContent = "Offline setup unavailable";
