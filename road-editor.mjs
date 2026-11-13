import {WORLD,clamp,segmentDistance,distance} from "./simulation.mjs";

// Editing model is separate from committed road geometry. Only committed
// polylines are stored in v1 saves, keeping existing settlements compatible.
export const HOLD_MS=360;
export const MOVE_SLOP_PX=9;
export const HIT_RADIUS_PX=24;
export const MAX_ANCHORS=30;
export const CURVE_STEPS=14;

const copyPoint=p=>({x:p.x,y:p.y});
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const copySnapshot=d=>({
  anchors:d.anchors.map(copyPoint),
  controls:d.controls.map(c=>c?copyPoint(c):null)
});
const inside=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=WORLD.w&&p.y>=0&&p.y<=WORLD.h;
const quadratic=(a,c,b,t)=>({
  x:(1-t)*(1-t)*a.x+2*(1-t)*t*c.x+t*t*b.x,
  y:(1-t)*(1-t)*a.y+2*(1-t)*t*c.y+t*t*b.y
});
export function createRoadDraft(){return{anchors:[],controls:[],history:[]};}
export function addRoadAnchor(d,p){
  if(!inside(p)||d.anchors.length>=MAX_ANCHORS)return false;
  d.history.push(copySnapshot(d));
  if(d.anchors.length>0)d.controls.push(null);
  d.anchors.push(copyPoint(p));
  return true;
}
export function undoRoadAction(d){
  const previous=d.history.pop();
  if(!previous)return false;
  d.anchors=previous.anchors;
  d.controls=previous.controls;
  return true;
}
export function beginRoadBend(d,index){
  if(!Number.isInteger(index)||index<0||index>=d.controls.length)return null;
  d.history.push(copySnapshot(d));
  const a=d.anchors[index],b=d.anchors[index+1];
  return copyPoint(d.controls[index]||midpoint(a,b));
}
export function updateRoadBend(d,index,initialControl,down,current){
  if(!d.controls.length||index<0||index>=d.controls.length||!initialControl)return false;
  // The mid-point of a quadratic Bézier moves half as far as its control point.
  // Multiply the finger delta by two so the road follows the user's drag.
  d.controls[index]={
    x:clamp(initialControl.x+2*(current.x-down.x),0,WORLD.w),
    y:clamp(initialControl.y+2*(current.y-down.y),0,WORLD.h)
  };
  return true;
}
export function roadDraftPath(d){
  if(!d.anchors.length)return"";
  let result="M "+d.anchors[0].x+" "+d.anchors[0].y;
  for(let i=0;i<d.controls.length;i++){
    const b=d.anchors[i+1],c=d.controls[i];
    result+=c?" Q "+c.x+" "+c.y+" "+b.x+" "+b.y:" L "+b.x+" "+b.y;
  }
  return result;
}
export function flattenRoadDraft(d){
  if(!d.anchors.length)return[];
  const points=[copyPoint(d.anchors[0])];
  for(let i=0;i<d.controls.length;i++){
    const a=d.anchors[i],b=d.anchors[i+1],c=d.controls[i];
    if(c)for(let step=1;step<=CURVE_STEPS;step++)points.push(quadratic(a,c,b,step/CURVE_STEPS));
    else points.push(copyPoint(b));
  }
  return points;
}
export function curvePoint(d,index,t){
  const a=d.anchors[index],b=d.anchors[index+1],c=d.controls[index];
  return c?quadratic(a,c,b,t):{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}
export function curvedSegments(d){return d.controls.map((c,i)=>c?{index:i,anchor:curvePoint(d,i,.5),control:copyPoint(c)}:null).filter(Boolean);}
export function hitRoadSegment(d,p,radius){
  if(!Number.isFinite(radius)||radius<0)return -1;
  let best=radius,found=-1;
  for(let i=0;i<d.controls.length;i++){
    let prev=d.anchors[i];
    const n=d.controls[i]?CURVE_STEPS:1;
    for(let j=1;j<=n;j++){
      const next=curvePoint(d,i,j/n),dist=segmentDistance(p,prev,next);
      if(dist<=best){best=dist;found=i;}
      prev=next;
    }
  }
  return found;
}
export function canBeginCurve({mode,pointerCount,holdMs,movementPx,segmentIndex}){
  return mode==="road"&&pointerCount===1&&segmentIndex>=0&&
    holdMs>=HOLD_MS&&movementPx>=MOVE_SLOP_PX;
}
