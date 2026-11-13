import {IS_PREVIEW,FLAGS,SAVE_KEY} from "./config.mjs";
import {mountResourceBar,mountGameDock,createBuildRow,createButton,renderGameToast} from "./ui-components.mjs";
import {WORLD,BUILDINGS,clamp,distance,nearestRoad,roadCost,roadLength,seedValue,monthLabel,startGame,validState,placeBuilding,addRoad,buildRoad,removeRoadNode,removeRoadSegment,reshapeRoadSegment,makeRoadIntersection,accessibleRoads,structureAccess,advance} from "./simulation.mjs";
import {ensureGraph,nearestNode,nearestSegment,nodeAt,segmentAt,quadraticPoint,SNAP_RADIUS} from "./road-network.mjs";
import {radialCurveGesture} from "./road-gesture.mjs";
import {visibleDesirePaths} from "./desire-paths.mjs";
import {createRoadDraft,addRoadAnchor,undoRoadAction,beginRoadBend,updateRoadBend,roadDraftPath,flattenRoadDraft,curvedSegments,hitRoadSegment,canBeginCurve,HOLD_MS,MOVE_SLOP_PX,HIT_RADIUS_PX,MAX_ANCHORS} from "./road-editor.mjs";
const $=id=>document.getElementById(id),NS="http://www.w3.org/2000/svg",svg=$("map");
mountResourceBar($("resourceBar"),[
 {label:"People",value:"32",iconName:"people",id:"people"},
 {label:"Treasury",value:"740",iconName:"gold",id:"gold"},
 {label:"Food",value:"66",iconName:"food",id:"food"},
 {label:"Wood",value:"20",iconName:"wood",id:"wood"},
 {label:"Tools",value:"9",iconName:"tools",id:"tools"}
],{compact:true});
mountGameDock($("gameDock"));

