import test from "node:test";
import assert from "node:assert/strict";
import {startGame,addRoad,roadCost,validState,roadLength,nearestRoad} from "../simulation.mjs";
import {createRoadDraft,addRoadAnchor,beginRoadBend,updateRoadBend,undoRoadAction,roadDraftPath,flattenRoadDraft,curvePoint,curvedSegments,hitRoadSegment,canBeginCurve,HOLD_MS,MOVE_SLOP_PX,MAX_ANCHORS} from "../road-editor.mjs";
const point=(x,y)=>({x,y});
function three(){const d=createRoadDraft();addRoadAnchor(d,point(200,400));addRoadAnchor(d,point(400,400));addRoadAnchor(d,point(400,600));return d;}

test("AC-01: each tap adds a straight line with no implicit control points",()=>{
 const d=createRoadDraft();assert.equal(addRoadAnchor(d,point(200,400)),true);
 assert.equal(addRoadAnchor(d,point(400,400)),true);
 assert.equal(roadDraftPath(d),"M 200 400 L 400 400");
 assert.deepEqual(d.controls,[null]);
 assert.deepEqual(flattenRoadDraft(d),[point(200,400),point(400,400)]);
});
test("AC-02: three taps preserve sharp corners without automatic smoothing",()=>{
 const d=three();assert.equal(roadDraftPath(d),"M 200 400 L 400 400 L 400 600");
 assert.deepEqual(flattenRoadDraft(d),d.anchors);
});
test("AC-03: long-press drag bends only the selected segment",()=>{
 const d=three();const original=beginRoadBend(d,0);
 assert.deepEqual(original,point(300,400));
 updateRoadBend(d,0,original,point(300,400),point(300,445));
 assert.equal(roadDraftPath(d),"M 200 400 Q 300 490 400 400 L 400 600");
 assert.deepEqual(d.controls[1],null);
 assert.deepEqual(curvePoint(d,0,.5),point(300,445));
});
test("AC-04: a second drag adjusts a curve and doesn't modify adjacent segments",()=>{
 const d=three();let origin=beginRoadBend(d,0);updateRoadBend(d,0,origin,point(300,400),point(300,440));
 const first=JSON.stringify(d.controls[0]);origin=beginRoadBend(d,0);
 updateRoadBend(d,0,origin,point(300,440),point(330,460));
 assert.notEqual(JSON.stringify(d.controls[0]),first);
 assert.equal(d.controls[1],null);
 assert.deepEqual(curvePoint(d,0,.5),point(330,460));
});
test("AC-05: touch gesture classifier separates long press, pan, and pinch",()=>{
 const ready={mode:"road",pointerCount:1,segmentIndex:0,holdMs:HOLD_MS,movementPx:MOVE_SLOP_PX};
 assert.equal(canBeginCurve(ready),true);
 for(const invalid of [{holdMs:HOLD_MS-1},{movementPx:MOVE_SLOP_PX-1},{pointerCount:2},{segmentIndex:-1},{mode:"explore"}])
  assert.equal(canBeginCurve({...ready,...invalid}),false);
});
test("AC-06: preview has a single Q only when the user explicitly bends a segment",()=>{
 const d=three();assert.equal(roadDraftPath(d).includes(" Q "),false);
 const origin=beginRoadBend(d,1);updateRoadBend(d,1,origin,point(400,500),point(470,500));
 assert.equal((roadDraftPath(d).match(/ Q /g)||[]).length,1);
 assert.equal((roadDraftPath(d).match(/ L /g)||[]).length,1);
 assert.equal(hitRoadSegment(d,point(470,500),32),1);
 assert.equal(hitRoadSegment(d,point(100,100),30),-1);
});
test("AC-07: cost tracks actual bend length and undo reverses last action",()=>{
 const d=three(),straight=roadCost(flattenRoadDraft(d)),original=beginRoadBend(d,0);
 updateRoadBend(d,0,original,point(300,400),point(300,490));
 assert.ok(roadCost(flattenRoadDraft(d))>straight);
 assert.equal(undoRoadAction(d),true);
 assert.equal(roadCost(flattenRoadDraft(d)),straight);
 assert.equal(undoRoadAction(d),true);
 assert.equal(d.anchors.length,2);
 assert.deepEqual(createRoadDraft().anchors,[]);
});
test("AC-08: confirmed curved road persists in v1 saves and affects distance calculations",()=>{
 const d=createRoadDraft();
 addRoadAnchor(d,point(460,454));addRoadAnchor(d,point(680,454));
 const ctrl=beginRoadBend(d,0);updateRoadBend(d,0,ctrl,point(570,454),point(570,525));
 const s=startGame(),poly=flattenRoadDraft(d);assert.ok(poly.length>2);
 const cost=roadCost(poly);const out=addRoad(s,poly);
 assert.equal(out.ok,true);assert.equal(s.gold,740-cost);
 assert.equal(validState(s),true);
 const loaded=JSON.parse(JSON.stringify(s));
 assert.equal(validState(loaded),true);
 assert.deepEqual(loaded.roadGraph,s.roadGraph);
 assert.ok(nearestRoad(point(570,520),loaded.roads)<100);
 assert.ok(loaded.roads.slice(-14).reduce((sum,r)=>sum+roadLength(r),0)>220);
});
test("AC-08 regression: legacy v1 saves remain readable and road geometry stays linear",()=>{
 const old=JSON.parse(JSON.stringify(startGame()));assert.equal(validState(old),true);
 assert.deepEqual(old.roads[0][1],point(330,417));
});
test("safety: bound max points, reject malformed anchors and avoid accidental map edits",()=>{
 const d=createRoadDraft();
 for(let i=0;i<MAX_ANCHORS;i++)assert.equal(addRoadAnchor(d,point(172+i*10,472)),true);
 assert.equal(addRoadAnchor(d,point(600,400)),false);
 assert.equal(addRoadAnchor(createRoadDraft(),point(NaN,5)),false);
 const c=beginRoadBend(d,0);updateRoadBend(d,0,c,point(177,472),point(177,530));
 assert.ok(flattenRoadDraft(d).length<=512);
 const s=startGame();assert.equal(addRoad(s,flattenRoadDraft(d)).ok,true);
 assert.equal(validState(s),true);
});
