import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

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

test("edit, simulate, compare, and reopen offline at both mobile sizes", { timeout: 45000 }, async () => {
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
      await click("Simulate");
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
      const results = await page.locator("#inspector").textContent();
      assert.match(results, /School pickup results/);
      await click("Menu");
      await page.getByText("Ready for offline play", { exact: true }).waitFor();
      await context.setOffline(true);
      await page.reload();
      assert.equal(await endHandle.getAttribute("aria-valuenow"), String(shorterEnd));
      await click("Results");
      assert.equal(await page.locator("#inspector").textContent(), results);
      await page.screenshot({ path: `test-results/results-${viewport.width}.png` });
      if (viewport.width === 669 && process.env.TRAFFIC_TEST_SUMO === "1") {
        await click("Menu");
        const downloaded = page.waitForEvent("download");
        await click("Export designs for SUMO");
        const requestPath = "test-results/sumo-request.json";
        const resultsPath = "test-results/sumo-results.json";
        await (await downloaded).saveAs(requestPath);
        const result = spawnSync("python3", ["scripts/run-sumo.py", requestPath, resultsPath], { encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        const choosing = page.waitForEvent("filechooser");
        await click("Open SUMO results");
        await (await choosing).setFiles(resultsPath);
        await page.getByText("Eclipse SUMO · Imported run", { exact: true }).waitFor();
        await click("Worst backup");
        await page.screenshot({ path: "test-results/sumo-comparison-669.png" });
        await click("Results");
        assert.match(await page.locator("#inspector").textContent(), /Reported collisions/);
        await click("Menu");
        await click("Use built-in engine");
        await page.getByText("Built-in engine", { exact: true }).waitFor();
      }
      await click("Menu");
      await click("Restore original design");
      await click("Results");
      assert.match(await page.locator("#inspector").textContent(), /Shorten the queue/);
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
