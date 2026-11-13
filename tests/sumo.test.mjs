import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { baseline, duration, step, world } from "../model.mjs";
import { readSumoComparison, sumoRequest } from "../sumo-export.mjs";

test("SUMO uses the same demand and exports the edited taper and lane choices", () => {
  const design = { ...baseline, lanes: 2, mergeEnd: 241, taperLength: 50, green: 26 };
  const request = sumoRequest(design);
  assert.equal(request.trips.length, 116);
  assert.equal(request.edited.design.lanes, 2);
  assert.deepEqual(request.edited.taper.at(-1), [world.outer, 241]);
  assert.deepEqual(request.original.taper.at(-1), [world.outer, baseline.mergeEnd]);
  assert.throws(() => sumoRequest({ ...design, lanes: 0 }), /Invalid/);
  assert.throws(() => readSumoComparison(null, design), /invalid comparison/);
});

test("native Eclipse SUMO runs the edited road and produces deterministic importable data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "traffic-sumo-test-"));
  const input = join(dir, "request.json");
  const output = join(dir, "results.json");
  const design = { ...baseline, lanes: 2, mergeEnd: 241, taperLength: 50, green: 26 };
  try {
    await writeFile(input, JSON.stringify(sumoRequest(design)));
    const run = async () => {
      const native = spawnSync(process.execPath, ["scripts/run-sumo.mjs", input, output], { encoding: "utf8" });
      assert.equal(native.status, 0, native.error?.message ?? native.stderr);
      return JSON.parse(await readFile(output, "utf8"));
    };
    const data = await run();
    assert.deepEqual(await run(), data);
    assert.match(data.version, /Eclipse SUMO.*1\.28\.0/);
    assert.equal(readSumoComparison(data, design), data);
    assert.throws(() => readSumoComparison(data, baseline), /different road design/);
    for (const run of [data.original, data.edited]) {
      assert.equal(run.frames.length, duration / step + 1);
      assert.equal(run.results.collisions, 0);
      assert.equal(run.results.finished + run.results.waiting, 116);
      assert.ok(run.results.finished > 0);
    }
    assert.ok(data.edited.frames.some(frame => frame.markers.some(car =>
      car.kind === "pickup" && car.y < baseline.node && car.x > world.outer + 5)));
    assert.ok(data.edited.results.busDelay < data.original.results.busDelay);
    assert.ok(data.edited.results.crossDelay > data.original.results.crossDelay);
    assert.ok(data.edited.results.crossFinished < data.original.results.crossFinished);
    assert.equal(data.edited.frames[28 / step].phase, "avenue-yellow");
    assert.equal(data.edited.frames[32 / step].phase, "cross");
    assert.ok(data.edited.frames.some(frame => frame.markers.some(car => car.zone === "Cross street" && car.reason)));
    for (const run of [data.original, data.edited]) {
      assert.equal(run.frames[run.results.peakFrame].longestQueue, run.results.longestQueue);
      assert.ok(run.frames[run.results.peakFrame].queueZone);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the drawn slip lane serves eastbound traffic when the signal turn is banned", async () => {
  const dir = await mkdtemp(join(tmpdir(), "traffic-junction-test-"));
  const input = join(dir, "request.json");
  const output = join(dir, "results.json");
  const design = { ...baseline, lanes: 2, mergeEnd: 245, slipStart: 220, slipEnd: 380,
    signalRight: false, schoolRight: false, pickupYield: true };
  try {
    await writeFile(input, JSON.stringify(sumoRequest(design)));
    const native = spawnSync(process.execPath, ["scripts/run-sumo.mjs", input, output], { encoding: "utf8" });
    assert.equal(native.status, 0, native.stderr);
    const data = readSumoComparison(JSON.parse(await readFile(output, "utf8")), design);
    assert.ok(data.edited.results.slipFinished > 0);
    assert.equal(data.edited.results.unserved, 4);
    assert.equal(data.edited.results.collisions, 0);
    assert.ok(data.edited.frames.some(frame => frame.markers.some(car => car.zone === "Slip lane")));
    assert.equal(data.original.results.slipFinished, 0);
    assert.equal(data.original.results.unserved, 0);
    assert.throws(() => sumoRequest({ ...design, slipStart: 245 }), /Invalid/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
