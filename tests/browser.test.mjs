import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { sumoRequest } from "../sumo-export.mjs";
import { baseline } from "../model.mjs";
import { after } from "node:test";

const url = "http://127.0.0.1:4183";
const server = spawn("python3", ["-m", "http.server", "4183", "--bind", "127.0.0.1"], { stdio: "ignore" });
after(() => server.kill());
const waitForServer = async () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* The server may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Local test server did not start");
};

test("edit, simulate, compare, and reopen offline at both mobile sizes", { timeout: 115000 }, async () => {
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    await mkdir("test-results", { recursive: true });
    for (const viewport of [{ width: 669, height: 951 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.setDefaultTimeout(4500);
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(saved => {
        if (localStorage.getItem("traffic-manager.school-pickup.v1") === null) {
          localStorage.setItem("traffic-manager.school-pickup.v1", JSON.stringify(saved));
        }
      }, baseline);
      await page.goto(url);
      await page.reload();
      assert.equal(await page.locator("#map text").filter({ hasText: /Alder Avenue/ }).count(), 0);
      const cdp = await context.newCDPSession(page);
      const clickLocator = locator => locator.click();
      const click = name => clickLocator(page.getByRole("button", { name, exact: true }));
      const drag = async (name, dx, dy) => {
        const box = await page.getByRole("slider", { name }).boundingBox();
        const x = Math.round(box.x + box.width / 2);
        const y = Math.round(box.y + box.height / 2);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };
      await drag("Merge node", 0, 32);
      assert.equal(await page.getByRole("button", { name: "Apply" }).isEnabled(), true);
      await click("Apply");
      await click("Undo");
      assert.equal(await page.getByRole("slider", { name: "Merge node" }).getAttribute("aria-valuenow"), "310");
      await click("Adjust curve");
      const originalReadout = await page.locator("#curve-readout").textContent();
      await drag("Entry handle", 30, 0);
      assert.notEqual(await page.locator("#curve-readout").textContent(), originalReadout);
      await page.screenshot({ path: `test-results/curve-${viewport.width}.png` });
      await click("Cancel");
      assert.equal(await page.locator("#curve-readout").textContent(), originalReadout);
      await click("Connect lanes");
      await click("Pickup lane");
      await clickLocator(page.locator('[data-handle="outer"]'));
      assert.match(await page.locator("#detail").textContent(), /Keep at least one/);
      await clickLocator(page.locator('[data-handle="auxiliary"]'));
      await clickLocator(page.locator('[data-handle="outer"]'));
      await click("Apply");
      await page.screenshot({ path: `test-results/lanes-${viewport.width}.png` });
      await click("Move node");
      const endHandle = page.getByRole("slider", { name: "Merge lane end" });
      const startLength = await page.locator("#merge-length").textContent();
      await drag("Merge lane end", 0, 23);
      const shorterEnd = Number(await endHandle.getAttribute("aria-valuenow"));
      assert.ok(shorterEnd > 224);
      assert.notEqual(await page.locator("#merge-length").textContent(), startLength);
      await page.screenshot({ path: `test-results/merge-end-${viewport.width}.png` });
      await click("Cancel");
      assert.equal(await endHandle.getAttribute("aria-valuenow"), "224");
      await drag("Merge lane end", 0, 23);
      await click("Apply");
      await click("Undo");
      assert.equal(await endHandle.getAttribute("aria-valuenow"), "224");
      await drag("Merge lane end", 0, 23);
      await click("Apply");
      const taperStart = page.getByRole("slider", { name: "Taper start" });
      const beforeTaper = Number(await taperStart.getAttribute("aria-valuenow"));
      await drag("Taper start", 0, 16);
      assert.ok(Number(await taperStart.getAttribute("aria-valuenow")) > beforeTaper);
      assert.equal(await endHandle.getAttribute("aria-valuenow"), String(shorterEnd));
      await click("Apply");
      await click("Signal timing");
      const green = page.getByRole("slider", { name: "Alder green" });
      await green.press("End");
      await page.screenshot({ path: `test-results/signal-${viewport.width}.png` });
      assert.equal(await page.locator("#green-time").textContent(), "26 s");
      assert.match(await page.locator("#cross-time").textContent(), /4 s green/);
      await click("Cancel");
      assert.equal(await green.inputValue(), "21");
      await green.press("End");
      await click("Draw slip lane");
      await click("Junctions");
      assert.equal(await page.getByRole("button", { name: "Slip lane merge node" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Right turn allowed" }).count(), 0);
      await click("Draw slip lane");
      await click("Set slip lane start");
      await click("Set slip lane end");
      const slipEnd = page.getByRole("slider", { name: "Slip lane end", exact: true });
      const firstEnd = Number(await slipEnd.getAttribute("aria-valuenow"));
      await drag("Slip lane end", 12, 0);
      const drawnEnd = Number(await slipEnd.getAttribute("aria-valuenow"));
      assert.ok(drawnEnd > firstEnd);
      await click("Junctions");
      await click("Slip lane start node");
      assert.match(await page.locator("#detail").textContent(), /splits/);
      await click("Slip lane merge node");
      const slipYield = page.getByRole("button", { name: "Slip lane yields", exact: true });
      assert.equal(await slipYield.getAttribute("aria-pressed"), "true");
      await slipYield.click();
      assert.equal(await slipYield.getAttribute("aria-pressed"), "false");
      await slipYield.click();
      await click("Pickup junction node");
      assert.equal(await page.getByRole("button", { name: "Merge lane yields" }).count(), 0);
      await click("Merge lane end node");
      await click("Merge lane yields");
      await click("Alder signal node");
      await click("Right turn allowed");
      assert.equal(await green.inputValue(), "26");
      await click("School access node");
      const rightTurn = page.getByRole("button", { name: "Right turn allowed", exact: true });
      assert.equal(await rightTurn.getAttribute("aria-pressed"), "true");
      await rightTurn.click();
      await page.screenshot({ path: `test-results/junction-${viewport.width}.png` });
      await click("Test design");
      await page.getByText("Eclipse SUMO", { exact: true }).waitFor({ timeout: 20000 });
      assert.equal(await page.getByRole("button", { name: "Run on-device SUMO" }).count(), 0);
      await click("Play");
      await page.waitForFunction(() => Number(document.querySelector("#scrub").value) > 1);
      await click("Pause");
      const comparison = page.getByRole("region", { name: "Simulation comparison" });
      assert.equal(await comparison.isVisible(), true);
      assert.equal(await page.getByLabel("Original simulation map").isVisible(), true);
      assert.equal(await page.getByLabel("Your design simulation map").isVisible(), true);
      const paused = await page.locator("#scrub").inputValue();
      await click("Compare");
      assert.equal(await comparison.isVisible(), false);
      await click("Compare");
      assert.equal(await page.locator("#scrub").inputValue(), paused);
      await click("Worst backup");
      assert.ok(Number(await page.locator("#scrub").inputValue()) > 0);
      assert.ok(await page.locator('#design-map rect[stroke="#ffab49"]').count() > 0);
      await page.getByRole("slider", { name: "Simulation time" }).press("End");
      assert.equal(await page.locator("#clock").textContent(), "3:30");
      await page.screenshot({ path: `test-results/simulate-${viewport.width}.png` });
      await click("Results");
      const results = await page.locator(".metrics").textContent();
      assert.match(results, /Cross-street delay/);
      assert.match(results, /Pickup trips/);
      assert.match(results, /Slip lane trips/);
      assert.match(results, /Trips with no route/);
      assert.ok(await page.locator(".metrics .gain").count() > 0);
      assert.ok(await page.locator(".metrics .loss").count() > 0);
      await click("See peak queue");
      await page.getByRole("button", { name: "Worst backup", exact: true }).waitFor();
      assert.match(await page.locator("#live").textContent(), /Alder Avenue|Cross street|Pickup loop|Merge lane|Slip lane|Junction/);
      await click("Menu");
      await page.getByText("Ready for offline play", { exact: true }).waitFor();
      await context.setOffline(true);
      await page.reload();
      assert.equal(await endHandle.getAttribute("aria-valuenow"), String(shorterEnd));
      await click("Draw slip lane");
      assert.equal(await slipEnd.getAttribute("aria-valuenow"), String(drawnEnd));

      await click("Remove slip lane");
      await click("Junctions");
      assert.equal(await page.getByRole("button", { name: "Slip lane merge node" }).count(), 0);
      await click("Cancel");
      await click("Alder signal node");
      assert.equal(await page.getByRole("button", { name: "Right turn allowed" }).getAttribute("aria-pressed"), "false");
      await click("Draw slip lane");
      assert.equal(await slipEnd.getAttribute("aria-valuenow"), String(drawnEnd));
      await click("Signal timing");
      assert.equal(await green.inputValue(), "26");
      await click("Results");
      await page.locator(".metrics").waitFor({ timeout: 20000 });
      assert.equal(await page.locator(".metrics").textContent(), results);
      await page.screenshot({ path: `test-results/results-${viewport.width}.png` });
      if (viewport.width === 669 && process.env.TRAFFIC_TEST_SUMO === "1") {
        const requestPath = "test-results/sumo-request.json";
        const resultsPath = "test-results/sumo-results.json";
        const design = await page.evaluate(() => JSON.parse(localStorage.getItem("traffic-manager.school-pickup.v1")));
        const request = sumoRequest(design);
        await writeFile(requestPath, JSON.stringify(request));
        const result = spawnSync(process.execPath, ["scripts/run-sumo.mjs", requestPath, resultsPath], { encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        const native = JSON.parse(await readFile(resultsPath, "utf8"));
        const wasm = await page.evaluate(input => new Promise((resolve, reject) => {
          const worker = new Worker("./sumo-worker.mjs", { type: "module" });
          worker.onmessage = event => {
            worker.terminate();
            resolve(event.data);
          };
          worker.onerror = reject;
          worker.postMessage(input);
        }), request);
        assert.equal(wasm.error, undefined);
        for (const side of ["original", "edited"]) {
          assert.deepEqual(wasm[side].results, native[side].results);
          assert.deepEqual(wasm[side].signals.map(signal => signal.switches), native[side].signals.map(signal => signal.switches));
          assert.equal(wasm[side].results.collisions, 0);
          assert.equal(wasm[side].frames.length, native[side].frames.length);
          for (const [index, frame] of wasm[side].frames.entries()) {
            const { markers, ...stats } = frame;
            const { markers: reference, ...nativeStats } = native[side].frames[index];
            assert.deepEqual(stats, nativeStats);
            assert.equal(markers.length, reference.length);
            for (const [i, marker] of markers.entries()) {
              const { x, y, angle, ...vehicle } = marker;
              const { x: nx, y: ny, angle: na, ...nativeVehicle } = reference[i];
              assert.deepEqual(vehicle, nativeVehicle);
              assert.ok(Math.hypot(x - nx, y - ny) < .001 && Math.abs(angle - na) < .0001,
                `${side} frame ${index}, vehicle ${marker.id}: ${x},${y},${angle} vs ${nx},${ny},${na}`);
            }
          }
        }
      }
      await click("Menu");
      await click("Restore original design");
      await click("Results");
      await page.locator(".metrics").waitFor({ timeout: 20000 });
      assert.equal(await page.locator(".metrics .gain, .metrics .loss").count(), 0);
      if (viewport.width === 390) {
        await click("Design");
        await click("Road Builder");
        await click("Clear avenue");
        assert.equal(await page.locator("[data-road-segment]").count(), 0);
        assert.deepEqual(await page.locator("[data-road-node]").evaluateAll(nodes => nodes.map(node => node.dataset.roadNode)), ["90", "590"]);
        await click("Minimize design panel");
        assert.equal(await page.getByRole("button", { name: "Clear avenue" }).count(), 0);
        await click("Expand design panel");
        assert.equal(await page.getByRole("button", { name: "Clear avenue" }).count(), 1);
        const terminal = async name => {
          const box = await page.getByRole("button", { name, exact: true }).boundingBox();
          return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
        };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [await terminal("South connection")] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [await terminal("North connection")] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await click("2 lanes ↕");
        await click("Add node");
        const full = page.getByRole("button", { name: "Segment 90 to 590" });
        await full.press("Enter");
        assert.equal(await page.locator("[data-road-segment]").count(), 2);
        await click("3 lanes ↕");
        await click("Add northbound lane");
        await click("Increase northbound lanes");
        await page.getByRole("slider", { name: "Curve" }).press("ArrowRight");
        await page.screenshot({ path: "test-results/road-builder-390.png" });
        await click("Apply");
        const design = await page.evaluate(() => JSON.parse(localStorage.getItem("traffic-manager.school-pickup.v1")));
        assert.equal(design.road[0].north, 1);
        assert.equal(design.lanes, 0);
        assert.equal(design.schoolAccess, false);
        assert.equal(design.slipStart, 0);
        assert.equal(design.road[1].north, 4);
        assert.equal(design.road[1].south, 1);
        assert.equal(design.road[1].bend, 1);
        await click("Test design");
        await page.getByText("Eclipse SUMO", { exact: true }).waitFor({ timeout: 25000 });
        await page.reload();
        await click("Road Builder");
        assert.equal(await page.locator("[data-road-segment]").count(), 2);
        // Match the layout where both ramps attach to a widened middle segment.
        await page.evaluate(() => {
          const key = "traffic-manager.school-pickup.v1";
          const design = JSON.parse(localStorage.getItem(key));
          localStorage.setItem(key, JSON.stringify({ ...design, lanes: 1, slipStart: 220, slipEnd: 378,
            road: [
              { top: 90, bottom: 220, north: 1, south: 1, bend: 0 },
              { top: 220, bottom: 310, north: 3, south: 1, bend: 0 },
              { top: 310, bottom: 590, north: 1, south: 1, bend: 0 }
            ]
          }));
        });
        await page.reload();
        const dragToOuterLane = async (name, tool) => {
          await click(tool);
          const handle = page.getByRole("slider", { name, exact: true });
          const start = await handle.getAttribute("aria-valuenow");
          const width = await page.locator("#map").evaluate(svg => svg.getScreenCTM().a);
          await drag(name, width * 38, 4);
          assert.equal(await handle.getAttribute("aria-valuenow"), start);
          assert.match(await handle.getAttribute("transform"), /^translate\(318 /);
        };
        await click("Minimize design panel");
        const map = page.locator("#map");
        const viewBox = async () => (await map.getAttribute("viewBox")).split(" ").map(Number);
        const beforeCamera = await viewBox();
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 80, y: 390, id: 1 }, { x: 180, y: 390, id: 2 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 70, y: 420, id: 1 }, { x: 210, y: 420, id: 2 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        const afterCamera = await viewBox();
        assert.ok(afterCamera[2] < beforeCamera[2]);
        assert.notEqual(afterCamera[1], beforeCamera[1]);
        await click("Expand design panel");
        await page.reload();
        await dragToOuterLane("Slip lane start", "Draw slip lane");
        await dragToOuterLane("Merge node", "Move node");
        await click("Apply");
        const attached = await page.evaluate(() => JSON.parse(localStorage.getItem("traffic-manager.school-pickup.v1")));
        assert.equal(attached.slipLane, 3);
        assert.equal(attached.pickupLane, 3);
        await click("Test design");
        await page.getByText("Eclipse SUMO", { exact: true }).waitFor({ timeout: 25000 });

      }
      if (viewport.width === 390) {
        await click("Design");
        await click("Road Builder");
        await click("Menu");
        await click("Try new Road Builder");
        await click("Apply");
        await click("Eraser");
        await click("Delete all roads");
        assert.equal(await page.locator("[data-free-node]").count(), 6);
        assert.equal(await page.locator("[data-road-node], [data-handle]").count(), 0);
        const southNode = page.getByRole("button", { name: "South connection", exact: true });
        const southLabel = southNode.locator("text");
        const south = await southLabel.boundingBox();
        assert.deepEqual(await southLabel.evaluate(label => ({
          selectable: getComputedStyle(label).userSelect,
          pointerEvents: getComputedStyle(label).pointerEvents,
          nativeMenu: label.dispatchEvent(new Event("contextmenu", { bubbles: true, cancelable: true })),
          nativeSelection: label.dispatchEvent(new Event("selectstart", { bubbles: true, cancelable: true }))
        })), { selectable: "none", pointerEvents: "none", nativeMenu: false, nativeSelection: false });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart",
          touchPoints: [{ x: south.x + south.width / 2, y: south.y + south.height / 2 }] });
        await page.getByText("From South", { exact: true }).waitFor();
        assert.match(await page.locator(".terminal-demand").textContent(), /School access · 4 trips/);
        assert.equal(await page.locator("[data-demand-layer] path").count(), 3);
        assert.equal(await page.evaluate(() => window.getSelection().toString()), "");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        assert.ok(await page.getByText("From South", { exact: true }).isVisible());
        assert.equal(await page.locator('[data-action="mode-draw"]').getAttribute("aria-pressed"), "true");
        await page.screenshot({ path: "test-results/clean-slate-demand.png" });
        await click("School access connection");
        const mapTap = async (x, y) => {
          const point = await page.locator("#map").evaluate((map, { x, y }) =>
            new DOMPoint(x, y).matrixTransform(map.getScreenCTM()).toJSON(), { x, y });
          await page.touchscreen.tap(point.x, point.y);
        };
        await mapTap(172, 180);
        await click("Apply");
        assert.match(await page.locator("#detail").textContent(), /cross the school/);
        assert.equal(await page.locator("[data-free-node]").count(), 6);
        await click("Cancel");
        await click("Straight");
        await click("School access connection");
        await mapTap(270, 327);
        await click("Apply");
        assert.equal(await page.locator("[data-free-node]").count(), 7, await page.locator("#detail").textContent());
        const drawBetween = async (start, end) => {
          await click(start);
          await click(end);
          await click("Apply");
        };
        await drawBetween("Junction 1", "South connection");
        await drawBetween("Junction 1", "North connection");
        await drawBetween("West connection", "East connection");
        assert.equal(await page.locator("[data-free-node]").count(), 8);
        await drawBetween("Junction 1", "Pickup loop connection");
        await click("Select");
        await click("Junction 2");
        await click("Signal");
        assert.equal(await page.getByRole("button", { name: "Signal", exact: true }).getAttribute("aria-pressed"), "true");
        await click("All-way stop");
        await click("All-way yield");
        await page.locator('[data-lane-port="in:west:0"]').press("Enter");
        await click("Stop lane");
        await click("Map overview");
        await click("Junction 1");
        await page.locator('[data-lane-port="in:school:0"]').press("Enter");
        await click("Yield lane");
        await page.screenshot({ path: "test-results/clean-slate-network.png" });
        await click("Simulate");
        await page.getByText("Eclipse SUMO", { exact: true }).waitFor({ timeout: 25000 });
        await click("Results");
        assert.equal(await page.getByText("Trips with no route", { exact: true }).count(), 0);
        await page.reload();
        assert.equal(await page.locator("[data-free-node]").count(), 8);
        await click("Junction 2");
        await page.locator('[data-lane-port="in:west:0"]').press("Enter");
        assert.equal(await page.getByRole("button", { name: "Stop lane", exact: true }).getAttribute("aria-pressed"), "true");
      }
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth), false);
      await context.close();
    }
  } finally {
    await browser?.close();
  }
});

test("the unified Road Builder supports touch edits and offline simulation", { timeout: 60000 }, async () => {
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(4500);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    const click = name => page.getByRole("button", { name, exact: true }).click();
    const toolbar = name => page.locator(".builder-tools").getByRole("button", { name, exact: true });
    const mapPoint = (x, y) => page.locator("#map").evaluate((map, [x, y]) =>
      new DOMPoint(x, y).matrixTransform(map.getScreenCTM()).toJSON(), [x, y]);
    const tap = async (x, y) => {
      const point = await mapPoint(x, y);
      await page.touchscreen.tap(point.x, point.y);
    };
    const cdp = await context.newCDPSession(page);
    const drag = async (x1, y1, x2, y2) => {
      const a = await mapPoint(x1, y1), b = await mapPoint(x2, y2);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: b.x, y: b.y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const position = async selector => {
      const circle = page.locator(selector);
      return [Number(await circle.getAttribute("cx")), Number(await circle.getAttribute("cy"))];
    };
    await page.getByRole("heading", { name: "Road Builder" }).waitFor();
    assert.equal(await page.locator(".tools").isVisible(), false);
    assert.equal(await page.getByRole("button", { name: "Adjust curve", exact: true }).count(), 0);
    await tap(270, 250);
    assert.equal(await page.locator(".segment-lanes svg").count(), 4);
    await page.screenshot({ path: "test-results/unified-lane-cards.png" });
    await click("Add lane right");
    assert.match(await page.locator(".segment-layout").textContent(), /1 left, 2 right/);
    await toolbar("Undo").click();
    await toolbar("Redo").click();
    await tap(270, 250);
    assert.match(await page.locator(".segment-layout").textContent(), /1 left, 2 right/);
    await click("Flip asymmetry");
    assert.match(await page.locator(".segment-layout").textContent(), /2 left, 1 right/);
    await click("Flip asymmetry");
    await click("Move segment");
    const segmentHandle = page.getByRole("slider", { name: "Segment lane position" });
    await segmentHandle.press("ArrowRight");
    assert.equal(await segmentHandle.getAttribute("aria-valuenow"), "1");
    await segmentHandle.press("ArrowLeft");
    assert.equal(await segmentHandle.getAttribute("aria-valuenow"), "0");
    await click("Adjust curve");
    const handle = '[data-curve-handle="0"] circle:last-child';
    const [hx, hy] = await position(handle);
    await drag(hx, hy, hx + 19, hy + 8);
    assert.ok((await position(handle))[0] > hx + 10);
    await page.screenshot({ path: "test-results/unified-curve.png" });
    await click("Adjust curve");
    assert.equal(await page.locator("[data-curve-handle]").count(), 0);
    await page.getByLabel("Segment options", { exact: true }).click();
    await click("Add node");
    await tap(235, 300);
    await page.locator('[data-free-node="j3"]').waitFor();
    await toolbar("Draw").click();
    await click("Snap to roads");
    await toolbar("Select").click();
    await drag(235, 300, 245, 318);
    let [nx, ny] = await position('[data-free-node="j3"] circle:last-of-type');
    assert.ok(Math.abs(nx - 245) <= 2 && Math.abs(ny - 318) <= 2);
    await toolbar("Draw").click();
    await click("Snap to grid");
    await toolbar("Select").click();
    await drag(nx, ny, 235, 346);
    assert.deepEqual(await position('[data-free-node="j3"] circle:last-of-type'), [240, 340]);
    await toolbar("Draw").click();
    await click("Snap to roads");
    await toolbar("Select").click();
    await drag(240, 340, 268, 359);
    [nx, ny] = await position('[data-free-node="j3"] circle:last-of-type');
    assert.equal(nx, 270);
    assert.ok(Math.abs(ny - 359) <= 3);
    await toolbar("Draw").click();
    await page.getByLabel("Lane layout").selectOption("1:0");
    await click("Snap to grid");
    await click("Snap to angle");
    await page.screenshot({ path: "test-results/unified-draw.png" });
    await click("Minimize design panel");
    await drag(448, 440, 370, 362);
    await click("Expand design panel");
    await click("Apply");
    assert.equal(await page.locator("[data-free-node]").count(), 10, await page.locator("#detail").textContent());
    await toolbar("Select").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("traffic-manager.school-pickup.v1")));
    const oneWay = saved.network.roads.find(road => road.a === "pickup" && road.b !== "j2" && road.backward === 0);
    assert.ok(oneWay);
    const endpoint = saved.network.nodes.find(node => node.id === oneWay.b);
    assert.equal(448 - endpoint.x, 440 - endpoint.y);
    assert.equal(oneWay.bend, 0);
    assert.equal(oneWay.controls, undefined);
    await click("Menu");
    await page.getByText("Ready for offline play", { exact: true }).waitFor();
    await context.setOffline(true);
    await page.reload();
    await click("Design");
    await click("Junction 1");
    assert.equal(await page.locator("[data-lane-port]").count(), 9);
    const link = key => page.locator(`[data-lane-link="${key}"]`);
    const movement = "west:0>east:0";
    const tapLink = async key => {
      const xy = await link(key).locator("path").first().evaluate(path => {
        const point = path.getPointAtLength(path.getTotalLength() * .55);
        return { x: point.x, y: point.y };
      });
      await tap(xy.x, xy.y);
    };
    await click("Eraser");
    await page.locator('[data-lane-port="in:west:0"]').press("Enter");
    await tapLink(movement);
    assert.equal(await link(movement).count(), 0);
    await click("Undo");
    assert.equal(await link(movement).count(), 1);
    await click("Redo");
    assert.equal(await link(movement).count(), 0);
    await click("Draw movement");
    const from = await position('[data-lane-port="in:west:0"] circle');
    const to = await position('[data-lane-port="out:east:0"] circle');
    await drag(...from, ...to);
    assert.equal(await link(movement).count(), 1);
    await toolbar("Select").click();
    await link(movement).press("Enter");
    await click("Stop movement");
    await link("north:0>west:0").press("Enter");
    await click("Yield movement");
    await page.screenshot({ path: "test-results/intersection-movements.png" });
    const junction = await page.evaluate(() => JSON.parse(localStorage.getItem("traffic-manager.school-pickup.v1")).network.nodes.find(node => node.id === "j1"));
    assert.equal(junction.control, "priority");
    assert.equal(junction.movements.find(move => move.from === "west" && move.to === "east").rule, "stop");
    assert.equal(junction.movements.find(move => move.from === "north" && move.to === "west").rule, "yield");
    await click("Simulate");
    await page.getByText("Eclipse SUMO", { exact: true }).waitFor({ timeout: 25000 });
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
  }
});

test("draw a lane-specific slip with the curve ball, then drag its endpoint to another lane", { timeout: 45000 }, async () => {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(4500);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    const click = name => page.getByRole("button", { name, exact: true }).click();
    const map = page.locator("#map");
    const toScreen = (x, y) => map.evaluate((svg, [x, y]) => {
      const point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
      return { x: point.x, y: point.y };
    }, [x, y]);
    const tap = async (x, y) => {
      const point = await toScreen(x, y);
      await page.touchscreen.tap(point.x, point.y);
    };
    const road = label => page.getByRole("button", { name: label, exact: true });
    const port = key => page.locator(`[data-road-lane="${key}"]`);
    const center = selector => page.locator(selector).evaluate(circle => [circle.cx.baseVal.value, circle.cy.baseVal.value]);
    const cdp = await context.newCDPSession(page);
    const touch = (type, point) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [point] : [] });
    const save = () => page.evaluate(() => JSON.parse(localStorage.getItem("traffic-manager.school-pickup.v1")));
    const branch = graph => graph.roads.find(item => item.laneA && item.laneB);
    await click("Add node");
    await tap(270, 250);
    await click("Add node");
    await tap(338, 180);
    await tap(270, 283);
    await click("Add lane left");
    await tap(402, 180);
    await click("Add lane right");
    await click("Draw");
    const start = port("j3:j2:0");
    await start.waitFor();
    assert.equal(await start.evaluate(item => item.classList.contains("extra-lane")), true);
    await start.press("Enter");
    await click("Keep lane merge");
    assert.equal(await port("j3:j2:0").getAttribute("aria-pressed"), "false");
    await start.press("Enter");
    await click("Junction 4");
    const end = await center('[data-road-lane="j4:east:0"] circle:nth-child(2)');
    const down = await toScreen(...end);
    await touch("touchStart", down);
    await page.locator(".draw-curve-ball").waitFor();
    await touch("touchMove", { x: down.x + 17, y: down.y + 15 });
    await page.screenshot({ path: "test-results/road-curve-gesture.png" });
    await touch("touchEnd");
    await click("Apply");
    const authored = (await save()).network;
    const slip = branch(authored);
    assert.ok(slip, await page.locator("#detail").textContent());
    assert.deepEqual(slip.laneA, { neighbor: "j2", lane: 0 });
    assert.deepEqual(slip.laneB, { neighbor: "east", lane: 0 });
    assert.equal(slip.a, "j3");
    assert.equal(slip.b, "j4");
    assert.equal(slip.controls.length, 4);
    await click("Select");
    await road(`Road ${authored.roads.indexOf(slip) + 1}`).press("Enter");
    await page.getByLabel("Segment options", { exact: true }).click();
    await click("Move lane end");
    const handle = await center('[data-road-lane="j4:east:0"] circle:nth-child(2)');
    const receiving = await center('[data-road-lane="j4:east:1"] circle:nth-child(2)');
    assert.ok(Math.abs(handle[1] - receiving[1]) >= 5);
    const endpointHandle = await center('[data-lane-end="b"] circle:nth-child(2)');
    await touch("touchStart", await toScreen(...endpointHandle));
    await touch("touchMove", await toScreen((endpointHandle[0] + receiving[0]) / 2, (endpointHandle[1] + receiving[1]) / 2));
    await touch("touchMove", await toScreen(...receiving));
    await touch("touchEnd");
    assert.deepEqual(branch((await save()).network).laneB, { neighbor: "east", lane: 1 });
    await page.reload();
    await click("Simulate");
    await page.getByText("Eclipse SUMO", { exact: true }).waitFor({ timeout: 25000 });
    const lamps = page.locator("#design-map .replay-signal circle");
    assert.ok(await lamps.count() > 0);
    const colors = () => lamps.evaluateAll(items => items.map(item => item.getAttribute("fill")));
    const initial = await colors();
    const scrub = page.getByRole("slider", { name: "Simulation time" });
    await scrub.fill("44");
    assert.notDeepEqual(await colors(), initial);
    await click("Results");
    await page.getByText("Slip lane trips", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
});

