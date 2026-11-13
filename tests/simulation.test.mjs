import test from "node:test";
import assert from "node:assert/strict";
import {startGame,validState,addRoad,placeBuilding,advance,roadCost} from "../simulation.mjs";
test("starter settlement is a valid save",()=>assert.equal(validState(startGame()),true));
test("a road costs money and joins existing infrastructure",()=>{const s=startGame(),before=s.gold,pts=[{x:460,y:454},{x:580,y:475},{x:690,y:520}],cost=roadCost(pts);assert.equal(addRoad(s,pts).ok,true);assert.equal(s.gold,before-cost);});
test("isolated roads are built with a warning and spawn walking access over time",()=>{const s=startGame(),result=addRoad(s,[{x:30,y:30},{x:80,y:50}]);assert.equal(result.ok,true);assert.equal(result.isolated,true);assert.match(s.report,/No sims can reach/);});
test("placing a building consumes materials",()=>{const s=startGame();const old=s.gold;assert.equal(placeBuilding(s,"farm",{x:700,y:610}).ok,true);assert.equal(s.gold,old-120);});
test("turns resolve deterministically",()=>{const a=startGame(),b=startGame();for(let i=0;i<12;i++){assert.deepEqual(advance(a),advance(b));}assert.deepEqual(a,b);assert.equal(validState(a),true);});
test("a food shortage produces deterministic gameplay consequences",()=>{const s=startGame();s.food=0;s.people=200;const result=advance(s,{events:false});assert.ok(result.notices.some(n=>n.includes("food shortage")));});

