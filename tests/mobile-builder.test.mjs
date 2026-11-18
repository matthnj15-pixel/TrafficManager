import assert from 'node:assert/strict';
import test from 'node:test';
import * as model from '../model.mjs';
import { harborCrossing } from './fixtures/harbor-crossing.mjs';
import { launchBrowser, mobileBuilder, saveRun, targetUrl, viewportSizes } from './mobile-builder-qa.mjs';

for (const viewport of viewportSizes) {
  const label = `${viewport.width}×${viewport.height}`;
  test(`Harbor's merge-to-exit widening and pinch stay local at ${label}`, { timeout: 30000 }, async () => {
    const browser = await launchBrowser();
    try {
      const qa = await mobileBuilder(browser, viewport);
      await qa.open();
      const initial = await qa.saved();
      await qa.tap('Select');
      await qa.mapTap(271, 260);
      await qa.tap('Add lane right');
      const widened = await qa.saved();
      const index = initial.network.roads.findIndex(road => road.a === 'j1' && road.b === 'j2');
      assert.ok(index >= 0);
      const expected = structuredClone(initial);
      expected.network.roads[index].forward++;
      assert.deepEqual(widened, expected);
      await qa.screenshot('widened-between-merge-and-exit');
      await qa.tap('Undo');
      assert.deepEqual(await qa.saved(), initial);
      await qa.tap('Redo');
      assert.deepEqual(await qa.saved(), widened);

      await qa.tap('Move');
      const originalViewBox = await qa.map.getAttribute('viewBox');
      await qa.pinch(1.7);
      assert.notEqual(await qa.map.getAttribute('viewBox'), originalViewBox);
      assert.deepEqual(await qa.saved(), widened);
      await qa.tap('Map overview');
      assert.equal(await qa.map.getAttribute('viewBox'), originalViewBox);
      assert.deepEqual(qa.errors, []);
    } finally {
      await browser.close();
    }
  });
}

const loopStart = [327.4655, 347.9792];
const loopEnd = [252.9928, 373.2367];
const directStart = [265.8623, 348.9682];
const directEnd = [378.2909, 368.9748];
const westEast = 'West Highway → Cargo Yard';
const southNorth = 'Ferry Terminal → North Highway';

async function pickLane(qa, position, label, beforePick) {
  await qa.mapTap(...position);
  const picker = qa.page.locator('.ramp-picker');
  if (await picker.isVisible()) {
    assert.equal(await picker.locator('[data-ramp-pick].suggested').count(), 1);
    await beforePick?.(picker);
    await picker.locator('[data-ramp-pick]').filter({ hasText: label }).tap();
  }
}