let game=readSave(),mode="explore",draft=createRoadDraft(),selectedBuild=null,liveGesture=null,liveCurve=null,pendingControl=null;
let camera={cx:525,cy:445,scale:1},pointers=new Map(),gesture=null,toastTimer;
function readSave(){try{const v=JSON.parse(localStorage.getItem(SAVE_KEY));if(validState(v)){ensureGraph(v);return v;}}catch(e){console.warn("Save unavailable",e);}return startGame();}
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(game));}catch(e){notify("Storage unavailable. Use Export Save to preserve progress.");}}
function num(v){return Math.round(v).toLocaleString();}
function notify(message){renderGameToast($("toast"),message);clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").hidden=true,3300);}
function setMode(next){mode=next;draft=createRoadDraft();pendingControl=null;selectedBuild=null;for(const [m,id] of Object.entries({explore:"exploreBtn",road:"roadsBtn",build:"buildBtn"})){$(id).classList.toggle("active",m===next);$(id).setAttribute("aria-pressed",String(m===next));}
 $("roadControls").hidden=next!=="road";$("modeLabel").textContent={explore:"Explore · drag to pan · pinch to zoom",road:"Roads · tap for straight; hold and drag to shape a fixed node",build:"Construction · tap clear ground to place"}[next];
 updateRoadInfo();renderMap();}
function updateRoadInfo(){const cost=roadCost(flattenRoadDraft(draft));
 $("roadInfo").textContent=draft.anchors.length<2?"Tap an existing node to branch; touch and hold a point to shape its curve.":draft.anchors.length+" nodes · "+num(cost)+" gold · held nodes stay fixed; finger shapes curve.";
 $("confirmRoad").disabled=draft.anchors.length<2;}
function setStats(){for(const id of ["people","gold","food","wood","tools"])$(id).textContent=num(game[id]);$("calendar").textContent=monthLabel(game.turn);$("environment").textContent=IS_PREVIEW?"DEVELOPMENT":"STABLE";$("report").textContent=game.report;}
function node(tag,attrs){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
function appendText(parent,text,x,y,size,fill="#fff",extras={}){const e=node("text",{x,y,"text-anchor":"middle",fill,"font-size":size,...extras});e.textContent=text;parent.append(e);return e;}
// Committed roads are polylines; explicit curves are previewed with SVG Q segments.
function path(points){return points.map((p,i)=>(i===0?"M ":" L ")+p.x+" "+p.y).join("");}
function roadGraphic(parent,pts,preview=false,explicitPath=null){if(pts.length<2)return;const d=explicitPath||path(pts);
 parent.append(node("path",{d,fill:"none",stroke:preview?"#ffe5ae":"#738267","stroke-width":preview?27:32,"stroke-linejoin":"round","stroke-linecap":"round",opacity:preview?.76:1}));
 parent.append(node("path",{d,fill:"none",stroke:preview?"#fbd18d":"#d4c395","stroke-width":preview?15:19,"stroke-linejoin":"round","stroke-linecap":"round","stroke-dasharray":preview?"15 12":"none"}));}
function riverX(y){return 875-90*Math.sin((y+80)/145)+35*Math.sin(y/66);}
function renderMap(){const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const w=920/camera.scale,h=w*(rect.height/rect.width);
 camera.cx=w>=WORLD.w?WORLD.w/2:clamp(camera.cx,w/2,WORLD.w-w/2);
 camera.cy=h>=WORLD.h?WORLD.h/2:clamp(camera.cy,h/2,WORLD.h-h/2);
 svg.setAttribute("viewBox",[camera.cx-w/2,camera.cy-h/2,w,h].join(" "));svg.replaceChildren();
 const defs=node("defs",{}),g=node("linearGradient",{id:"ground",x1:"0",y1:"0",x2:"1",y2:"1"});
 g.append(node("stop",{offset:"0%","stop-color":"#c7d5a5"}),node("stop",{offset:"100%","stop-color":"#96b27b"}));defs.append(g);svg.append(defs);
 svg.append(node("rect",{x:0,y:0,width:WORLD.w,height:WORLD.h,fill:"url(#ground)"}));
 for(let i=0;i<22;i++){const x=seedValue(i+5)*WORLD.w,y=seedValue(i+107)*WORLD.h;
 svg.append(node("ellipse",{cx:x,cy:y,rx:60+seedValue(i+30)*95,ry:35+seedValue(i+44)*65,fill:i%2?"#a1bb85":"#b7c996",opacity:".48",transform:"rotate("+Math.round(seededAngle(i))+" "+x+" "+y+")"}));}
 // Shaded meadows and forest boundary.
 svg.append(node("path",{d:"M 0 0 L 710 0 Q 640 170 730 240 Q 690 300 800 310 L 670 300 Q 400 210 60 315 L 0 410 Z",fill:"#759e70",opacity:".21"}));
 let river="";for(let y=-30;y<=950;y+=15)river+=(y===-30?"M ":" L ")+riverX(y)+" "+y;
 svg.append(node("path",{d:river,fill:"none",stroke:"#6a9b95","stroke-width":122,"stroke-linejoin":"round","stroke-linecap":"round",opacity:".45"}));
 svg.append(node("path",{d:river,fill:"none",stroke:"#88bec4","stroke-width":91,"stroke-linejoin":"round","stroke-linecap":"round"}));
 svg.append(node("path",{d:river,fill:"none",stroke:"#c0dfd5","stroke-width":4,"stroke-linejoin":"round",opacity:".65","stroke-dasharray":"18 29"}));
 for(let i=0;i<190;i++){const x=18+seedValue(i+200)*1160,y=10+seedValue(i+510)*875;
 if((x>135&&x<730&&y>275&&y<660)||Math.abs(x-riverX(y))<77)continue;
 const r=8+seedValue(i+840)*12;
 svg.append(node("circle",{cx:x,cy:y,r:r,fill:i%4?"#527c55":"#456b4c",opacity:".88"}));
 svg.append(node("circle",{cx:x-r*.27,cy:y-r*.28,r:r*.72,fill:"#759869",opacity:".86"}));}
 for(const b of game.buildings)if(b.type==="farm"){svg.append(node("rect",{x:b.x-63,y:b.y-50,width:126,height:100,rx:5,fill:"#d9c58b",stroke:"#bea770","stroke-width":3,opacity:".81"}));for(let i=0;i<7;i++)svg.append(node("path",{d:"M "+(b.x-55)+" "+(b.y-38+i*12)+" l 110 0",stroke:"#a79d66","stroke-width":5,opacity:".65"}));}
 // Committed roads show persistent, editable nodes and curve handles.
 const graph=ensureGraph(game);
 // Pedestrian shortcuts grow after the month advances. They are not roads.
 for(const trail of visibleDesirePaths(game)){
   svg.append(node("path",{d:"M "+trail.from.x+" "+trail.from.y+" L "+trail.to.x+" "+trail.to.y,
    fill:"none",stroke:"#9f8256","stroke-width":6,"stroke-dasharray":"7 9","stroke-linecap":"round",opacity:".9"}));
 }
 for(const e of graph.segments){
   const a=nodeAt(graph,e.a),b=nodeAt(graph,e.b);
   if(!a||!b)continue;
   const geometry=e.control?"M "+a.x+" "+a.y+" Q "+(liveCurve?.id===e.id?liveCurve.control.x:e.control.x)+" "+(liveCurve?.id===e.id?liveCurve.control.y:e.control.y)+" "+b.x+" "+b.y:
     "M "+a.x+" "+a.y+" L "+b.x+" "+b.y;
   roadGraphic(svg,[a,b],false,geometry);
 }
 const previewPoints=flattenRoadDraft(draft);
 if(previewPoints.length>1)roadGraphic(svg,previewPoints,true,roadDraftPath(draft));
 if(liveGesture&&liveGesture.end){
   if(distance(liveGesture.start,liveGesture.end)>8)roadGraphic(svg,[liveGesture.start,liveGesture.end],true,
    "M "+liveGesture.start.x+" "+liveGesture.start.y+" Q "+liveGesture.control.x+" "+liveGesture.control.y+" "+liveGesture.end.x+" "+liveGesture.end.y);
   svg.append(node("path",{d:"M "+liveGesture.end.x+" "+liveGesture.end.y+" L "+liveGesture.control.x+" "+liveGesture.control.y,
      stroke:"#ffdf95","stroke-width":3,"stroke-dasharray":"4 6"}));
   svg.append(node("circle",{cx:liveGesture.end.x,cy:liveGesture.end.y,r:12,fill:"#fff0bd",stroke:"#3e6047","stroke-width":3}));
   svg.append(node("circle",{cx:liveGesture.control.x,cy:liveGesture.control.y,r:9,fill:"#ffae61",stroke:"#543e32","stroke-width":2}));
 }
 if(pendingControl&&draft.anchors.length){
   const anchor=draft.anchors.at(-1);
   svg.append(node("path",{d:"M "+anchor.x+" "+anchor.y+" L "+pendingControl.x+" "+pendingControl.y,
    stroke:"#ffdf95","stroke-width":3,"stroke-dasharray":"4 6"}));
   svg.append(node("circle",{cx:pendingControl.x,cy:pendingControl.y,r:9,fill:"#ffae61",stroke:"#543e32","stroke-width":2}));
 }
 for(const bend of curvedSegments(draft)){
   svg.append(node("circle",{cx:bend.anchor.x,cy:bend.anchor.y,r:9,fill:"#ffcf7c",stroke:"#445c43","stroke-width":2}));
 }
 if(mode==="road"){
   for(const e of graph.segments){
     if(!e.control)continue;
     const a=nodeAt(graph,e.a),b=nodeAt(graph,e.b);
     const middle=quadraticPoint(a,liveCurve?.id===e.id?liveCurve.control:e.control,b,.5);
     svg.append(node("circle",{cx:middle.x,cy:middle.y,r:12,fill:"#f3b969",stroke:"#364c40","stroke-width":3}));
   }
   for(const n of graph.nodes)svg.append(node("circle",{cx:n.x,cy:n.y,r:11,fill:"#d6e4ce",stroke:n.id===graph.hubId?"#bc783d":"#345840","stroke-width":3}));
 }
 for(const p of draft.anchors)svg.append(node("circle",{cx:p.x,cy:p.y,r:11,fill:"#fff1c2",stroke:"#53664b","stroke-width":3}));
 for(const h of game.houses){const access=structureAccess(game,h);svg.append(node("ellipse",{cx:h.x,cy:h.y+11,rx:20,ry:9,fill:"#445e3d",opacity:".25"}));
 svg.append(node("rect",{x:h.x-11,y:h.y-9,width:22,height:22,rx:2,fill:"#f2e2bc",stroke:access==="road"?"#aa9a78":access==="footpath"?"#e6a34d":"#c54f43","stroke-width":access==="road"?1.3:4}));
 svg.append(node("path",{d:"M "+(h.x-16)+" "+(h.y-10)+" L "+h.x+" "+(h.y-23)+" L "+(h.x+16)+" "+(h.y-10)+" Z",fill:"#a67353",stroke:"#7e654b","stroke-width":1.4}));
 svg.append(node("rect",{x:h.x+2,y:h.y,width:4,height:13,fill:"#826c52"}));if(access!=="road")appendText(svg,access==="footpath"?"~":"!",h.x+18,h.y-21,27,access==="footpath"?"#e4a34e":"#b93434",{"font-weight":"bold"});}
 for(const b of game.buildings){const shade={lumber:"#8f623c",farm:"#b98d49",smith:"#677777",park:"#658c57",plaza:"#b6a77d"}[b.type]||"#a18b68";const access=structureAccess(game,b),disconnected=access!=="road";
 svg.append(node("ellipse",{cx:b.x,cy:b.y+18,rx:28,ry:9,fill:"#455f3d",opacity:".33"}));
 svg.append(node("rect",{x:b.x-22,y:b.y-17,width:44,height:36,rx:3,fill:shade,stroke:access==="road"?"#fff1bb":access==="footpath"?"#e5a14b":"#cf614c","stroke-width":disconnected?5:3}));
 svg.append(node("path",{d:"M "+(b.x-26)+" "+(b.y-17)+" L "+b.x+" "+(b.y-33)+" L "+(b.x+26)+" "+(b.y-17)+" Z",fill:"#6a503c",stroke:"#4e4838","stroke-width":2}));
 appendText(svg,{farm:"F",lumber:"L",smith:"T",park:"P",plaza:"S"}[b.type],b.x,b.y+11,24,"#fff2cb",{"font-family":"Georgia,serif","font-weight":"bold"});if(disconnected)appendText(svg,access==="footpath"?"~":"!",b.x+26,b.y-28,31,access==="footpath"?"#e5a14b":"#c74734",{"font-weight":"bold"});}
 appendText(svg,"WILLOW VALLEY",475,265,25,"#416347",{"font-family":"Georgia,serif","letter-spacing":"3",opacity:".68"});
 const marker=node("circle",{cx:475,cy:286,r:3,fill:"#416347",opacity:".7"});svg.append(marker);
}
function seededAngle(i){return seedValue(i+60)*160;}
function zoom(factor){camera.scale=clamp(camera.scale*factor,.75,3.8);renderMap();}
function mapPoint(clientX,clientY){const r=svg.getBoundingClientRect(),w=920/camera.scale,h=w*(r.height/r.width);return{x:camera.cx-w/2+(clientX-r.left)/r.width*w,y:camera.cy-h/2+(clientY-r.top)/r.height*h};}
function refresh(){setStats();renderMap();updateRoadInfo();save();}
function openSheet(title,content){$("sheetTitle").textContent=title;const body=$("sheetBody");body.replaceChildren();if(typeof content==="string")body.innerHTML=content;else body.append(content);$("sheet").hidden=false;$("backdrop").hidden=false;}
function closeSheet(){$("sheet").hidden=true;$("backdrop").hidden=true;}
function sheetButton(parent,label,callback,cls="wide"){const b=createButton({label,variant:cls==="danger"?"danger":"secondary",onClick:callback});b.classList.add(cls);parent.append(b);return b;}
function textNode(tag,content,cls){const e=document.createElement(tag);e.textContent=content;if(cls)e.className=cls;return e;}
function buildPanel(){setMode("build");const el=document.createElement("div");el.append(textNode("p","Choose an industry, then tap clear land on the map. Buildings near roads produce more efficiently."));
 for(const [key,b]of Object.entries(BUILDINGS)){
 const button=createBuildRow({title:b.label,description:b.description,
 cost:b.gold+" gold · "+b.wood+" wood · "+b.tools+" tools",
 iconName:key==="lumber"?"wood":key==="farm"?"food":key==="park"?"tree":key==="plaza"?"people":key==="smith"?"tools":"house",
 onClick:()=>{selectedBuild=key;closeSheet();$("modeLabel").textContent="Place "+b.label+" · tap clear land";notify("Tap the map to place "+b.label+".");}});
 el.append(button);}
 openSheet("Construction",el);}
function menuPanel(){const el=document.createElement("div");el.append(textNode("p",IS_PREVIEW?"Development environment. Your save is isolated from the stable game.":"Stable environment. Your progress is stored locally on this device and browser."));
 sheetButton(el,"Export save as JSON",()=>{const blob=new Blob([JSON.stringify(game,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="willow-valley-"+(IS_PREVIEW?"dev":"stable")+"-turn-"+game.turn+".json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);notify("Save export started.");});
 sheetButton(el,"Import a saved game",()=>{$("importSave").click();});
 if(IS_PREVIEW&&location.protocol!=="file:"){
   const kit=document.createElement("a");
   kit.href="./ui-kit/";kit.className="download-link";
   kit.textContent="View the living UI kit";
   kit.setAttribute("aria-label","Open the interactive Willow Valley design system");
   el.append(kit);
 }
 if(location.protocol!=="file:"){
   const link=document.createElement("a");
   link.href="./offline.html";link.download="Willow-Valley-Offline.html";
   link.className="download-link";link.textContent="Download offline HTML edition";
   link.setAttribute("aria-label","Download the standalone HTML game for offline use");
   el.append(link);
 }
 sheetButton(el,"Restart settlement",()=>{if(confirm("Start a new settlement in this environment? Export your save first if you want to keep it.")){game=startGame();refresh();closeSheet();notify("A new Willow Valley begins.");}});
 el.append(textNode("p","Willow Valley is an offline-first strategy game. All simulation turns run on your device, without accounts or cloud AI.","note"));
 openSheet("Your settlement",el);}
function historyPanel(){const el=document.createElement("div");el.append(textNode("p","Significant milestones and monthly decisions in the life of Willow Valley."));const list=document.createElement("ol");for(const message of game.logs.slice(0,25))list.append(textNode("li",message));el.append(list);openSheet("Valley history",el);}
function inspectPoint(p){const objects=[...game.buildings.map(b=>({...b,kind:"building"})),...game.houses.map(h=>({...h,kind:"house"}))].sort((a,b)=>distance(p,a)-distance(p,b));const item=objects[0];if(item&&distance(p,item)<35){const access=structureAccess(game,item);const detail=item.kind==="house"?"Household access: "+(access==="road"?"Connected to the town road network.":access==="footpath"?"Only a walking desire path connects this home; services and tax revenue are limited.":"DISCONNECTED. The household cannot receive normal services or contribute full taxes."):"Structure access: "+(access==="road"?"Connected to the road network.":access==="footpath"?"Footpath access only. This does not support full service or deliveries.":"DISCONNECTED: no road service or industrial deliveries.");openSheet(item.kind==="house"?"Village home":BUILDINGS[item.type].label,"<p>"+detail+"</p>");}}
const roadPixelRadius=()=>{const r=svg.getBoundingClientRect();return HIT_RADIUS_PX*(920/camera.scale)/r.width;};
function nodePanel(n){
 const el=document.createElement("div");
 const attached=game.roadGraph.segments.filter(e=>e.a===n.id||e.b===n.id).length;
 el.append(textNode("p","Existing road junction. "+attached+" connected segment(s). Roads can be extended or removed without refund."));
 sheetButton(el,"Extend road from here",()=>{
  draft=createRoadDraft();pendingControl=null;addRoadAnchor(draft,{x:n.x,y:n.y});
  closeSheet();updateRoadInfo();renderMap();notify("Tap to create straight segments, or hold and drag for a curve.");
 });
 if(n.id===game.roadGraph.hubId)el.append(textNode("p","The original village gateway is protected as the connection origin.","note"));
 else sheetButton(el,"Destroy this junction and attached segments",()=>{
  if(!confirm("Remove this road node and all "+attached+" attached segments? Industries may lose access. No refund."))return;
  const result=removeRoadNode(game,n.id);closeSheet();
  if(!result.ok){notify(result.reason);return;}
  draft=createRoadDraft();pendingControl=null;refresh();notify("Road junction removed, with no refund.");
 });
 openSheet("Existing road junction",el);
}
function segmentPanel(hit){
 const el=document.createElement("div");
 el.append(textNode("p","This road is already built. You can add an intersection, extend from it, or remove the segment."));
 sheetButton(el,"Insert a junction here and extend",()=>{
  const result=makeRoadIntersection(game,hit.segment.id,hit.t);if(!result.ok){notify(result.reason);return;}
  draft=createRoadDraft();addRoadAnchor(draft,{x:result.node.x,y:result.node.y});
  closeSheet();refresh();notify("Junction added. Tap or hold and drag to extend this road.");
 });
 sheetButton(el,"Destroy this segment (no refund)",()=>{
  if(!confirm("Destroy this existing road segment? Isolated roads and industries may stop functioning. No refund."))return;
  const outcome=removeRoadSegment(game,hit.segment.id);closeSheet();
  if(!outcome.ok){notify(outcome.reason);return;}
  draft=createRoadDraft();refresh();notify("Road removed. Check industry access.");
 });
 openSheet("Existing road segment",el);
}
function curvePanel(e){
 const el=document.createElement("div");
 el.append(textNode("p","This is an editable curve node. Press, hold, and drag the orange handle to reshape the built road."));
 sheetButton(el,"Straighten this segment",()=>{
  const outcome=reshapeRoadSegment(game,e.id,null);closeSheet();
  if(!outcome.ok){notify(outcome.reason);return;}
  refresh();notify("Curve straightened. No charge or refund.");
 });
 sheetButton(el,"Destroy this segment (no refund)",()=>{
  if(!confirm("Remove this curved road segment? No refund."))return;
  removeRoadSegment(game,e.id);closeSheet();refresh();
 });
 openSheet("Existing curve",el);
}
function hitBuiltCurve(p,radius){
 const g=game.roadGraph;let best=null,minimum=radius;
 for(const e of g.segments){
  if(!e.control)continue;
  const a=nodeAt(g,e.a),b=nodeAt(g,e.b),q=quadraticPoint(a,e.control,b,.5),d=distance(q,p);
  if(d<=minimum){minimum=d;best={segment:e,point:q};}
 }
 return best;
}
function handleTap(p){if(p.x<0||p.y<0||p.x>WORLD.w||p.y>WORLD.h)return;
 if(mode==="road"){
  const radius=roadPixelRadius(),near=nearestNode(game.roadGraph,p,radius);
  if(draft.anchors.length===0){
   if(near){nodePanel(near);return;}
   const curve=hitBuiltCurve(p,radius);
   if(curve){curvePanel(curve.segment);return;}
   const segment=nearestSegment(game.roadGraph,p,radius);
   if(segment){segmentPanel(segment);return;}
  }
  if(draft.anchors.length>=MAX_ANCHORS){notify("Road has reached its node limit.");return;}
  const chosen=near||p;
  if(draft.anchors.length&&distance(draft.anchors.at(-1),chosen)<8){notify("Choose a new location for the next road node.");return;}
  if(!addRoadAnchor(draft,{x:Math.round(chosen.x),y:Math.round(chosen.y)})){notify("Tap inside the map.");return;}
  if(pendingControl&&draft.controls.length)draft.controls[draft.controls.length-1]=pendingControl;
  pendingControl=null;
  updateRoadInfo();renderMap();return;
 }
 if(mode==="build"){if(!selectedBuild){buildPanel();return;}const r=placeBuilding(game,selectedBuild,p);if(!r.ok){notify(r.reason);return;}refresh();notify(BUILDINGS[selectedBuild].label+" constructed.");selectedBuild=null;setMode("explore");return;}
 inspectPoint(p);
}
function clearHold(p){if(p.holdTimer!==null){clearTimeout(p.holdTimer);p.holdTimer=null;}}
function downPointer(e){
 if(e.pointerType==="mouse"&&e.button!==0)return;
 e.preventDefault();svg.setPointerCapture(e.pointerId);
 const down=mapPoint(e.clientX,e.clientY),radius=roadPixelRadius(),g=game.roadGraph;
 const n=mode==="road"?nearestNode(g,down,radius):null;
 const bend=mode==="road"&&!n&&draft.anchors.length===0?hitBuiltCurve(down,radius):null;
 const draftIndex=mode==="road"&&!n&&!bend?hitRoadSegment(draft,down,radius): -1;
 const hit={node:n,builtCurve:bend,segmentIndex:draftIndex};
 const p={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,down,moved:false,
  holdReady:false,holdTimer:null,curveActive:false,gestureActive:false,initialControl:null,hit,trail:[]};
 pointers.set(e.pointerId,p);
 if(pointers.size===2){
   for(const entry of pointers.values()){clearHold(entry);entry.holdReady=false;entry.moved=true;}
   const [a,b]=[...pointers.values()];gesture={distance:distance(a,b),scale:camera.scale};
 }else if(mode==="road"){
   p.holdTimer=setTimeout(()=>{
    if(pointers.size===1&&pointers.get(e.pointerId)===p&&!p.moved&&mode==="road"){
      p.holdReady=true;$("modeLabel").textContent="Road gesture active · drag to shape";
    }
   },HOLD_MS);
 }
}
function movePointer(e){
 const p=pointers.get(e.pointerId);if(!p)return;e.preventDefault();
 const dx=e.clientX-p.x,dy=e.clientY-p.y,travel=Math.hypot(e.clientX-p.startX,e.clientY-p.startY);
 p.x=e.clientX;p.y=e.clientY;
 if(pointers.size===2){
   const [a,b]=[...pointers.values()];
   if(gesture)camera.scale=clamp(gesture.scale*distance(a,b)/Math.max(gesture.distance,10),.75,3.8);
   renderMap();return;
 }
 if(mode==="road"&&p.holdReady&&travel>=MOVE_SLOP_PX){
   p.moved=true;clearHold(p);
   if(p.hit.segmentIndex>=0){
     if(!p.curveActive){p.initialControl=beginRoadBend(draft,p.hit.segmentIndex);p.curveActive=true;}
     updateRoadBend(draft,p.hit.segmentIndex,p.initialControl,p.down,mapPoint(e.clientX,e.clientY));
   }else if(p.hit.builtCurve){
     const eId=p.hit.builtCurve.segment.id,initial=p.hit.builtCurve.segment.control;
     const current=mapPoint(e.clientX,e.clientY);
     const c={x:clamp(initial.x+2*(current.x-p.down.x),0,WORLD.w),y:clamp(initial.y+2*(current.y-p.down.y),0,WORLD.h)};
     liveCurve={id:eId,control:c};p.curveActive=true;
   }else{
     // The node is fixed at touch-down. Finger motion only sets its opposite
     // radial curve control, never the endpoint position.
     const anchor=p.hit.node||p.down;
     const radial=radialCurveGesture(anchor,mapPoint(e.clientX,e.clientY));
     const previous=draft.anchors.at(-1)||anchor;
     liveGesture={start:previous,end:anchor,control:radial.control,radius:radial.radius};
     p.gestureActive=true;
   }
   updateRoadInfo();renderMap();return;
 }
 if(travel>MOVE_SLOP_PX&&!p.holdReady){
   p.moved=true;clearHold(p);
   const rect=svg.getBoundingClientRect(),w=920/camera.scale;
   camera.cx-=dx/rect.width*w;camera.cy-=dy/rect.width*w*(rect.height/rect.width);
   renderMap();
 }
}
function endPointer(e){
 const p=pointers.get(e.pointerId);if(!p)return;
 clearHold(p);const tap=!p.moved&&!p.holdReady&&pointers.size===1;
 pointers.delete(e.pointerId);if(pointers.size<2)gesture=null;
 if(p.curveActive&&p.hit.builtCurve&&liveCurve){
   const outcome=reshapeRoadSegment(game,liveCurve.id,liveCurve.control);
   if(!outcome.ok)notify(outcome.reason);else refresh();
 }else if(p.gestureActive&&liveGesture&&mode==="road"){
   const geometry=liveGesture;
   const anchor=geometry.end;
   if(!draft.anchors.length){
     // First held point becomes the starting node. Its radial handle shapes
     // the NEXT road segment when a second node is subsequently tapped.
     addRoadAnchor(draft,{x:Math.round(anchor.x),y:Math.round(anchor.y)});
     pendingControl=geometry.radius>8?geometry.control:null;
   }else if(distance(draft.anchors.at(-1),anchor)>8){
     if(addRoadAnchor(draft,{x:Math.round(anchor.x),y:Math.round(anchor.y)})){
       draft.controls[draft.controls.length-1]=geometry.radius>8?geometry.control:null;
       pendingControl=null;
     }
   }else{
     // Holding the latest node is an outgoing curve-handle edit.
     pendingControl=geometry.radius>8?geometry.control:null;
   }
   updateRoadInfo();
 }
 liveGesture=null;liveCurve=null;
 if(mode==="road")$("modeLabel").textContent="Roads · tap for straight; hold and drag to shape a fixed node";
 if(tap)handleTap(mapPoint(e.clientX,e.clientY));
 renderMap();
}
function cancelPointer(e){const p=pointers.get(e.pointerId);if(p)clearHold(p);pointers.delete(e.pointerId);
 if(pointers.size<2)gesture=null;liveGesture=null;liveCurve=null;renderMap();}
svg.addEventListener("pointerdown",downPointer);
svg.addEventListener("pointermove",movePointer);
svg.addEventListener("pointerup",endPointer);
svg.addEventListener("pointercancel",cancelPointer);
$("zoomIn").onclick=()=>zoom(1.32);$("zoomOut").onclick=()=>zoom(1/1.32);
$("exploreBtn").onclick=()=>setMode("explore");
$("roadsBtn").onclick=()=>setMode("road");
$("buildBtn").onclick=()=>buildPanel();
$("menuBtn").onclick=()=>menuPanel();
$("historyBtn").onclick=()=>historyPanel();
$("closeSheet").onclick=closeSheet;$("backdrop").onclick=closeSheet;
$("undoRoad").onclick=()=>{pendingControl=null;undoRoadAction(draft);updateRoadInfo();renderMap();};
$("cancelRoad").onclick=()=>{draft=createRoadDraft();pendingControl=null;updateRoadInfo();renderMap();};
$("confirmRoad").onclick=()=>{const r=buildRoad(game,draft.anchors,draft.controls);if(!r.ok){notify(r.reason);return;}draft=createRoadDraft();pendingControl=null;refresh();notify(r.isolated?"Isolated street built. Sims will begin forming walking desire paths next month.":"Road built for "+r.cost+" gold"+(r.intersections?". "+r.intersections+" new intersection(s).":"."));};
$("nextBtn").onclick=()=>{const result=advance(game,{events:FLAGS.monthlyEvents});refresh();notify(monthLabel(game.turn)+": "+(result.populationDelta>=0?"+":"")+result.populationDelta+" residents, "+(result.balance>=0?"+":"")+result.balance+" gold.");};
$("importSave").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const imported=JSON.parse(await f.text());if(!validState(imported))throw Error("Unsupported or invalid save file.");if(!confirm("Replace this environment's current game with the imported save?"))return;game=imported;closeSheet();refresh();notify("Save imported successfully.");}catch(err){notify(err.message||"Could not import save.");}finally{e.target.value="";}});
window.addEventListener("resize",renderMap);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet();});
setStats();save();requestAnimationFrame(renderMap);

// Cache the complete game shell while connected, then play offline in flight mode.
// A standalone downloaded HTML file skips the worker and uses its embedded assets.
if(location.protocol==="file:"){
 $("offlineStatus").textContent="LOCAL OFFLINE EDITION";
}else if("serviceWorker" in navigator &&
 (location.protocol==="https:"||["localhost","127.0.0.1"].includes(location.hostname))){
 $("offlineStatus").textContent="PREPARING OFFLINE MODE";
 navigator.serviceWorker.register("./sw.js",{scope:"./"})
  .then(()=>navigator.serviceWorker.ready)
  .then(()=>{$("offlineStatus").textContent="OFFLINE READY";})
  .catch(error=>{$("offlineStatus").textContent="OFFLINE UNAVAILABLE";console.warn("Offline setup failed",error);});
}else{
 $("offlineStatus").textContent="LOCAL GAME";
}
