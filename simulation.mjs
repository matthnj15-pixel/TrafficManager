import {ensureGraph,validGraph,graphLines,addGeometry,deleteNode,deleteSegment,setSegmentCurve,saveGraphRoads,splitSegment} from "./road-network.mjs";
import {advanceDesirePaths,visibleDesirePaths,validDesirePaths} from "./desire-paths.mjs";
export const VERSION=1;
export const WORLD={w:1200,h:900};
export const BUILDINGS={
  lumber:{label:"Lumber camp",gold:110,wood:4,tools:1,upkeep:7,description:"Produces 7 wood per month."},
  farm:{label:"Farm",gold:120,wood:5,tools:1,upkeep:8,description:"Produces 12 food per month."},
  smith:{label:"Toolsmith",gold:175,wood:8,tools:3,upkeep:15,description:"Consumes 4 wood to produce 3 tools."},
  park:{label:"Park",gold:85,wood:3,tools:0,upkeep:5,description:"Improves happiness when connected to a road."},
  plaza:{label:"Plaza",gold:135,wood:6,tools:1,upkeep:9,description:"A gathering place that improves happiness when accessible."}
};
export const MONTHS=["March","April","May","June","July","August","September","October","November","December","January","February"];
export function monthLabel(turn){return MONTHS[turn%12]+" · Year "+(1+Math.floor(turn/12));}
export function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
export function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
export function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/d,0,1):0;return distance(p,{x:a.x+dx*t,y:a.y+dy*t});}
export function nearestRoad(p,roads){let best=Infinity;for(const r of roads)for(let i=1;i<r.length;i++)best=Math.min(best,segmentDistance(p,r[i-1],r[i]));return best;}
export function roadLength(points){let sum=0;for(let i=1;i<points.length;i++)sum+=distance(points[i-1],points[i]);return sum;}
export function roadCost(points){return Math.ceil(roadLength(points)*0.18);}
export function seedValue(n){const x=Math.sin(n*38.217+14.57)*43758.5453;return x-Math.floor(x);}
export function startGame(){const state={
  version:VERSION,turn:0,people:32,gold:740,food:66,wood:20,tools:9,
  roads:[[{x:172,y:472},{x:330,y:417},{x:460,y:454},{x:656,y:383}]],
  buildings:[{type:"lumber",x:288,y:340},{type:"farm",x:530,y:553}],
  houses:[{x:242,y:505},{x:350,y:374},{x:418,y:497},{x:545,y:400}],
  happiness:76,desirePaths:[],
  logs:["The first families establish Willow Valley beside an old forest road."],
  report:"Your town has supplies for its first expansion. Design a new road or develop another industry."
};ensureGraph(state);return state;}
export function validState(x){return !!x&&x.version===VERSION&&Number.isInteger(x.turn)&&x.turn>=0&&x.turn<200000&&
 ["people","gold","food","wood","tools","happiness"].every(k=>Number.isFinite(x[k]))&&
 Array.isArray(x.roads)&&x.roads.length<500&&x.roads.every(r=>Array.isArray(r)&&r.length>=2&&r.length<=512&&r.every(validPoint))&&
 Array.isArray(x.buildings)&&x.buildings.length<300&&x.buildings.every(b=>BUILDINGS[b.type]&&validPoint(b))&&
 Array.isArray(x.houses)&&x.houses.length<2000&&x.houses.every(validPoint)&&Array.isArray(x.logs)&&(!x.roadGraph||validGraph(x.roadGraph))&&validDesirePaths(x.desirePaths);}
function validPoint(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=WORLD.w&&p.y>=0&&p.y<=WORLD.h;}
function riverX(y){return 875-90*Math.sin((y+80)/145)+35*Math.sin(y/66);}
function onRiver(p){return Math.abs(p.x-riverX(p.y))<69;}
function occupied(s,p){return [...s.buildings,...s.houses].some(b=>distance(b,p)<57);}
export function canPlace(s,p){return validPoint(p)&&!onRiver(p)&&!occupied(s,p)&&p.x>25&&p.y>30&&p.x<WORLD.w-25&&p.y<WORLD.h-30;}
export function placeBuilding(s,type,p){const b=BUILDINGS[type];if(!b)return{ok:false,reason:"Unknown building type."};
 if(!canPlace(s,p))return{ok:false,reason:"Choose clear land away from buildings and the river."};
 if(s.gold<b.gold||s.wood<b.wood||s.tools<b.tools)return{ok:false,reason:"Insufficient treasury, wood, or tools."};
 s.gold-=b.gold;s.wood-=b.wood;s.tools-=b.tools;s.buildings.push({type,x:Math.round(p.x),y:Math.round(p.y)});
 s.report=b.label+" established. Road access affects monthly production.";s.logs.unshift(monthLabel(s.turn)+": "+b.label+" built.");return{ok:true};}
