import { readSumoComparison, sumoRequest } from "./sumo-export.mjs";
import { clearance } from "./sumo-network.mjs";
import { baseline, world, curve, duration, step, validate, greenBounds, mergeEndBounds, mergeTaper, normalizeDesign, replayMarkers, scale, signalCycle, taperLengthBounds, vehicleDimensions } from "./model.mjs";

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
  move: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
  curve: '<path d="M5 18C15 18 8 6 19 6"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/>',
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
let tool = "move";
let laneSelected = false;
let drag;
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

const trees = [[31,118],[44,142],[191,121],[211,151],[38,282],[66,299],[178,285],[207,267],
  [432,179],[457,192],[431,221],[451,230],[394,301],[423,310],[458,348],
  [186,375],[204,397],[153,426],[78,433],[40,470],[418,551],[449,569],[464,580],[54,552]];
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
  if (key === "mergeEnd") return mergeEndBounds(draft.node);
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
  draft.taperLength = clamp(draft.taperLength, ...taperLengthBounds(draft));
}

function mergeLength(config) {
  return Math.round((config.node - config.mergeEnd) * scale);
}

function handle(kind, x, y, selected = true) {
  const names = { node: "Merge node", mergeEnd: "Merge lane end", taperLength: "Taper start", entry: "Entry handle", exit: "Exit handle", source: "Pickup lane", outer: "Main lane", auxiliary: "Merge lane" };
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
  let content = scenery + avenue;
  const taper = mergeTaper(config);
  if (aux) {
    content += `<path d="${taper.path}" fill="none" stroke="#46525b" stroke-width="20"/>
      <path d="M291 ${config.node}V${taper.start}" stroke="#e6e9e5" stroke-width="1" stroke-dasharray="7 7"/>`;
  }
  content += `<path d="${selectedGeometry.path}" fill="none" stroke="#e9e7d8" stroke-width="23"/>
    <path d="${selectedGeometry.path}" fill="none" stroke="#46525b" stroke-width="19"/>
    <path d="${selectedGeometry.path}" fill="none" stroke="#f3e6bb" stroke-width="1" stroke-dasharray="8 9" opacity=".7"/>`;
  if (main && aux) {
    content += `<path d="${secondary.path}" fill="none" stroke="#46525b" stroke-width="17"/>`;
  }
  const phase = frame?.phase ?? "all-red";
  const light = (road, x, y) => {
    const color = phase === road ? "#9ee6a2" : phase === road + "-yellow" ? "#ffca74" : "#ff987d";
    return `<circle cx="${x}" cy="${y}" r="5" fill="#263944"/><circle cx="${x}" cy="${y}" r="2.8" fill="${color}"/>`;
  };
  content += light("avenue", 245, 197) + light("cross", 229, 172);
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
  if (editing) {
    const { start, a, b, end, path } = selectedGeometry;
    if (tool === "move") {
      const old = curve(design, design.lanes & 1 ? 1 : 2);
      content += `<path d="M${end.x} 275V375" stroke="#c4f8ff" opacity=".5" stroke-dasharray="3 5"/>
        <path d="${old.path}" fill="none" stroke="#fbfffc" opacity=".7" stroke-dasharray="4 4"/>
        <path d="${path}" fill="none" stroke="#c4f8ff" stroke-width="3"/>` + handle("node", end.x, end.y);
      if (aux) {
        const [min, max] = mergeEndBounds(config.node);
        content += `<path d="M${world.outer} ${min}V${max}" fill="none" stroke="#c4f8ff" opacity=".55" stroke-dasharray="3 4"/>
          <path d="${taper.path}" fill="none" stroke="#c4f8ff" stroke-width="2" stroke-dasharray="7 4"/>`
          + handle("mergeEnd", world.outer, taper.end) + `<path d="M${world.auxiliary} ${taper.start}h26" stroke="#c4f8ff" stroke-width="1.5"/>`
          + handle("taperLength", world.auxiliary + 26, taper.start);
      }
    }
    if (tool === "curve") {
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
  return content;
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
    const bounds = highlightQueues ? queueViewBox(editedFrame) : comparisonViewBox;
    $("#original-map").setAttribute("viewBox", bounds);
    $("#design-map").setAttribute("viewBox", bounds);
    $("#original-map").innerHTML = mapMarkup(baseline, original, false);
    $("#design-map").innerHTML = mapMarkup(design, currentRun, false);
  } else {
    map.setAttribute("viewBox", editing && tool === "lanes" ? "145 145 340 476" : "0 0 500 700");
    map.innerHTML = mapMarkup(editing ? draft : design, editing ? undefined : currentRun, editing);
  }
}

const changed = () => Object.keys(baseline).some(key => design[key] !== draft[key]);
const metric = value => Math.round(value);
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function renderInspector() {
  if (view === "design") {
    const geometry = curve(draft, draft.lanes & 1 ? 1 : 2);
    const title = { move: "Move node", curve: "Adjust curve", lanes: "Connect lanes", signal: "Signal timing" }[tool];
    const detail = {
      move: draft.lanes & 2
        ? 'Square moves the join. Diamond ends the lane. Triangle starts the taper. <span id="merge-length"></span>'
        : "Drag the square along Alder Avenue.",
      curve: `<span id="curve-readout">Min radius ${metric(geometry.radius)} m · ${metric(geometry.speed * 3.6)} km/h</span> · Ends aligned`,
      signal: `Split the ${signalCycle}-second cycle between Alder Avenue and the cross street.`,
      lanes: laneSelected ? "Tap a receiving lane to toggle its connection." : "Tap the pickup lane to reveal its connections."
    }[tool];
    const choices = tool === "lanes" && laneSelected ? `<div class="row chips">
      <button data-lane="1" aria-pressed="${!!(draft.lanes & 1)}">Main lane</button>
      <button data-lane="2" aria-pressed="${!!(draft.lanes & 2)}">Merge lane</button>
    </div>` : "";
    const timing = tool === "signal" ? `<div class="row spread timing"><label for="green">Alder green</label>
      <input id="green" type="range" min="${greenBounds[0]}" max="${greenBounds[1]}" value="${draft.green}"/>
      <output id="green-time" for="green"></output></div>
      <p id="cross-time"></p>` : "";
    inspector.innerHTML = `<h1>${title}</h1><p id="detail">${detail}</p>${choices}${timing}<div class="row actions">
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
      ["Collisions", a.collisions, b.collisions, "", 1]
    ];
    const goal = b.collisions === 0 && metric(b.longestQueue) < metric(a.longestQueue) &&
      metric(b.busDelay) <= metric(a.busDelay) && metric(b.crossDelay) <= metric(a.crossDelay) &&
      b.finished >= a.finished && b.pickupFinished >= a.pickupFinished && b.crossFinished >= a.crossFinished;
    const summary = goal ? "Goal met. You shortened the peak queue and protected service on both roads."
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
    $("#detail").textContent = "Keep at least one lane connected.";
    return;
  }
  draft.lanes ^= bit;
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

map.addEventListener("pointerdown", event => {
  const target = event.target.closest("[data-handle]");
  if (view !== "design" || !target || tool === "lanes" || tool === "signal" || drag || event.button !== 0) return;
  const key = target.dataset.handle;
  drag = { key, start: mapPoint(event), id: event.pointerId, before: { ...draft } };
  map.setPointerCapture(event.pointerId);
});
map.addEventListener("pointermove", event => {
  if (!drag || drag.id !== event.pointerId) return;
  const p = mapPoint(event);
  const { key, start, before } = drag;
  const delta = key === "entry" ? start.x - p.x : p.y - start.y;
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
map.addEventListener("click", event => {
  if (tool === "lanes") selectLaneTarget(event.target.closest("[data-handle]")?.dataset.handle);
});
map.addEventListener("keydown", event => {
  const key = event.target.dataset.handle;
  if (!key) return;
  if (tool === "lanes") {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      selectLaneTarget(key);
      map.querySelector(`[data-handle="${key}"]`)?.focus();
    }
    return;
  }
  const direction = key === "entry" ? { ArrowLeft: 1, ArrowRight: -1 } : { ArrowUp: -1, ArrowDown: 1 };
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
  const { tool: nextTool, view: nextView, action, lane } = button.dataset;
  if (nextTool) {
    tool = nextTool;
    laneSelected = false;
    render();
  } else if (nextView) {
    if (changed() && nextView !== "design") {
      $("#detail").textContent = "Apply or cancel your draft before leaving Design.";
      return;
    }
    enterView(nextView);
  } else if (lane) toggleLane(Number(lane));
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
  if (event.target.id === "green") {
    draft.green = Number(event.target.value);
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
    if (originalCache) delete request.original;
    worker.postMessage(request);
  } catch (error) {
    fail(error);
  }
}

$("#reset").addEventListener("click", () => {
  history.push(design);
  design = { ...baseline };
  invalidateRun();
  draft = { ...design };
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
