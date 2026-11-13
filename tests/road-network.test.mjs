import test from "node:test";
import assert from "node:assert/strict";
import {startGame,validState,buildRoad,removeRoadNode,removeRoadSegment,reshapeRoadSegment,makeRoadIntersection,accessibleRoads,advance,nearestRoad} from "../simulation.mjs";
import {createGraph,ensureGraph,graphLines,nodeAt,nearestNode,connectedEdgeIds,nearestSegment,segmentAt,quadraticPoint} from "../road-network.mjs";
import {gestureSegment} from "../road-gesture.mjs";
const pt=(x,y)=>({x,y});
test("AC-01 original village road is a real editable connected graph",()=>{
 const s=startGame(),g=s.roadGraph;
 assert.equal(g.nodes.length,4);
 assert.equal(g.segments.length,3);
 assert.equal(connectedEdgeIds(g).size,3);
 assert.equal(g.nodes[0].x,172);
 assert.equal(g.nodes[1].x,330);
 assert.equal(s.roads.length,3);
 assert.ok(nearestNode(g,pt(330,417),15));
});
test("AC-02 existing junction supports branching, new roads share its exact node",()=>{
 const s=startGame(),g=s.roadGraph,previous=g.nodes.length;
 const r=buildRoad(s,[pt(330,417),pt(365,310)],[null]);
 assert.equal(r.ok,true);
 assert.equal(s.roadGraph.nodes.length,previous+1);
 const junction=nearestNode(s.roadGraph,pt(330,417),1);
 assert.equal(s.roadGraph.segments.filter(e=>e.a===junction.id||e.b===junction.id).length,3);
});
test("AC-03 deleting junction costs nothing, refunds nothing, breaks dependencies",()=>{
 const s=startGame(),j=nearestNode(s.roadGraph,pt(330,417),1),before=s.gold;
 assert.equal(removeRoadNode(s,j.id).ok,true);
 assert.equal(s.gold,before);
 assert.equal(s.roadGraph.segments.length,1);
 const result=advance(s,{events:false});
 assert.equal(result.foodProduction,0);
 assert.equal(result.woodProduction,0);
 assert.ok(result.notices.some(x=>x.includes("road connection")));
 assert.equal(validState(s),true);
});
test("AC-03 deleted road connections can be restored through a newly built route",()=>{
 const s=startGame(),j=nearestNode(s.roadGraph,pt(330,417),1);removeRoadNode(s,j.id);
 const isolated=nearestNode(s.roadGraph,pt(460,454),1);
 assert.equal(connectedEdgeIds(s.roadGraph).size,0);
 const built=buildRoad(s,[pt(172,472),pt(288,400),pt(isolated.x,isolated.y)],[null,null]);
 assert.equal(built.ok,true);
 assert.ok(connectedEdgeIds(s.roadGraph).size>1);
 assert.ok(advance(s,{events:false}).woodProduction>0);
});
test("AC-04 tap-to-connect existing endpoints and straight corners",()=>{
 const s=startGame();const old=s.roadGraph.segments.length;
 assert.equal(buildRoad(s,[pt(460,454),pt(480,320),pt(656,383)],[null,null]).ok,true);
 assert.equal(s.roadGraph.segments.length,old+2);
 assert.equal(s.roadGraph.segments.at(-1).control,null);
});
test("AC-05 hold-drag creates a curved segment in one operation",()=>{
 const s=startGame();
 const curve=gestureSegment(pt(460,454),pt(560,320),pt(700,410),[pt(580,330),pt(620,360)]);
 assert.ok(curve.control);
 const built=buildRoad(s,[curve.start,curve.end],[curve.control]);
 assert.equal(built.ok,true);
 assert.ok(s.roadGraph.segments.at(-1).control);
});
test("AC-05 a single long drag from free ground can start and finish a road",()=>{
 const straight=gestureSegment(pt(460,454),pt(460,454),pt(700,454),[pt(520,454),pt(600,454)]);
 assert.ok(straight);assert.equal(straight.control,null);
 const bowed=gestureSegment(pt(460,454),pt(460,454),pt(700,454),[pt(540,350),pt(620,360)]);
 assert.ok(bowed.control);
});
test("AC-06 built curves remain editable without altering other road segments or gold",()=>{
 const s=startGame();assert.equal(buildRoad(s,[pt(460,454),pt(700,454)],[pt(600,365)]).ok,true);
 const e=s.roadGraph.segments.at(-1),other=s.roadGraph.segments[0],price=s.gold;
 assert.equal(reshapeRoadSegment(s,e.id,pt(620,330)).ok,true);
 assert.deepEqual(segmentAt(s.roadGraph,e.id).control,pt(620,330));
 assert.equal(other.control,null);assert.equal(s.gold,price);
 assert.equal(reshapeRoadSegment(s,e.id,null).ok,true);
 assert.equal(segmentAt(s.roadGraph,e.id).control,null);
 assert.equal(validState(JSON.parse(JSON.stringify(s))),true);
});
test("AC-07 existing segment can receive a junction then a branching road",()=>{
 const s=startGame();const before=s.roadGraph.segments.length,e=s.roadGraph.segments[0];
 const outcome=makeRoadIntersection(s,e.id,.5);
 assert.equal(outcome.ok,true);
 assert.equal(s.roadGraph.segments.length,before+1);
 const {node}=outcome;
 assert.equal(buildRoad(s,[pt(node.x,node.y),pt(240,330)],[null]).ok,true);
 assert.equal(s.roadGraph.segments.length,before+2);
});
test("AC-08 legacy v1 save migrates without wiping roads, buildings, or money",()=>{
 const s=startGame(),old=JSON.parse(JSON.stringify(s));delete old.roadGraph;
 assert.equal(validState(old),true);
 const graph=ensureGraph(old);
 assert.equal(graph.nodes.length,4);
 assert.equal(old.gold,740);
 assert.equal(old.buildings.length,2);
 assert.equal(validState(old),true);
});
test("AC-09 finished road and curve graph survive serialization and no-refund demolition",()=>{
 const s=startGame();
 assert.equal(buildRoad(s,[pt(460,454),pt(730,454)],[pt(620,350)]).ok,true);
 const data=JSON.parse(JSON.stringify(s));
 assert.equal(validState(data),true);
 assert.deepEqual(data.roadGraph,s.roadGraph);
 const before=data.gold,id=data.roadGraph.segments.at(-1).id;
 assert.equal(removeRoadSegment(data,id).ok,true);
 assert.equal(data.gold,before);
});
test("AC-10 removing the gateway is guarded to protect the access origin",()=>{
 const s=startGame();
 const result=removeRoadNode(s,s.roadGraph.hubId);
 assert.equal(result.ok,false);
 assert.equal(s.roadGraph.segments.length,3);
});
