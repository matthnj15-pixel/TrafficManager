// Lightweight, deterministic pedestrian desire paths; NOT automatic built roads.
// Future footfall/terrain systems can replace these estimates without changing
// the authored road graph.
import {connectedEdgeIds,edgePoints,nodeAt} from "./road-network.mjs";

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function nearestPoint(p,points){
 let best=null,metric=Infinity;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
  const at={x:a.x+t*dx,y:a.y+t*dy},d=distance(p,at);
  if(d<metric){metric=d;best={point:at,distance:d};}
 }
 return best;
}
export function orphanComponents(g){
 const reached=connectedEdgeIds(g),edges=g.segments.filter(e=>!reached.has(e.id));
 const adjacency=new Map();
 for(const edge of edges){
  for(const id of [edge.a,edge.b]){
   if(!adjacency.has(id))adjacency.set(id,[]);
   adjacency.get(id).push(edge);
  }
 }
 const visited=new Set(),out=[];
 for(const id of adjacency.keys()){
  if(visited.has(id))continue;
  const queue=[id],nodes=new Set([id]),edgeIds=new Set();
  visited.add(id);
  for(let i=0;i<queue.length;i++){
   for(const edge of adjacency.get(queue[i])||[]){
    edgeIds.add(edge.id);
    const other=edge.a===queue[i]?edge.b:edge.a;
    if(!visited.has(other)){visited.add(other);nodes.add(other);queue.push(other);}
   }
  }
  out.push({nodes:[...nodes],edges:[...edgeIds]});
 }
 return out;
}
export function plannedDesirePaths(g){
 const connected=connectedEdgeIds(g);
 const primary=g.segments.filter(e=>connected.has(e.id)).map(e=>edgePoints(g,e));
 // No connected roads left: people can still walk from the protected gateway.
 if(!primary.length){const hub=nodeAt(g,g.hubId);if(hub)primary.push([hub,hub]);}
 const proposals=[];
 for(const component of orphanComponents(g)){
  let best=null;
  for(const id of component.nodes){
   const origin=nodeAt(g,id);
   for(const line of primary){
    const nearest=line.length===2&&line[0]===line[1]?{point:line[0],distance:distance(origin,line[0])}:nearestPoint(origin,line);
    if(nearest&&(!best||nearest.distance<best.length))
     best={nodeId:id,from:{x:origin.x,y:origin.y},to:nearest.point,length:nearest.distance};
   }
  }
  if(best)proposals.push(best);
 }
 return proposals;
}
export function advanceDesirePaths(state){
 const targets=plannedDesirePaths(state.roadGraph),previous=state.desirePaths||[],trails=[];
 for(const target of targets){
  const old=previous.find(path=>path.nodeId===target.nodeId);
  const progress=old?Math.min(1,old.progress+0.28):0.28;
  trails.push({...target,progress:Number(progress.toFixed(2))});
 }
 state.desirePaths=trails;
 return trails;
}
export function visibleDesirePaths(state){
 return (state.desirePaths||[]).map(path=>({from:path.from,to:lerp(path.from,path.to,path.progress),complete:path.progress>=1,nodeId:path.nodeId}));
}
export function validDesirePaths(paths){
 return paths===undefined||Array.isArray(paths)&&paths.length<=200&&paths.every(p=>
  Number.isInteger(p.nodeId)&&[p.from,p.to].every(q=>q&&Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.x>=0&&q.x<=1200&&q.y>=0&&q.y<=900)&&
  Number.isFinite(p.length)&&p.length>=0&&Number.isFinite(p.progress)&&p.progress>=0&&p.progress<=1);
}
