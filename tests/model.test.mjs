import test from "node:test";
import assert from "node:assert/strict";
import { baseline, curve, duration, pointOnCurve, simulate, step, validate, world } from "../model.mjs";

test("moving the merge and reshaping its bend preserve tangent alignment", () => {
  const design = { ...baseline, node: 351, entry: 53, exit: 89 };
  for (const lane of [1, 2]) {
    const path = curve(design, lane);
    assert.equal(path.a.y, path.start.y);
    assert.equal(path.b.x, path.end.x);
    assert.equal(path.end.y, design.node);
    assert.deepEqual(pointOnCurve(path, path.length), {
      x: path.end.x, y: path.end.y, angle: -Math.PI / 2
    });
  }
});

test("a tighter curve lowers the speed readout and the same pickup car's simulated speed", () => {
  const tight = { ...baseline, entry: 30 };
  assert.ok(curve(tight).radius < curve(baseline).radius);
  assert.ok(curve(tight).speed < curve(baseline).speed);
  const firstPickup = run => run.frames[100].markers.find(car => car.kind === "pickup");
  assert.ok(firstPickup(simulate(tight)).speed < firstPickup(simulate(baseline)).speed);
});

test("replay is deterministic, counts all trips, and queues visibly at the original merge", () => {
  const run = simulate(baseline);
  assert.deepEqual(run, simulate(baseline));
  assert.equal(run.frames.length, duration / step + 1);
  assert.equal(run.results.finished + run.results.waiting, 88);
  assert.ok(run.frames.some(frame => frame.markers.some(car => car.reason === "Waiting for a merge gap")));
  assert.ok(run.frames.some(frame => frame.markers.some(car => car.reason === "Red signal")));
});

test("lane connections change vehicle paths and produce a measurable tradeoff", () => {
  const original = simulate(baseline);
  const alternate = simulate({ ...baseline, lanes: 2 });
  const shifted = simulate({ ...baseline, node: 375 });
  const usesAux = run => run.frames.some(frame => frame.markers.some(car => car.kind === "pickup" && car.x === world.auxiliary));
  assert.equal(usesAux(original), false);
  assert.equal(usesAux(alternate), true);
  assert.ok(alternate.results.longestQueue < original.results.longestQueue);
  assert.ok(alternate.results.busDelay < original.results.busDelay);
  assert.ok(shifted.results.longestQueue < original.results.longestQueue);
  assert.ok(shifted.results.busDelay > original.results.busDelay);
});

test("invalid designs cannot strand the pickup route or reach the engine", () => {
  assert.ok(validate(JSON.parse(JSON.stringify(baseline))));
  assert.equal(validate({ ...baseline, lanes: 0 }), false);
  assert.equal(validate({ ...baseline, node: 400 }), false);
  assert.throws(() => simulate({ ...baseline, exit: NaN }), /Invalid corridor design/);
});
