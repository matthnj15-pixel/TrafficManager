import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { after } from 'node:test';
import { chromium } from 'playwright';
import { sumoArgs } from '../sumo-network.mjs';


export const viewportSizes = [
  { width: 669, height: 951 },
  { width: 320, height: 658 }
];
const assets = new Set([
  '/index.html', '/styles.css', '/app.mjs', '/model.mjs', '/manifest.webmanifest', '/icon.svg', '/sw.js',
  '/sumo-export.mjs', '/sumo-network.mjs', '/sumo-worker.mjs', '/sumo-wasm/netconvert.mjs',
  '/sumo-wasm/netconvert.wasm', '/sumo-wasm/sumo.mjs', '/sumo-wasm/sumo.wasm'
]);
const mime = {
  html: 'text/html', css: 'text/css', mjs: 'text/javascript', js: 'text/javascript',
  svg: 'image/svg+xml', webmanifest: 'application/manifest+json', wasm: 'application/wasm'
};

async function serveBuilder() {
  const root = new URL('../', import.meta.url);
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const asset = pathname === '/' ? '/index.html' : pathname;
    if (!assets.has(asset)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const content = await readFile(new URL('.' + asset, root));
      response.writeHead(200, { 'Content-Type': mime[asset.split('.').at(-1)] }).end(content);
    } catch {
      response.writeHead(404).end();
    }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/`;
}

export const targetUrl = process.env.TRAFFIC_QA_URL ?? await serveBuilder();
const appPath = new URL('.', targetUrl).pathname;
export const harborKey = 'traffic-manager.short-merge.v2' + (appPath.includes('/previews/') ? ':' + appPath : '');
const outputDir = process.env.TRAFFIC_QA_OUTPUT ?? 'test-results';

export function launchBrowser() {
  return chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
}

export async function mobileBuilder(browser, viewport, oldSave) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(6500);
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.text().startsWith('On-device SUMO failed')) errors.push(message.text());
  });
  await page.addInitScript(({ oldSave, key }) => {
    if (oldSave && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(oldSave));
    window.builderQaRuns = [];
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      postMessage(request, ...args) {
        if (request?.schema === 'traffic-manager.sumo-request.v2') {
          const start = performance.now();
          this.addEventListener('message', ({ data }) => {
            window.builderQaRuns.push({ request, data, elapsed: performance.now() - start });
          }, { once: true });
        }
        return super.postMessage(request, ...args);
      }
    };
  }, { oldSave, key: harborKey });
  const button = name => page.getByRole('button', { name, exact: true });
  const tap = name => button(name).tap();
  const map = page.locator('#map');
  const point = (x, y) => map.evaluate(
    (svg, [x, y]) => new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()).toJSON(), [x, y]
  );
  async function mapTap(x, y) {
    const screen = await point(x, y);
    assert.ok(screen.x >= 0 && screen.y >= 0 && screen.x < viewport.width && screen.y < viewport.height,
      `Map point (${x}, ${y}) projects outside ${viewport.width}×${viewport.height} at (${screen.x}, ${screen.y})`);
    await page.touchscreen.tap(screen.x, screen.y);
  }
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  async function drag(from, to, { holdMs = 0, cancel = false } = {}) {
    await touch('touchStart', [from]);
    if (holdMs) await new Promise(resolve => setTimeout(resolve, holdMs));
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', [{ x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }]);
    }
    await touch(cancel ? 'touchCancel' : 'touchEnd', []);
  }
  async function pinch(factor) {
    const box = await map.boundingBox();
    const x = box.x + box.width * .5;
    const y = box.y + box.height * .45;
    const fingers = spread => [{ x: x - spread, y, id: 0 }, { x: x + spread, y, id: 1 }];
    await touch('touchStart', fingers(37));
    for (let i = 1; i <= 6; i++) await touch('touchMove', fingers(37 * (1 + (factor - 1) * i / 6)));
    await touch('touchEnd', []);
  }
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), harborKey);
  const enter = () => page.locator('[data-level="short-merge"]').tap();
  const offlineReady = () => page.locator('#menu-offline').filter({ hasText: 'Ready for offline play' }).waitFor();
  const screenshot = async stem => {
    await mkdir(outputDir, { recursive: true });
    const file = join(outputDir, `mobile-builder-${stem}-${viewport.width}.png`);
    await page.screenshot({ path: file, scale: 'css' });
    return file;
  };
  const visibleControls = selector => page.locator(selector).evaluate(element => {
    const clip = element.getBoundingClientRect();
    return Array.from(element.querySelectorAll('button,select,summary')).filter(item => item.getClientRects().length).map(item => {
      const rect = item.getBoundingClientRect();
      return {
        text: item.getAttribute('aria-label') ?? item.textContent.trim(),
        inViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        inPanel: rect.left >= clip.left && rect.right <= clip.right && rect.top >= clip.top && rect.bottom <= clip.bottom
      };
    });
  });
  async function simulate() {
    const seen = await page.evaluate(() => window.builderQaRuns.length);
    await tap('Simulate');
    await page.getByText('Eclipse SUMO', { exact: true }).waitFor({ timeout: 60000 });
    await page.waitForFunction(count => window.builderQaRuns.length > count, seen);
    const run = await page.evaluate(() => window.builderQaRuns.at(-1));
    assert.equal(run.data.version, '1.28.0');
    assert.equal(run.data.error, undefined);
    return run;
  }
  async function open() {
    await page.goto(targetUrl);
    await offlineReady();
    await enter();
  }
  return { context, page, map, button, tap, point, mapTap, drag, pinch, saved, enter, offlineReady, screenshot, simulate,
    visibleControls, open, errors };
}

export async function saveRun(stem, run, report) {
  const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const args = sumoArgs(run.request, false);
  const seed = args[args.indexOf('--seed') + 1];
  assert.equal(seed, '42');
  const summarize = result => result && { results: result.results, framesSha256: sha256(result.frames) };
  const evidence = {
    engine: run.data.version,
    workerMs: run.elapsed,
    seed,
    tripCount: run.request.trips.length,
    arrivalsSha256: sha256(run.request.trips),
    original: summarize(run.data.original),
    edited: summarize(run.data.edited),
    ...report
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, `mobile-builder-${stem}.json`), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}
