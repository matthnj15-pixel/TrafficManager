import test from "node:test";
import assert from "node:assert/strict";
import {startGame,buildRoad,advance,structureAccess,accessibleRoads,removeRoadNode,validState,BUILDINGS,nearestRoad} from "../simulation.mjs";
import {nearestNode,segmentAt,connectedEdgeIds,planarize,edgePoints} from "../road-network.mjs";
import {radialCurveGesture,anchoredSegment} from "../road-gesture.mjs";

const p=(x,y)=>({x,y});
test("WV-ROAD-003 AC-01 node position is fixed while finger moves",()=>{
 const anchor=p(520,340),before={...anchor};
 const one=radialCurveGesture(anchor,p(560,360));
 assert.deepEqual(one.anchor,anchor);assert.deepEqual(anchor,before);
 assert.deepEqual(one.control,p(480,320));
 const two=radialCurveGesture(anchor,p(600,380));
 assert.deepEqual(two.anchor,anchor);
 assert.deepEqual(two.control,p(440,300));
 assert.ok(two.radius>one.radius);
});
test("WV-ROAD-003 AC-02 radial curve point is opposite the finger and turns around its anchor",()=>{
 const anchor=p(400,400);
 assert.deepEqual(radialCurveGesture(anchor,p(460,400)).control,p(340,400));
 assert.deepEqual(radialCurveGesture(anchor,p(400,460)).control,p(400,340));
 assert.deepEqual(radialCurveGesture(anchor,p(340,400)).control,p(460,400));
 assert.deepEqual(anchoredSegment(p(250,400),anchor,p(460,430)).end,anchor);
 assert.equal(anchoredSegment(anchor,anchor,p(460,430)).pending,true);
});
test("WV-ROAD-003 AC-03 crossing a built road creates a real shared junction",()=>{
 const s=startGame(),before=s.roadGraph.nodes.length;
 const r=buildRoad(s,[p(400,340),p(400,540)],[null]);
 assert.equal(r.ok,true);assert.equal(r.isolated,false);
 assert.ok(r.intersections>=1);
 const node=s.roadGraph.nodes.find(n=>Math.abs(n.x-400)<2&&n.y>390&&n.y<480);
 assert.ok(node,"visible crossing becomes a persistent node");
 assert.ok(s.roadGraph.segments.filter(e=>e.a===node.id||e.b===node.id).length>=4);
 assert.ok(s.roadGraph.nodes.length>before);
 assert.ok(connectedEdgeIds(s.roadGraph).size>=6);
 assert.equal(validState(JSON.parse(JSON.stringify(s))),true);
});
test("WV-ROAD-003 AC-04 a second independent street can cross another isolated street",()=>{
 const s=startGame();
 assert.equal(buildRoad(s,[p(100,150),p(300,150)],[null]).isolated,true);
 const r=buildRoad(s,[p(200,80),p(200,240)],[null]);
 assert.equal(r.ok,true);assert.equal(r.isolated,true);
 const junction=s.roadGraph.nodes.find(n=>Math.abs(n.x-200)<2&&Math.abs(n.y-150)<2);
 assert.ok(junction);
 assert.equal(s.roadGraph.segments.filter(e=>e.a===junction.id||e.b===junction.id).length,4);
});
test("WV-ROAD-003 AC-05 disconnected streets are allowed with a warning and no immediate full access",()=>{
 const s=startGame();
 const result=buildRoad(s,[p(110,100),p(245,100)],[null]);
 assert.equal(result.ok,true);assert.equal(result.isolated,true);
 assert.match(s.report,/No sims can reach it directly/);
 assert.equal(structureAccess(s,p(160,130)),"none");
 assert.equal(s.desirePaths.length,0);
});
test("WV-ROAD-003 AC-06 desire paths emerge over advancing months without constructing roads",()=>{
 const s=startGame();buildRoad(s,[p(110,100),p(245,100)],[null]);
 const before=s.roadGraph.segments.length;
 advance(s,{events:false});assert.equal(s.desirePaths.length,1);assert.ok(s.desirePaths[0].progress>0);
 assert.equal(structureAccess(s,p(160,100)),"none");
 for(let i=0;i<3;i++)advance(s,{events:false});
 assert.equal(s.desirePaths[0].progress,1);
 assert.equal(structureAccess(s,p(160,100)),"footpath");
 assert.equal(s.roadGraph.segments.length,before,"walking paths must not secretly build road");
 assert.equal(validState(JSON.parse(JSON.stringify(s))),true);
});
test("WV-ROAD-003 AC-07 housing loses service and tax contribution when isolated",()=>{
 const baseline=startGame();const connected=advance(baseline,{events:false});
 const s=startGame(),junction=nearestNode(s.roadGraph,p(330,417),2);
 const price=s.gold;removeRoadNode(s,junction.id);
 assert.equal(s.gold,price);
 assert.ok(s.houses.every(h=>structureAccess(s,h)!=="road"));
 const after=advance(s,{events:false});
 assert.ok(after.balance<connected.balance,"disconnected homes reduce town tax revenue");
 assert.ok(s.happiness<baseline.happiness,"service loss affects wellbeing");
});
test("WV-ROAD-003 AC-08 parks and plazas use the same road-access rules",()=>{
 const s=startGame();
 assert.ok(BUILDINGS.park&&BUILDINGS.plaza);
 s.buildings.push({type:"park",x:140,y:120},{type:"plaza",x:150,y:160});
 assert.equal(structureAccess(s,s.buildings.at(-1)),"none");
 const before=advance(s,{events:false});
 assert.ok(before.notices.some(n=>n.includes("Plaza")));
 const built=buildRoad(s,[p(172,472),p(150,160)],[null]);
 assert.equal(built.ok,true);
 assert.equal(structureAccess(s,s.buildings.at(-1)),"road");
});
test("WV-ROAD-003 AC-09 curves and intersections survive save reload",()=>{
 const s=startGame();
 const r=buildRoad(s,[p(360,320),p(490,550)],[p(380,500)]);
 assert.equal(r.ok,true);
 const loaded=JSON.parse(JSON.stringify(s));assert.equal(validState(loaded),true);
 assert.deepEqual(loaded.roadGraph,s.roadGraph);
});