// Legacy polyline entry point and new authored-geometry entry point.
export function addRoad(s,points){return buildRoad(s,points,points.slice(1).map(()=>null));}
export function buildRoad(s,anchors,controls){
 if(!Array.isArray(anchors)||anchors.length<2||anchors.length>512||!Array.isArray(controls)||controls.length!==anchors.length-1||!anchors.every(validPoint)||controls.some(c=>c!==null&&!validPoint(c)))return{ok:false,reason:"Choose valid road nodes."};
 const graph=structuredClone(ensureGraph(s));const result=addGeometry(graph,anchors,controls);
 if(!result.ok)return result;
 const newLines=graphLines(graph);
 const oldLength=s.roads.reduce((n,r)=>n+roadLength(r),0),newLength=newLines.reduce((n,r)=>n+roadLength(r),0)-oldLength;
 if(newLength<28)return{ok:false,reason:"Road must be at least 28 map units long."};
 const cost=Math.ceil(newLength*.18);
 if(s.gold<cost)return{ok:false,reason:"You need "+cost+" gold to build this road."};
 s.gold-=cost;s.roadGraph=graph;saveGraphRoads(s);
 s.report=result.isolated?"Isolated road built. No sims can reach it directly yet. Desire paths will form as people walk toward it.":"Road completed. Crossings become real intersections and improve connected access.";
 s.logs.unshift(monthLabel(s.turn)+": Road built for "+cost+" gold.");
 return{ok:true,cost,isolated:result.isolated,intersections:result.intersections};
}
export function removeRoadNode(s,id){
 const outcome=deleteNode(ensureGraph(s),id);if(!outcome.ok)return outcome;
 saveGraphRoads(s);s.report="Road junction removed. Industries without a connected road cannot produce.";
 s.logs.unshift(monthLabel(s.turn)+": Road node removed with "+outcome.removed+" segments. No refund.");return outcome;
}
export function removeRoadSegment(s,id){
 const outcome=deleteSegment(ensureGraph(s),id);if(!outcome.ok)return outcome;
 saveGraphRoads(s);s.report="Road segment removed. Check whether your industries remain connected.";
 s.logs.unshift(monthLabel(s.turn)+": Road segment removed. No refund.");return outcome;
}
export function reshapeRoadSegment(s,id,control){
 if(!setSegmentCurve(ensureGraph(s),id,control))return{ok:false,reason:"Could not reshape the road."};
 saveGraphRoads(s);s.report="Road shape updated without direct charge or refund.";
 s.logs.unshift(monthLabel(s.turn)+": Road curve adjusted.");return{ok:true};
}
export function makeRoadIntersection(s,id,t){
 const node=splitSegment(ensureGraph(s),id,t);
 if(!node)return{ok:false,reason:"Choose a location away from the road's ends."};
 saveGraphRoads(s);return{ok:true,node};
}
export function accessibleRoads(s){return s.roadGraph?graphLines(s.roadGraph,true):s.roads;}
// Every structure requires access. Footpaths support some pedestrians but
// do not substitute for built roads needed by industry.
export function structureAccess(s,p){
 const connected=accessibleRoads(s);
 if(nearestRoad(p,connected)<=125)return"road";
 const trails=visibleDesirePaths(s).filter(t=>t.complete);
 if(!trails.length)return"none";
 const nearTrail=nearestRoad(p,trails.map(t=>[t.from,t.to]))<=66;
 const isolatedRoads=s.roadGraph?graphLines(s.roadGraph).filter(line=>!connected.includes(line)&&nearestRoad(line[0],connected)>125):[];
 const nearIsolated=nearestRoad(p,isolatedRoads)<=110;
 return nearTrail||nearIsolated?"footpath":"none";
}
function productionAccess(s,b){return structureAccess(s,b)==="road"?1:0;}
export function housingAccess(s){return s.houses.map(h=>structureAccess(s,h));}
function housingSite(s){for(let k=0;k<130;k++){const lines=accessibleRoads(s);if(!lines.length)return null;const i=(s.turn*13+k*23)%997,r=lines[i%lines.length],seg=i%(r.length-1),a=r[seg],b=r[seg+1],t=.17+seedValue(i+800)*.66;
 const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,n=Math.hypot(b.y-a.y,b.x-a.x)||1,sgn=seedValue(i+40)<.5?-1:1;
 const p={x:Math.round(x+(b.y-a.y)/n*sgn*49),y:Math.round(y-(b.x-a.x)/n*sgn*49)};
 if(canPlace(s,p))return p;}return null;}