async function screenCenter(locator) {
  const rect = await locator.boundingBox();
  assert.ok(rect, 'Touch handle is visible');
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function stationPoint(network, anchor) {
  const road = network.roads.find(item => {
    const { source = item, from = 0, to = 1 } = item.rampHost ?? {};
    return source.a === anchor.host.a && source.b === anchor.host.b && anchor.t >= from && anchor.t <= to;
  });
  assert.ok(road, 'Ramp host contains the requested station');
  const { from = 0, to = 1 } = road.rampHost ?? {};
  const samples = model.networkRoadGeometry(road, model.networkNodes(network)).samples;
  const pose = samples[Math.round((anchor.t - from) / (to - from) * (samples.length - 1))];
  return model.roadLanePosition({ ...pose, angle: pose.angle + (anchor.forward ? 0 : Math.PI) },
    anchor.forward ? road.forward : road.backward, anchor.lane, (road.laneShift ?? 0) * (anchor.forward ? 1 : -1));
}

async function widenBetweenRamps(qa, design, loopId) {
  const { network } = design;
  const loop = network.ramps[loopId];
  const direct = Object.values(network.ramps).find(ramp => ramp.shape === 'direct');
  assert.deepEqual(loop.end.host, direct.start.host);
  const middle = (loop.end.t + direct.start.t) / 2;
  const between = network.roads.find(road => {
    const host = road.rampHost;
    return host?.source.a === loop.end.host.a && host.source.b === loop.end.host.b &&
      host.from < middle && host.to > middle;
  });
  assert.ok(between, `No segment between ${direct.start.t} and ${loop.end.t}. Host ranges: ${JSON.stringify(
    network.roads.filter(road => road.rampHost).map(road => road.rampHost)
  )}`);
  const geometry = model.networkRoadGeometry(between, model.networkNodes(network));
  const probe = geometry.samples[Math.floor(geometry.samples.length / 2)];
  await qa.tap('Move');
  await qa.pinch(2.4);
  await qa.tap('Select');
  await qa.mapTap(probe.x, probe.y);
  const action = qa.button('Widen weave');
  if (await action.isVisible()) await action.tap();
  else await qa.tap(loop.end.forward ? 'Add lane right' : 'Add lane left');
  const widened = await qa.saved();
  const direction = loop.end.forward ? 'forward' : 'backward';
  const opposite = loop.end.forward ? 'backward' : 'forward';
  const hostPieces = graph => graph.roads.filter(road => road.rampHost &&
    road.rampHost.source.a === loop.end.host.a && road.rampHost.source.b === loop.end.host.b);
  for (const road of hostPieces(widened.network)) {
    const match = hostPieces(network).find(before => before.rampHost.from === road.rampHost.from && before.rampHost.to === road.rampHost.to);
    assert.ok(match, 'Widening preserves attachment stations');
    assert.equal(road[direction], match[direction] + (match === between ? 1 : 0));
    assert.equal(road[opposite], match[opposite]);
  }
  assert.equal(hostPieces(widened.network).length, hostPieces(network).length);
  assert.equal(Object.keys(widened.network.ramps).length, 2);
  await qa.screenshot('widened-between-ramps');
  return widened;
}

function assertSameAttachment(actual, expected) {
  assert.deepEqual(actual.host, expected.host);
  assert.equal(actual.forward, expected.forward);
  assert.equal(actual.lane, expected.lane);
  assert.ok(Math.abs(actual.t - expected.t) < 1e-6, 'The unchanged end keeps its station');
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < .001, 'The unchanged end keeps its position');
  assert.ok(Math.abs(actual.angle - expected.angle) < .001, 'The unchanged end keeps its tangent');
}

async function moveLoopMerge(qa, design, loopId) {
  const { network } = design;
  const nodes = model.networkNodes(network);
  const curve = network.roads.filter(road => road.rampId === loopId)
    .map(road => model.networkRoadGeometry(road, nodes))
    .sort((a, b) => b.length - a.length)[0];
  await qa.tap('Select');
  const probe = curve.samples[Math.floor(curve.samples.length / 2)];
  await qa.mapTap(probe.x, probe.y);
  await qa.tap('Edit ramp');
  const handle = qa.map.locator('[data-ramp-handle="b"]');
  const initial = network.ramps[loopId].end;
  const targetStation = { ...initial, t: initial.t + (initial.forward ? .018 : -.018) };
  const station = stationPoint(network, targetStation);
  await qa.drag(await screenCenter(handle), await qa.point(station.x, station.y));
  await qa.tap('Apply');
  const slid = await qa.saved();
  const slidAnchor = slid.network.ramps[loopId].end;
  assert.equal(slidAnchor.lane, initial.lane);
  assert.ok(initial.forward ? slidAnchor.t > initial.t : slidAnchor.t < initial.t);
  await qa.screenshot('slid-merge');

  const alternateLane = slidAnchor.lane === 0 ? 1 : 0;
  const updatedLane = stationPoint(slid.network, { ...slidAnchor, lane: alternateLane });
  const assignedFrom = await screenCenter(handle);
  await qa.drag(assignedFrom, await qa.point(updatedLane.x, updatedLane.y));
  await qa.tap('Apply');
  const reassigned = await qa.saved();
  assert.equal(reassigned.network.ramps[loopId].end.lane, alternateLane);
  assert.deepEqual(Object.keys(reassigned.network.ramps).sort(), Object.keys(network.ramps).sort());
  assertSameAttachment(reassigned.network.ramps[loopId].start, network.ramps[loopId].start);
  const [directId] = Object.keys(network.ramps).filter(id => id !== loopId);
  const { start, end, ...otherGeometry } = network.ramps[directId];
  const { start: newStart, end: newEnd, ...newGeometry } = reassigned.network.ramps[directId];
  assertSameAttachment(newStart, start);
  assertSameAttachment(newEnd, end);
  assert.deepEqual(newGeometry, otherGeometry);
  await qa.screenshot('reassigned-merge');
  return reassigned;
}

