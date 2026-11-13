// Persistent, editable road topology. Compatible with original v1 polygonal saves.
// Each edge connects node IDs, with an optional quadratic curve control point.
const BOUNDS={w:1200,h:900};
export const SNAP_RADIUS=22, CURVE_SAMPLES=14;
export const nodeAt=(g,id)=>g.nodes.find(n=>n.id===id)||null;
export const segmentAt=(g,id)=>g.segments.find(e=>e.id===id)||null;
const pointOk=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=BOUNDS.w&&p.y>=0&&p.y<=BOUNDS.h;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function quadraticPoint(a,c,b,t){return lerp(lerp(a,c,t),lerp(c,b,t),t);}
export function edgePoints(g,e){const a=nodeAt(g,e.a),b=nodeAt(g,e.b);if(!a||!b)return[];if(!e.control)return[{x:a.x,y:a.y},{x:b.x,y:b.y}];return Array.from({length:CURVE_SAMPLES+1},(_,i)=>quadraticPoint(a,e.control,b,i/CURVE_SAMPLES));}
export function graphLines(g,reachableOnly=false){const ids=reachableOnly?connectedEdgeIds(g):null;return g.segments.filter(e=>!ids||ids.has(e.id)).map(e=>edgePoints(g,e)).filter(l=>l.length>=2);}
export function createGraph(roads){
 const g={nodes:[],segments:[],nextId:1,hubId:null};
 const cache=new Map();
 function getOrCreate(p){
  const key=Math.round(p.x*100)/100+":"+Math.round(p.y*100)/100;
  if(cache.has(key))return cache.get(key);
  const n={id:g.nextId++,x:p.x,y:p.y};g.nodes.push(n);cache.set(key,n.id);return n.id;
 }
 for(const line of roads){
  if(!Array.isArray(line))continue;
  for(let i=0;i<line.length;i++){
   const id=getOrCreate(line[i]);if(g.hubId===null)g.hubId=id;
   if(i===0)continue;
   const a=getOrCreate(line[i-1]);
   if(a!==id)g.segments.push({id:g.nextId++,a,b:id,control:null});
  }
 }
 return g;
}
export function ensureGraph(state){if(!state.roadGraph){state.roadGraph=createGraph(state.roads);state.roads=graphLines(state.roadGraph);}return state.roadGraph;}
export function validGraph(g){
 if(!g||!Number.isSafeInteger(g.nextId)||g.nextId<1||!Array.isArray(g.nodes)||!Array.isArray(g.segments))return false;
 if(g.nodes.length>10000||g.segments.length>12000)return false;
 const seen=new Set();
 for(const n of g.nodes){if(!Number.isSafeInteger(n.id)||seen.has(n.id)||!pointOk(n))return false;seen.add(n.id);}
 if(!seen.has(g.hubId))return false;
 const edges=new Set();
 for(const e of g.segments){
  if(!Number.isSafeInteger(e.id)||edges.has(e.id)||seen.has(e.id)||!seen.has(e.a)||!seen.has(e.b)||e.a===e.b||!(e.control===null||pointOk(e.control)))return false;
  edges.add(e.id);
 }
 return true;
}
export function nearestNode(g,p,radius=SNAP_RADIUS){let best=radius,found=null;for(const n of g.nodes){const d=dist(n,p);if(d<=best){best=d;found=n;}}return found;}
export function connectedEdgeIds(g){
 const adjacency=new Map(g.nodes.map(n=>[n.id,[]]));
 for(const e of g.segments){adjacency.get(e.a)?.push(e);adjacency.get(e.b)?.push(e);}
 const visited=new Set([g.hubId]),queue=[g.hubId],active=new Set();
 for(let i=0;i<queue.length;i++){
  for(const e of adjacency.get(queue[i])||[]){
   active.add(e.id);const other=e.a===queue[i]?e.b:e.a;
   if(!visited.has(other)){visited.add(other);queue.push(other);}
  }
 }
 return active;
}
export function isConnectedNode(g,id){if(id===g.hubId)return true;return g.segments.some(e=>connectedEdgeIds(g).has(e.id)&&(e.a===id||e.b===id));}
function addNode(g,p){const n={id:g.nextId++,x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100};g.nodes.push(n);return n.id;}
function prune(g){const used=new Set([g.hubId]);for(const e of g.segments){used.add(e.a);used.add(e.b);}g.nodes=g.nodes.filter(n=>used.has(n.id));}
export function deleteNode(g,id){
 if(id===g.hubId)return{ok:false,reason:"The village entrance must remain connected."};
 const n=nodeAt(g,id);if(!n)return{ok:false,reason:"Road node not found."};
 const removed=g.segments.filter(e=>e.a===id||e.b===id).length;
 g.segments=g.segments.filter(e=>e.a!==id&&e.b!==id);
 g.nodes=g.nodes.filter(x=>x.id!==id);
 prune(g);return{ok:true,removed};
}
export function deleteSegment(g,id){
 const found=segmentAt(g,id);if(!found)return{ok:false,reason:"Road segment not found."};
 g.segments=g.segments.filter(e=>e.id!==id);prune(g);return{ok:true};
}
export function setSegmentCurve(g,id,control){
 const e=segmentAt(g,id);if(!e)return false;
 if(control!==null&&!pointOk(control))return false;
 e.control=control?{x:Math.round(control.x*100)/100,y:Math.round(control.y*100)/100}:null;return true;
}
// Intersections are true shared nodes, not merely visually crossed paths.
const cross2=(a,b)=>a.x*b.y-a.y*b.x;
function crossingOf(a,b,c,d){
 const r={x:b.x-a.x,y:b.y-a.y},v={x:d.x-c.x,y:d.y-c.y},den=cross2(r,v);
 if(Math.abs(den)<1e-7)return null;
 const delta={x:c.x-a.x,y:c.y-a.y},u=cross2(delta,v)/den,t=cross2(delta,r)/den;
 if(u<-.0001||u>1.0001||t<-.0001||t>1.0001)return null;
 return{u:Math.max(0,Math.min(1,u)),v:Math.max(0,Math.min(1,t)),
  point:{x:a.x+u*r.x,y:a.y+u*r.y}};
}
function edgeCrossing(g,left,right){
 const l=edgePoints(g,left),r=edgePoints(g,right);
 for(let i=1;i<l.length;i++)for(let j=1;j<r.length;j++){
  const x=crossingOf(l[i-1],l[i],r[j-1],r[j]);
  if(x)return{t1:(i-1+x.u)/(l.length-1),t2:(j-1+x.v)/(r.length-1),point:x.point};
 }
 return null;
}
function mergeNodes(g,keep,remove){
 if(keep===remove)return;
 for(const e of g.segments){if(e.a===remove)e.a=keep;if(e.b===remove)e.b=keep;}
 if(g.hubId===remove)g.hubId=keep;
 g.nodes=g.nodes.filter(n=>n.id!==remove);
 g.segments=g.segments.filter(e=>e.a!==e.b);
}
function intersectionNode(g,e,t){
 if(t<=.0005)return nodeAt(g,e.a);
 if(t>=.9995)return nodeAt(g,e.b);
 return splitSegment(g,e.id,t);
}
export function planarize(g){
 // Split both roads at the same intersection and give them one shared ID.
 // Supports curved roads using their rendered sample points to detect crossings.
 let count=0;
 while(count<150){
  let changed=false;
  outer:for(let i=0;i<g.segments.length;i++)for(let j=i+1;j<g.segments.length;j++){
   const a=g.segments[i],b=g.segments[j];
   const intersection=edgeCrossing(g,a,b);
   if(!intersection)continue;
   const n1=intersectionNode(g,a,intersection.t1);
   const n2=intersectionNode(g,b,intersection.t2);
   if(!n1||!n2)continue;
   if(n1.id===n2.id)continue;
   mergeNodes(g,n1.id,n2.id);
   count++;changed=true;break outer;
  }
  if(!changed)break;
 }
 return count;
}
export function addGeometry(g,anchors,controls){
 if(anchors.length<2||controls.length!==anchors.length-1||anchors.some(p=>!pointOk(p))||controls.some(c=>c!==null&&!pointOk(c)))return{ok:false,reason:"Invalid road geometry."};
 const firstId=g.nextId;
 const ids=anchors.map(p=>{
  const matched=nearestNode(g,p,SNAP_RADIUS);
  if(matched)return matched.id;
  const segment=nearestSegment(g,p,SNAP_RADIUS);
  if(segment&&segment.t>.015&&segment.t<.985){
   const split=splitSegment(g,segment.segment.id,segment.t);
   if(split)return split.id;
  }
  return addNode(g,p);
 });
 for(let i=0;i<controls.length;i++){
  if(ids[i]===ids[i+1])continue;
  g.segments.push({id:g.nextId++,a:ids[i],b:ids[i+1],control:controls[i]?{...controls[i]}:null});
 }
 const intersections=planarize(g);
 const isolated=!ids.some(id=>isConnectedNode(g,id));
 return{ok:true,isolated,intersections,firstId};
}
export function nearestSegment(g,p,radius=SNAP_RADIUS){
 let found=null,best=radius;
 for(const e of g.segments){
  const points=edgePoints(g,e);
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],v={x:b.x-a.x,y:b.y-a.y};
   const len=v.x*v.x+v.y*v.y,t=len?Math.max(0,Math.min(1,((p.x-a.x)*v.x+(p.y-a.y)*v.y)/len)):0;
   const q=lerp(a,b,t),d=dist(p,q);
   if(d<=best){best=d;found={segment:e,point:q,t:((i-1)+t)/(points.length-1),distance:d};}
  }
 }
 return found;
}
export function splitSegment(g,id,t){
 const e=segmentAt(g,id);if(!e||t<=.0005||t>=.9995)return null;
 const a=nodeAt(g,e.a),b=nodeAt(g,e.b),c=e.control;
 const leftControl=c?lerp(a,c,t):null,rightControl=c?lerp(c,b,t):null;
 const p=c?lerp(leftControl,rightControl,t):lerp(a,b,t);
 const nid=addNode(g,p);
 const left={id:g.nextId++,a:e.a,b:nid,control:leftControl};
 const right={id:g.nextId++,a:nid,b:e.b,control:rightControl};
 g.segments.splice(g.segments.indexOf(e),1,left,right);
 return nodeAt(g,nid);
}
export function saveGraphRoads(state){state.roads=graphLines(state.roadGraph);return state;}
