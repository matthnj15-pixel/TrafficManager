import test from "node:test";
import assert from "node:assert/strict";
import { baseline, curve, mergeTaper, normalizeDesign, pointOnCurve, validate } from "../model.mjs";

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

test("curve edits affect the speed exported to SUMO", () => {
  const tight = { ...baseline, entry: 30 };
  assert.ok(curve(tight).radius < curve(baseline).radius);
  assert.ok(curve(tight).speed < curve(baseline).speed);
});

test("taper length changes curvature without moving the lane end", () => {
  const short = mergeTaper({ ...baseline, taperLength: 24 });
  const long = mergeTaper({ ...baseline, taperLength: 65 });
  assert.equal(short.end, long.end);
  assert.equal(long.start - short.start, 41);
  assert.ok(long.radius > short.radius);
  assert.ok(long.speed > short.speed);
  assert.equal(validate({ ...baseline, mergeEnd: 250, taperLength: 70 }), false);
});

test("road saves migrate and invalid edits cannot reach SUMO", () => {
  const { mergeEnd, taperLength, green, ...legacy } = { ...baseline, node: 275, lanes: 2 };
  assert.ok(validate(legacy));
  const migrated = normalizeDesign(legacy);
  assert.equal(migrated.mergeEnd, 221);
  assert.equal(migrated.taperLength, taperLength);
  assert.equal(migrated.green, green);
  const { taperYield, ...oldPrioritySave } = { ...baseline, pickupYield: true };
  assert.equal(taperYield, false);
  assert.equal(normalizeDesign(oldPrioritySave).taperYield, true);
  assert.ok(validate(migrated));
  assert.equal(validate({ ...baseline, lanes: 0 }), false);
  assert.equal(validate({ ...baseline, mergeEnd: 270 }), false);
  assert.equal(validate({ ...baseline, green: 28 }), false);
});