async function openCrossing(qa) {
  await qa.tap('Select');
  await qa.mapTap(270, 315);
  await qa.tap('Build structure');
}

async function stageOverpass(qa) {
  await qa.page.getByRole('button', { name: /Overpass from (North Highway to Ferry Terminal|Ferry Terminal to North Highway)/ }).tap();
  await qa.map.locator('[data-crossing-preview="1"]').waitFor();
  assert.equal(await qa.map.locator('[data-crossing-turn]').count(), 8);
  const impact = await qa.page.locator('.crossing-impact').textContent();
  assert.match(impact, /8 turns close/);
  assert.match(impact, /73 scheduled trips affected/);
  const controls = await qa.visibleControls('.editor-tray');
  for (const name of ['Cancel', 'Apply']) {
    assert.ok(controls.some(item => item.text === name && item.inViewport && item.inPanel), `${name} fits the crossing tray`);
  }
  return impact.trim();
}

async function drawConnector(qa, shape, from, to, fromName, toName, onPicker) {
  await qa.tap('Draw');
  await pickLane(qa, from, fromName, onPicker);
  await qa.page.getByText('Exit lane selected', { exact: true }).waitFor();
  const startTime = Date.now();
  await pickLane(qa, to, toName);
  const shapeButton = qa.button(shape);
  if (await shapeButton.getAttribute('aria-pressed') !== 'true') await shapeButton.tap();
  const preview = qa.map.locator(`[data-ramp-preview="${shape.toLowerCase()}"]`);
  await preview.locator('[data-ramp-surface]').waitFor({ state: 'attached' });
  return { preview, previewInteractionMs: Date.now() - startTime };
}

