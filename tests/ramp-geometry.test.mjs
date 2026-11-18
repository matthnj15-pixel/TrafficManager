import test from 'node:test';
import assert from 'node:assert/strict';
import { baseline, junctionLegs, junctionMovements, levelStart, networkLaneSamples, networkNodes, networkRoadGeometry,
  previewRamp, rampLaneTargets, removeNetworkNode, removeNetworkRoad, removeRamp, resizeRoadLanes, shiftNetworkRoad, splitNetworkRoad, roadElevationProfile, separateNetworkJunction, validate } from '../model.mjs';

const target = (a, b, t, forward = true, lane = 0) => ({ host: { a, b }, t, forward, lane });
const stock = () => levelStart('short-merge').network;
const direct = { start: target('west','j1',.5), end: target('south','j1',.75) };
const apply = (graph,draft) => {
  const result = previewRamp(graph,draft);
  assert.ok(result.network,result.issue);
  assert.ok(validate({ ...baseline, network: JSON.parse(JSON.stringify(result.network)) }));
  return result;
};
const road = ([a,b]) => ({ a,b,forward:2,backward:2,bend:0 });
function separated() {
  const crossing = { map:'short-merge',nodes:[{ id:'j1',x:270,y:315,control:'priority' }],
    roads:[['west','j1'],['j1','east'],['south','j1'],['j1','north']].map(road) };
  return separateNetworkJunction(crossing,'j1','west',1).network;
}

test('side forks keep lane identity and through traffic while endpoint edits restore previous curved host cuts', () => {
  const original = stock(), snapshot = structuredClone(original);
  let { network,rampId } = apply(original,direct);
  const endpoint = network.ramps[rampId].start;
  const hit = rampLaneTargets(network,endpoint,'a',{radius:1,host:endpoint.host,replace:rampId})[0];
  assert.ok(Math.abs(hit.t - endpoint.t) < .001);
  const ramp = network.roads.find(r => r.rampId);
  const fork = network.nodes.find(n => n.id === ramp.a);
  const exits = junctionMovements(network,fork).filter(m => m.from === ramp.laneA.neighbor && m.fromLane === 0);
  assert.equal(exits.length,2);
  assert.equal(network.roads.find(r => r.b === fork.id && !r.rampId).forward,2);
  for (const t of [.45,.40,.50]) {
    const saved = network.ramps[rampId];
    network = apply(network,{ ...saved,start:{...saved.start,t},replace:rampId }).network;
    assert.equal(network.nodes.length,original.nodes.length+2);
  }
  assert.deepEqual(removeRamp(network,rampId),original);
  assert.deepEqual(original,snapshot);
});

test('widening preserves the attached physical lane, refuses removing it and keeps neighboring segment widths', () => {
  let { network,rampId } = apply(stock(),direct);
  const ramp = network.roads.find(r => r.rampId);
  const i = network.roads.findIndex(r => r.a === ramp.b && r.b === ramp.laneB.neighbor);
  const removed = resizeRoadLanes(network,i,0,1);
  assert.match(removed.issue,/attachment/);
  const result = resizeRoadLanes(network,i,2,0);
  assert.ok(result.network,result.issue);
  const widened = result.network;
  assert.equal(widened.ramps[rampId].end.lane,1);
  assert.equal(widened.roads.filter(r => r.rampHost?.source.a === 'south' && r.forward === 2).length,1);
  const before = networkLaneSamples(ramp,network,networkNodes(network),true,0).at(-1);
  const after = networkLaneSamples(widened.roads.find(r => r.rampId),widened,networkNodes(widened),true,0).at(-1);
  assert.deepEqual(before,after);
  const saved = widened.ramps[rampId];
  const moved = apply(widened,{...saved,end:{...saved.end,t:.85},replace:rampId}).network;
  assert.equal(moved.ramps[rampId].end.lane,1);
  assert.equal(moved.roads.filter(r => r.rampHost?.source.a === 'south' && r.forward === 1).length,1);
});

test('an editable Harbor loop retains both travel tangents and joins its elevated host at the host height', () => {
  const graph = separated(), start = target('west','east',.61), end = target('north','south',.52,false);
  const preview = apply(graph,{start,end,shape:'loop',direction:1});
  const { network,rampId,roads,samples } = preview, draft = network.ramps[rampId];
  assert.ok(roads.length >= 3);
  const delta = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
  assert.ok(Math.abs(delta(samples[0].angle,draft.start.angle)) < .001);
  assert.ok(Math.abs(delta(samples.at(-1).angle,draft.end.angle)) < .001);
  const sweep = samples.slice(1).reduce((sum,p,i) => sum + delta(p.angle,samples[i].angle),0);
  assert.ok(sweep > 1.4*Math.PI && sweep < 1.6*Math.PI);
  assert.equal(roadElevationProfile(network,roads[0],networkRoadGeometry(roads[0],networkNodes(network)).length)(0),5.5);
  assert.deepEqual(removeRamp(network,rampId),graph);
  assert.match(previewRamp(graph,{start:{...start,t:.28},end:{...end,t:.22},shape:'loop',direction:1}).issue,/winds around twice/);
});