test("the fixed tray stages each drawing shape and clears the map in two taps", { timeout: 50000 }, async () => {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 669, height: 951 }]) {
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      page.setDefaultTimeout(4500);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(url);
      const button = name => page.getByRole("button", { name, exact: true });
      const tap = name => button(name).tap();
      const map = page.locator("#map");
      const tray = page.locator("#inspector");
      const save = () => page.evaluate(() => JSON.parse(localStorage.getItem("traffic-manager.school-pickup.v1"))?.network);
      const screenPoint = (x, y) => map.evaluate((svg, [x, y]) =>
        new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()).toJSON(), [x, y]);
      const mapTap = async (x, y) => {
        const point = await screenPoint(x, y);
        await page.touchscreen.tap(point.x, point.y);
      };
      const cdp = await context.newCDPSession(page);
      const touch = (type, target) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: target ? [{ x: target.x, y: target.y }] : [] });
      const holdAndDrag = async (x, y, toX, toY) => {
        await touch("touchStart", await screenPoint(x, y));
        await page.locator(".draw-curve-ball").waitFor();
        await touch("touchMove", await screenPoint(toX, toY));
        await touch("touchEnd");
      };
      const initial = await tray.boundingBox();
      await tap("Menu");
      const [title, menu] = await Promise.all([button("Menu").boundingBox(), page.locator("#menu-panel").boundingBox()]);
      assert.equal(title.x, menu.x);
      assert.ok(menu.y >= title.y + title.height);
      await tap("Menu");
      await mapTap(270, 245);
      await tap("Move segment");
      const segment = page.getByRole("slider", { name: "Segment lane position" });
      const handle = await segment.boundingBox();
      await touch("touchStart", { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 });
      await touch("touchMove", { x: handle.x + handle.width / 2 - 8, y: handle.y + handle.height / 2 });
      await touch("touchMove", { x: handle.x + handle.width / 2 - 13, y: handle.y + handle.height / 2 });
      await touch("touchEnd");
      const shifted = await save();
      assert.ok(shifted?.roads.some(road => road.laneShift), await page.locator("#detail").textContent());
      assert.equal(await segment.getAttribute("aria-valuenow"), String(shifted.roads.find(road => road.laneShift).laneShift));
      assert.equal((await tray.boundingBox()).height, initial.height);
      await page.screenshot({ path: `test-results/segment-shift-${viewport.width}.png` });
      await tap("Eraser");
      const shift = shifted.roads.find(road => road.laneShift).laneShift;
      await mapTap(270 - shift * 6, 245);
      assert.equal((await save()).roads.length, shifted.roads.length - 1);
      await tap("Undo");
      assert.equal((await save()).roads.length, shifted.roads.length);
      await tap("Eraser");
      await tap("Delete all roads");
      assert.equal((await save()).roads.length, 0);
      assert.equal(await map.locator("[data-free-node]").count(), 6);
      await tap("Undo");
      assert.deepEqual(await save(), shifted);
      await tap("Redo");
      assert.equal((await save()).roads.length, 0);
      await tap("Straight");
      await tap("Snap to roads");
      await tap("Snap to nodes");
      assert.equal(await button("Snap to nodes").getAttribute("aria-pressed"), "false");
      await mapTap(65, 492);
      await mapTap(121, 449);
      assert.equal((await save()).roads.length, 0);
      await tap("Apply");
      assert.equal((await save()).roads[0].controls, undefined);
      await tap("Undo");
      await tap("Curve");
      await mapTap(68, 489);
      await mapTap(145, 450);
      await holdAndDrag(145, 450, 162, 413);
      await tap("Apply");
      assert.equal((await save()).roads[0].controls.length, 4);
      await tap("Undo");
      await tap("Complex");
      await mapTap(70, 495);
      await mapTap(125, 454);
      assert.equal(await button("Apply").isDisabled(), true);
      await mapTap(175, 405);
      await holdAndDrag(125, 454, 146, 490);
      await holdAndDrag(175, 405, 175, 363);
      assert.equal((await tray.boundingBox()).height, initial.height);
      await page.screenshot({ path: `test-results/complex-draft-${viewport.width}.png` });
      await tap("Apply");
      const complex = await save();
      assert.equal(complex.roads.length, 2, await page.locator("#detail").textContent());
      assert.equal(complex.roads[0].b, complex.roads[1].a);
      assert.ok(complex.roads[1].controls[3] > 420);
      await tap("Undo");
      await tap("Freeform");
      await mapTap(65, 491);
      await mapTap(125, 465);
      await holdAndDrag(95, 478, 101, 500);
      await mapTap(180, 444);
      await tap("Apply");
      assert.equal((await save()).roads.length, 2, await page.locator("#detail").textContent());
      assert.equal((await save()).roads[0].controls.length, 4);
      assert.equal((await save()).roads[1].controls, undefined);
      await tap("Select");
      await button("Junction 2").press("Enter");
      assert.equal((await tray.boundingBox()).height, initial.height);
      await tap("Remove all");
      assert.equal(await map.locator("[data-lane-link]").count(), 0);
      await tap("Reset default");
      assert.ok(await map.locator("[data-lane-link]").count() > 0);
      await page.screenshot({ path: `test-results/intersection-options-${viewport.width}.png` });
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
