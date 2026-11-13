import { baseline, world, curve, simulate, duration, step, validate, mergeEndBounds, mergeTaper, replayMarkers, scale, vehicleDimensions } from "./model.mjs";

const $ = selector => document.querySelector(selector);
const map = $("#map");
const inspector = $("#inspector");
const appPath = new URL(".", import.meta.url).pathname;
const storageKey = appPath.includes("/previews/")
  ? `traffic-manager.school-pickup.v1:${appPath}`
  : "traffic-manager.school-pickup.v1";
const original = simulate(baseline);
const history = [];
const icons = {
  move: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
  curve: '<path d="M5 18C15 18 8 6 19 6"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/>',
  lanes: '<path d="M6 21V4m-3 3 3-3 3 3m4 14v-7q0-7 8-7m-3-3 3 3-3 3"/>',
  design: '<path d="m3 9 9-5 9 5-9 5zm0 4 9 5 9-5M3 17l9 5 9-5"/>',
  replay: '<path d="m7 4 14 8-14 8z"/>',
  results: '<path d="M5 20v-7m7 7V4m7 16V9"/>'
};
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
let showingOriginal = false;
let previousFrame = 0;
let animationId;

function readSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (validate(saved)) return { ...saved, mergeEnd: mergeTaper(saved).end, exit: Math.min(saved.exit, world.start.y - saved.node) };
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
  <path d="M0 153H236V179H0Z M294 153H500V179H294Z" fill="#46525b"/>
  <path d="M0 166H228M302 166H500" stroke="#e6e9e5" stroke-width="1" stroke-dasharray="8 8"/>
  <path d="M252 180H289" stroke="#fff" stroke-width="2"/>
  <path d="M252 176H289" stroke="#fff" stroke-width="4" stroke-dasharray="2 4"/>
  <path d="M244 474l4-8h-8zm17-61 4 8h-8zm19 0 4 8h-8z" fill="#e6e9e5" opacity=".75"/>`;

function handleBounds(key) {
  if (key === "mergeEnd") return mergeEndBounds(draft.node);
  if (key === "node") return [275, 375];
  return key === "entry" ? [25, 125] : [20, Math.min(125, world.start.y - draft.node)];
}

function updateHandle(key, value) {
  draft[key] = Math.round(clamp(value, ...handleBounds(key)));
  if (key === "node") {
    draft.mergeEnd = clamp(draft.mergeEnd, ...mergeEndBounds(draft.node));
    draft.exit = clamp(draft.exit, ...handleBounds("exit"));
  }
}

function mergeLength(config) {
  return Math.round((config.node - config.mergeEnd) * scale);
}

function handle(kind, x, y, selected = true) {
  const names = { node: "Merge node", mergeEnd: "Merge lane end", entry: "Entry handle", exit: "Exit handle", source: "Pickup lane", outer: "Main lane", auxiliary: "Merge lane" };
  const lane = ["source", "outer", "auxiliary"].includes(kind);
  return `<g class="map-handle" data-handle="${kind}" transform="translate(${x} ${y})"
    role="${lane ? "button" : "slider"}" tabindex="0" aria-label="${names[kind]}"
    ${lane ? `aria-pressed="${selected}"` : `aria-valuemin="${handleBounds(kind)[0]}" aria-valuemax="${handleBounds(kind)[1]}" aria-valuenow="${draft[kind]}"`}>
    <circle r="23" fill="transparent"/>
    ${kind === "node" ? '<rect class="symbol" x="-8" y="-8" width="16" height="16" rx="3"/>' :
      kind === "mergeEnd" ? '<path class="symbol" d="M0-9 9 0 0 9-9 0Z"/>' : '<circle class="symbol" r="7"/>'}
  </g>`;
}

function paintMap() {
  const editing = view === "design";
  const config = editing ? draft : showingOriginal ? baseline : design;
  const primary = curve(config, 1);
  const secondary = curve(config, 2);
  const main = config.lanes & 1;
  const aux = config.lanes & 2;
  const selectedGeometry = main ? primary : secondary;
  const run = showingOriginal ? original : currentRun;
  const frame = run?.frames[Math.floor(time / step)];
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
  content += `<path d="M239 181v12" stroke="#263944" stroke-width="6" stroke-linecap="round"/>
    <circle cx="239" cy="185" r="2" fill="${frame?.green ? "#60717a" : "#ff987d"}"/>
    <circle cx="239" cy="190" r="2" fill="${frame?.green ? "#9ee6a2" : "#60717a"}"/>`;
  if (!editing && frame) {
    content += replayMarkers(run.frames, time).map(car => {
      const { length: metres, width } = vehicleDimensions(car.kind);
      const length = metres / scale;
      const halfWidth = width / scale / 2;
      const fill = car.reason ? "#ffc578" : car.kind === "bus" ? "#b9f8ff" : "#e4e9e4";
      return `<g transform="translate(${car.x} ${car.y}) rotate(${car.angle * 180 / Math.PI})"><title>${car.reason || (car.kind === "bus" ? "School bus" : "Moving")}</title>
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
          + handle("mergeEnd", world.outer, taper.end);
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
  const zoom = tool === "lanes" && view === "design" ? "145 145 340 476" : "0 0 500 700";
  map.setAttribute("viewBox", zoom);
  map.innerHTML = content;
}

const changed = () => Object.keys(baseline).some(key => design[key] !== draft[key]);
const metric = value => Math.round(value);
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function renderInspector() {
  if (view === "design") {
    const geometry = curve(draft, draft.lanes & 1 ? 1 : 2);
    const title = { move: "Move node", curve: "Adjust curve", lanes: "Connect lanes" }[tool];
    const detail = {
      move: draft.lanes & 2
        ? 'Drag the square to move the join, or the diamond to end the merge lane. <span id="merge-length"></span>'
        : "Drag the square along Alder Avenue.",
      curve: `<span id="curve-readout">Min radius ${metric(geometry.radius)} m · ${metric(geometry.speed * 3.6)} km/h</span> · Ends aligned`,
      lanes: laneSelected ? "Tap a receiving lane to toggle its connection." : "Tap the pickup lane to reveal its connections."
    }[tool];
    const choices = tool === "lanes" && laneSelected ? `<div class="row chips">
      <button data-lane="1" aria-pressed="${!!(draft.lanes & 1)}">Main lane</button>
      <button data-lane="2" aria-pressed="${!!(draft.lanes & 2)}">Merge lane</button>
    </div>` : "";
    inspector.innerHTML = `<h1>${title}</h1><p id="detail">${detail}</p>${choices}<div class="row actions">
      ${changed() ? '<button data-action="cancel">Cancel</button>' : `<button data-action="undo" ${history.length ? "" : "disabled"}>Undo</button>`}
      <button class="primary" data-action="apply" ${changed() ? "" : "disabled"}>Apply</button></div>`;
    updateGeometryReadouts();
  } else if (view === "replay") {
    inspector.innerHTML = `<div class="row spread"><h1>Traffic replay</h1><button data-action="original">${showingOriginal ? "Original" : "Your design"}</button></div>
      <div class="row"><button id="play" data-action="play">${playing ? "Pause" : "Play"}</button>
      <input id="scrub" type="range" min="0" max="${duration}" step="${step}" value="${time}" aria-label="Replay time">
      <span id="clock">${clock(time)}</span></div><p id="live"></p>`;
    updateReplayReadout();
  } else {
    const a = original.results;
    const b = currentRun.results;
    const rows = [
      ["Avg. bus delay", `${metric(a.busDelay)} s`, `${metric(b.busDelay)} s`],
      ["Longest queue", `${metric(a.longestQueue)} m`, `${metric(b.longestQueue)} m`],
      ["Trips completed", a.finished, b.finished],
      ["Trips unfinished", a.waiting, b.waiting]
    ];
    const summary = b.longestQueue < a.longestQueue && b.busDelay <= a.busDelay + .05 && b.waiting <= a.waiting
      ? "Goal met. The queue is shorter and buses are no slower."
      : "Shorten the queue without increasing bus delay or unfinished trips.";
    inspector.innerHTML = `<h1>School pickup results</h1><div class="metrics">
      <span></span><span class="muted">Original</span><span>Your design</span>
      ${rows.map(row => row.map(item => `<span>${item}</span>`).join("")).join("")}
      </div><p>${summary}</p>`;
  }
}

function render() {
  document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", button.dataset.view === view));
  document.querySelectorAll("[data-tool]").forEach(button => button.setAttribute("aria-pressed", button.dataset.tool === tool));
  $(".tools").hidden = view !== "design";
  paintMap();
  renderInspector();
}

function updateReplayReadout() {
  const run = showingOriginal ? original : currentRun;
  const frame = run.frames[Math.round(time / step)];
  $("#clock").textContent = clock(time);
  $("#scrub").value = time;
  $("#live").textContent = `${frame.finished} completed · ${metric(frame.longestQueue)} m longest queue`;
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
  if (view !== "design" || !target || tool === "lanes" || drag || event.button !== 0) return;
  const key = target.dataset.handle;
  drag = { key, start: mapPoint(event), id: event.pointerId, before: { ...draft } };
  map.setPointerCapture(event.pointerId);
});
map.addEventListener("pointermove", event => {
  if (!drag || drag.id !== event.pointerId) return;
  const p = mapPoint(event);
  const { key, start, before } = drag;
  const delta = key === "entry" ? start.x - p.x : p.y - start.y;
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
  if (length) length.textContent = `Merge lane ${mergeLength(draft)} m.`;
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
  if (!playing || view !== "replay") return;
  const elapsed = previousFrame ? (timestamp - previousFrame) / 1000 : 0;
  previousFrame = timestamp;
  time = Math.min(duration, time + elapsed * 6);
  paintMap();
  updateReplayReadout();
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
  if (next !== "design") currentRun = simulate(design);
  if (next === "replay" && view !== "replay") {
    time = 0;
    showingOriginal = false;
  }
  view = next;
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
  else if (action === "apply") {
    history.push(design);
    design = { ...draft };
    save();
    render();
  } else if (action === "undo" || action === "cancel") {
    if (action === "undo" && history.length) {
      design = history.pop();
      save();
    }
    draft = { ...design };
    render();
  } else if (action === "original") {
    showingOriginal = !showingOriginal;
    render();
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
  if (event.target.id !== "scrub") return;
  time = Number(event.target.value);
  paintMap();
  updateReplayReadout();
});

$("#menu").addEventListener("click", () => {
  const panel = $("#menu-panel");
  panel.hidden = !panel.hidden;
  $("#menu").setAttribute("aria-expanded", !panel.hidden);
});
$("#reset").addEventListener("click", () => {
  history.push(design);
  design = { ...baseline };
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
