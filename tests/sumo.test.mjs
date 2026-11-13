import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { baseline, duration, step, world } from "../model.mjs";
import { readSumoComparison, sumoRequest } from "../sumo-export.mjs";

test("SUMO uses the same demand and exports the edited taper and lane choices", () => {
  const design = { ...baseline, lanes: 3, mergeEnd: 240 };
  const request = sumoRequest(design);
  assert.equal(request.trips.length, 88);
  assert.equal(request.edited.design.lanes, 3);
  assert.deepEqual(request.edited.taper.at(-1), [world.outer, 240]);
  assert.deepEqual(request.original.taper.at(-1), [world.outer, baseline.mergeEnd]);
  assert.throws(() => sumoRequest({ ...design, lanes: 0 }), /Invalid/);
  assert.throws(() => readSumoComparison(null, design), /SUMO results/);
});

test("native Eclipse SUMO runs the edited road and produces deterministic importable data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "traffic-sumo-test-"));
  const input = join(dir, "request.json");
  const output = join(dir, "results.json");
  const design = { ...baseline, lanes: 3, mergeEnd: 240 };
  try {
    await writeFile(input, JSON.stringify(sumoRequest(design)));
    const run = async () => {
      const process = spawnSync("python3", ["scripts/run-sumo.py", input, output], { encoding: "utf8" });
      assert.equal(process.status, 0, process.error?.message ?? process.stderr);
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
      assert.equal(run.results.finished + run.results.waiting, 88);
      assert.ok(run.results.finished > 0);
    }
    assert.ok(data.edited.frames.some(frame => frame.markers.some(car =>
      car.kind === "pickup" && car.y < baseline.node && car.x > world.outer + 5)));
    assert.notDeepEqual(data.edited.results, data.original.results);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