test('surface ramps create a real four-leg crossing while the same overpass and tunnel preserve independent through roads', () => {
  const nodes = [[100,319],[182,319],[356,290],[356,410],[250,280],[250,390]].map(([x,y],i) => ({id:`j${i+1}`,x,y,control:'priority'}));
  const roads = [['j1','j2'],['j3','j4'],['j5','j6']].map(pair => ({...road(pair),forward:1,backward:1}));
  const graph = { map:'short-merge',nodes,roads };
  const ports = { start:target('j1','j2',.5),end:target('j3','j4',.7) };
  for (const grade of [0,1,-1]) {
    const { network,rampId,crossings } = apply(graph,{...ports,grade});
    assert.equal(crossings.length,1);
    const {x,y} = crossings[0];
    const shared = network.nodes.find(n => Math.hypot(n.x-x,n.y-y)<.1);
    if (grade === 0) {
      assert.equal(junctionLegs(network,shared.id).length,4);
      const movements = junctionMovements(network,shared).filter(m => m.from === 'j5' || m.to === 'j6');
      assert.ok(movements.some(m => m.from === 'j5' && m.to === 'j6'));
      const customized = { ...network, nodes:network.nodes.map(n => n === shared ? { ...n,movements,control:'allway_stop' } : n) };
      const edited = apply(customized,{...customized.ramps[rampId],replace:rampId});
      const crossing = edited.network.nodes.find(n => Math.hypot(n.x-x,n.y-y)<.1);
      assert.equal(crossing.control,'allway_stop');
      assert.equal(junctionMovements(edited.network,crossing).length,movements.length);
    } else assert.equal(shared,undefined);
    assert.deepEqual(removeRamp(network,rampId),graph);
  }
});

test('removing a crossing ramp restores the other ramp to its original single edge', () => {
  const nodes = [[45,340],[140,340],[360,340],[455,340],[250,570],[250,475],[250,235],[250,125]]
    .map(([x,y],i) => ({id:`j${i+1}`,x,y,control:'priority'}));
  const roads = [0,2,4,6].map(i => ({ a:nodes[i].id,b:nodes[i+1].id,forward:1,backward:0,bend:0 }));
  const graph = { map:'short-merge',nodes,roads };
  const [a,b,c,d] = roads.map(r => target(r.a,r.b,.5));
  const first = apply(graph,{start:a,end:b});
  const second = apply(first.network,{start:c,end:d});
  assert.equal(second.crossings.length,1);
  const restored = removeRamp(second.network,second.rampId);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)),JSON.parse(JSON.stringify(first.network)));
});

test('host edits that would disconnect a ramp fail atomically, and original junction anchors survive a later host split', () => {
  const graph = { map:'short-merge',nodes:[{id:'j1',x:270,y:315,control:'priority'}],
    roads:[['west','j1'],['j1','east'],['south','j1'],['j1','north']].map(road) };
  const draft = {start:target('west','j1',.55),end:target('j1','north',.45)};
  const { network,roads } = apply(graph,draft);
  const incoming = network.roads.findIndex(r => r.b === roads[0].a && r.a === roads[0].laneA.neighbor);
  assert.equal(removeNetworkRoad(network,incoming),network);
  assert.ok(removeNetworkNode(network,roads[0].a).issue);
  assert.ok(separateNetworkJunction(network,'j1','east',1).issue);
  assert.ok(shiftNetworkRoad(network,incoming,1).issue);
  const terminal = apply(graph,{start:target('west','j1',1),end:target('j1','east',.55)});
  const host = terminal.network.roads[0], pose = networkRoadGeometry(host,networkNodes(terminal.network)).samples[40];
  const split = splitNetworkRoad(terminal.network,0,{id:'j99',x:pose.x,y:pose.y,control:'priority'},.4);
  assert.ok(split.network,split.issue);
  assert.equal(split.network.roads.find(r => r.laneA)?.laneA.neighbor,'j99');
  assert.ok(validate({...baseline,network:split.network}));
});

test('explicit ramp movement rules follow a receiving or departure lane reassignment', () => {
  const { network,rampId,roads } = apply(stock(),direct);
  const fork = network.nodes.find(n => n.id === roads[0].a);
  const movements = junctionMovements(network,fork).map(m => ({ ...m,rule:'yield' }));
  const custom = { ...network,nodes:network.nodes.map(n => n === fork ? {...n,movements} : n) };
  const saved = custom.ramps[rampId];
  const edited = apply(custom,{...saved,start:{...saved.start,lane:1},replace:rampId});
  const departure = edited.roads.find(r => r.laneA);
  const newNode = edited.network.nodes.find(n => n.id === departure.a);
  const turns = junctionMovements(edited.network,newNode).filter(m => m.to === departure.b);
  assert.deepEqual(turns.map(m => [m.fromLane,m.rule]),[[1,'yield']]);
});

test('separation preserves disabled through movements and erased ramps release widened hosts for ordinary edits', () => {
  const graph = { map:'short-merge',nodes:[{id:'j1',x:270,y:315,control:'priority'}],
    roads:[['west','j1'],['j1','east'],['south','j1'],['j1','north']].map(road) };
  const node = graph.nodes[0];
  const movements = junctionMovements(graph,node).filter(m => !(m.from === 'west' && m.to === 'east' && m.fromLane === 0));
  assert.match(separateNetworkJunction({...graph,nodes:[{...node,movements}]},'j1','west',1).issue,/restricts a through lane/);
  const built = apply(graph,{start:target('west','j1',.55),end:target('j1','north',.45)});
  const wider = resizeRoadLanes(built.network,0,3,2);
  assert.ok(wider.network,wider.issue);
  const removed = removeRamp(wider.network,built.rampId);
  assert.equal(removed.roads.some(r => r.rampHost),false);
  const edit = removeNetworkNode(removed,'j1');
  assert.ok(edit.network,edit.issue);
  assert.ok(validate({...baseline,network:edit.network}));
});
