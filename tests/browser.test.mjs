import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { sumoRequest } from "../sumo-export.mjs";

const url = "http://127.0.0.1:4183";
const server = spawn("python3", ["-m", "http.server", "4183", "--bind", "127.0.0.1"], { stdio: "ignore" });
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

test("edit, simulate, compare, and reopen offline at both mobile sizes", { timeout: 75000 }, async () => {
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
      await page.goto(url);
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
      await click("Junction design");
      await click("Set slip lane start");
      await click("Set slip lane end");
      const slipEnd = page.getByRole("slider", { name: "Slip lane end", exact: true });
      const firstEnd = Number(await slipEnd.getAttribute("aria-valuenow"));
      await drag("Slip lane end", 12, 0);
      const drawnEnd = Number(await slipEnd.getAttribute("aria-valuenow"));
      assert.ok(drawnEnd > firstEnd);
      await click("Pickup yields");
      await click("Signal right turn");
      await click("School right turn");
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
      await click("Junction design");
      assert.equal(await slipEnd.getAttribute("aria-valuenow"), String(drawnEnd));
      assert.equal(await page.getByRole("button", { name: "Signal right turn" }).getAttribute("aria-pressed"), "false");
      await click("Remove slip lane");
      await click("Cancel");
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
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth), false);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.kill();
  }
});