for (const viewport of viewportSizes) {
  const label = `${viewport.width}×${viewport.height}`;
  test(`a saved four-way Harbor can be rebuilt with real touches and resumed offline at ${label}`, { timeout: 180000 }, async () => {
    const browser = await launchBrowser();
    const oldSave = harborCrossing();
    const qa = await mobileBuilder(browser, viewport, oldSave);
    try {
      await qa.page.goto(targetUrl);
      await qa.offlineReady();
      await qa.context.setOffline(true);
      await qa.page.reload();
      await qa.enter();
      assert.deepEqual(await qa.saved(), oldSave);
      await qa.context.setOffline(false);

      await openCrossing(qa);
      const impact = await stageOverpass(qa);
      await qa.screenshot('staged-crossing');
      assert.deepEqual(await qa.saved(), oldSave);
      await qa.tap('Cancel');
      assert.deepEqual(await qa.saved(), oldSave);
      assert.equal(await qa.map.locator('[data-crossing-preview]').count(), 0);
      if (!await qa.page.locator('.structure-layout').isVisible()) await openCrossing(qa);
      await stageOverpass(qa);
      await qa.tap('Apply');
      const separated = await qa.saved();
      assert.equal(separated.network.nodes.length, 0);
      assert.equal(separated.network.roads.length, 2);
      assert.equal(separated.network.roads.filter(road => road.grade === 1).length, 1);
      await qa.screenshot('committed-overpass');

      let sawPicker = false;
      const loop = await drawConnector(qa, 'Loop', loopStart, loopEnd, westEast + ' · Lane 1', southNorth + ' · Lane 1', async picker => {
        sawPicker = true;
        assert.ok(await picker.locator('[data-ramp-pick]').count() >= 2);
        const bounds = await qa.visibleControls('.ramp-editor');
        assert.ok(bounds.some(control => control.inViewport && control.inPanel && control.text.includes('Suggested')));
        await qa.screenshot('crowded-lane-picker');
      });
      assert.ok(sawPicker, 'A short tap at a multilane host opened the crowded lane picker');
      assert.deepEqual(await qa.saved(), separated);
      const ball = loop.preview.locator('[data-ramp-handle="bend"]');
      const beforeBall = await ball.getAttribute('transform');
      const ballCenter = await screenCenter(ball);
      await qa.drag(ballCenter, { x: ballCenter.x + 14, y: ballCenter.y + 6 });
      assert.notEqual(await ball.getAttribute('transform'), beforeBall);
      await qa.screenshot('loop-curve-ball');
      await qa.tap('Cancel');
      assert.deepEqual(await qa.saved(), separated);
      assert.equal(await qa.map.locator('[data-ramp-preview]').count(), 0);

      await drawConnector(qa, 'Loop', loopStart, loopEnd, westEast + ' · Lane 1', southNorth + ' · Lane 1');
      await qa.tap('Apply');
      const withLoop = await qa.saved();
      const [loopId] = Object.keys(withLoop.network.ramps);
      assert.equal(withLoop.network.ramps[loopId].shape, 'loop');
      await qa.tap('Undo');
      assert.deepEqual(await qa.saved(), separated);
      await qa.tap('Redo');
      assert.deepEqual(await qa.saved(), withLoop);

      const direct = await drawConnector(qa, 'Direct', directStart, directEnd,
        southNorth + ' · Lane 1', westEast + ' · Lane 1');
      await qa.screenshot('outer-slip-preview');
      await qa.tap('Apply');
      const withBoth = await qa.saved();
      assert.equal(Object.keys(withBoth.network.ramps).length, 2);
      assert.equal(Object.values(withBoth.network.ramps).filter(ramp => ramp.shape === 'direct').length, 1);

      const baselineRun = await qa.simulate();
      const before = await saveRun(`before-widening-${viewport.width}`, baselineRun, {
        viewport, attachments: withBoth.network.ramps
      });
      await qa.tap('Results');
      await qa.screenshot('before-widening-results');
      await qa.tap('Design');
      const widened = await widenBetweenRamps(qa, withBoth, loopId);
      const finalDesign = await moveLoopMerge(qa, widened, loopId);
      await qa.context.setOffline(true);
      await qa.page.reload();
      await qa.enter();
      assert.deepEqual(await qa.saved(), finalDesign);
      await qa.screenshot('reopened-offline');
      const run = await qa.simulate();
      assert.equal(run.request.trips.length, 130);
      assert.deepEqual(run.request.trips, baselineRun.request.trips);
      assert.deepEqual(run.data.original.results, baselineRun.data.original.results);
      assert.deepEqual(run.data.original.frames, baselineRun.data.original.frames);
      assert.deepEqual(run.request.edited.design.network, finalDesign.network);
      const rampEdges = new Set(finalDesign.network.roads.flatMap((road, index) => road.rampId ? [`road-${index}-f_0`] : []));
      const traversals = new Map();
      let firstRampFrame = -1;
      for (const [index, frame] of run.data.edited.frames.entries()) {
        for (const marker of frame.markers) {
          if (!rampEdges.has(marker.lane)) continue;
          if (firstRampFrame < 0) firstRampFrame = index;
          if (!traversals.has(marker.lane)) traversals.set(marker.lane, new Set());
          traversals.get(marker.lane).add(marker.id);
        }
      }
      if (firstRampFrame >= 0) {
        await qa.page.locator('#scrub').fill(String(firstRampFrame * run.request.step));
        await qa.tap('Compare');
        await qa.screenshot('ramp-trajectory');
      }
      await qa.tap('Results');
      const reports = await qa.page.locator('.metrics tr').allTextContents();
      await qa.screenshot('simulation-results');
      const report = await saveRun(`four-way-${viewport.width}`, run, {
        viewport, impact, reports, firstRampFrame, before,
        previewInteractionMs: { loop: loop.previewInteractionMs, direct: direct.previewInteractionMs },
        traversals: [...traversals].map(([edge, ids]) => ({ edge, ids: [...ids] }))
      });
      assert.equal(report.arrivalsSha256, '8165ac4734c76a0da9485a9dc014cf9d5717bc1067e890d3544b7bad805fb377');
      assert.ok(firstRampFrame >= 0, 'A SUMO replay marker traveled down a committed ramp');
      assert.deepEqual(qa.errors, []);
    } catch (error) {
      const screenshot = await qa.screenshot('gesture-failure').catch(() => undefined);
      const detail = await qa.page.locator('#detail').allTextContents().catch(() => []);
      console.error({ label, screenshot, detail, browserErrors: qa.errors, error });
      throw error;
    } finally {
      await browser.close();
    }
  });
}