export function advance(s,{events=true}={}){s.turn++;const notices=[],oldPeople=s.people;
 advanceDesirePaths(s);
 let foodProduction=0,woodProduction=0,toolProduction=0,upkeep=0,smiths=[];
 for(const b of s.buildings){const access=productionAccess(s,b),v=BUILDINGS[b.type];upkeep+=v.upkeep;
  if(!access)notices.push(v.label+" has no reachable road connection.");
  if(b.type==="farm")foodProduction+=Math.round(12*access);
  if(b.type==="lumber")woodProduction+=Math.round(7*access);
  if(b.type==="smith")smiths.push(access);
  if((b.type==="park"||b.type==="plaza")&&access)s.happiness=clamp(s.happiness+1,0,100);}
 s.food+=foodProduction;s.wood+=woodProduction;
 for(const access of smiths){if(!access){notices.push("Toolsmith cannot receive supplies without road access.");continue;}if(s.wood>=4){s.wood-=4;const n=Math.max(1,Math.round(3*access));s.tools+=n;toolProduction+=n;}else notices.push("The toolsmith could not obtain enough wood.");}
 const foodRequired=Math.ceil(s.people*.22);s.food-=foodRequired;
 const houseStatuses=housingAccess(s),servedHomes=houseStatuses.filter(x=>x==="road").length,walkingHomes=houseStatuses.filter(x=>x==="footpath").length;
 const serviceRate=s.houses.length?(servedHomes+walkingHomes*.4)/s.houses.length:0;
 if(servedHomes<s.houses.length){s.happiness=clamp(s.happiness-2,0,100);notices.push("Some homes have lost road access. Household taxes and happiness have fallen.");}
 const taxes=Math.round(s.people*1.5*serviceRate),roadUpkeep=Math.ceil(s.roads.reduce((v,r)=>v+roadLength(r),0)*.018);s.gold+=taxes-upkeep-roadUpkeep;
 if(events&&s.turn%6===0){s.food+=8;notices.push("A seasonal harvest added 8 food.");}
 if(s.food<0){s.food=0;s.people=Math.max(8,s.people-3);s.happiness=clamp(s.happiness-8,0,100);notices.push("A food shortage drove three residents away.");}
 else if(s.food>=8&&s.happiness>=42){const site=housingSite(s);if(site){s.houses.push(site);s.people+=3;s.happiness=clamp(s.happiness+1,0,100);notices.push("A new home appeared along your road network.");}}
 if(s.food<12){s.happiness=clamp(s.happiness-3,0,100);notices.push("Food reserves are running low.");}
 if(s.gold<0){s.happiness=clamp(s.happiness-4,0,100);notices.push("The treasury is in deficit.");}
 const net=s.people-oldPeople,balance=taxes-upkeep-roadUpkeep;
 if(s.desirePaths.some(p=>p.progress>=1))notices.push("Residents have established walking desire paths to isolated roads.");
 s.report="+"+foodProduction+" food, +"+woodProduction+" wood, +"+toolProduction+" tools. "+(balance>=0?"+":"")+balance+" gold net. "+(net>=0?"+":"")+net+" residents."+ (notices.length?" "+notices[0]:"");
 s.logs.unshift(monthLabel(s.turn)+": "+s.report);
 if(s.logs.length>60)s.logs.length=60;
 return{foodProduction,woodProduction,toolProduction,foodRequired,balance,populationDelta:net,notices};}
