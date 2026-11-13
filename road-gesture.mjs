// Converts a long-press drag into a segment with a deliberate, editable curve.
// The hold location acts as a shaping point when extending from an existing node.
import {segmentDistance,distance} from "./simulation.mjs";
import {quadraticPoint} from "./road-network.mjs";
export const MIN_GESTURE_DISTANCE=25;
function p(x){return{x:x.x,y:x.y};}
export function gestureSegment(start,down,end,trace=[]){
 if(!start||!end||distance(start,end)<MIN_GESTURE_DISTANCE)return null;
 const trail=[down,...trace,end];
 let control=down;
 // When dragging directly from the starting point, estimate the actual
 // finger trajectory's midpoint rather than forcing a distorted curve.
 if(distance(start,down)<12){
  let total=0,segments=[];
  for(let i=1;i<trail.length;i++){const d=distance(trail[i-1],trail[i]);segments.push(d);total+=d;}
  let travelled=0,mid=trail[Math.floor(trail.length/2)];
  for(let i=1;i<trail.length;i++){
   if(travelled+segments[i-1]>=total/2){const t=segments[i-1]?(total/2-travelled)/segments[i-1]:0;mid={x:trail[i-1].x+(trail[i].x-trail[i-1].x)*t,y:trail[i-1].y+(trail[i].y-trail[i-1].y)*t};break;}
   travelled+=segments[i-1];
  }
  control={x:2*mid.x-(start.x+end.x)/2,y:2*mid.y-(start.y+end.y)/2};
 }
 const bowed=segmentDistance(control,start,end)>7;
 const curve=bowed?{x:Math.max(0,Math.min(1200,control.x)),y:Math.max(0,Math.min(900,control.y))}:null;
 return{start:p(start),end:p(end),control:curve};
}

// Anchored radial editor: touch-down is ALWAYS the node. The finger manipulates
// the curve control on the opposite side of that fixed anchor.
// Moving the finger farther increases radius without moving the endpoint.
export function radialCurveGesture(anchor,finger,{strength=1}={}){
 if(!anchor||!finger)return null;
 const dx=finger.x-anchor.x,dy=finger.y-anchor.y;
 const handle={x:Math.max(0,Math.min(1200,anchor.x-strength*dx)),
               y:Math.max(0,Math.min(900,anchor.y-strength*dy))};
 return{anchor:p(anchor),control:handle,radius:Math.hypot(handle.x-anchor.x,handle.y-anchor.y)};
}
// Starting a road with hold-drag sets the outgoing handle for its NEXT edge;
// holding at a later node shapes the incoming edge, without moving that node.
export function anchoredSegment(start,anchor,finger){
 const gesture=radialCurveGesture(anchor,finger);
 if(!gesture)return null;
 if(!start||distance(start,anchor)<12)return{anchor:gesture.anchor,control:gesture.control,pending:true};
 return{start:p(start),end:gesture.anchor,control:gesture.radius>8?gesture.control:null,pending:false};
}
