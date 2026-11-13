import {
 UI_VERSION,PALETTE,icon,createButton,createResourceChip,createNavTool,
 createStatusPill,createAlert,createBuildRow,createToggle,createTabs,
 createPanel,createToast,createSheetPreview,createDialogActions,createAdvanceButton,mountResourceBar
} from "../ui-components.mjs";
const $=id=>document.getElementById(id);
const color=value=>value.trim().replace(/\s/g,"");
function rgbToHex(input){
 const m=input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
 return m?"#"+[m[1],m[2],m[3]].map(n=>Number(n).toString(16).padStart(2,"0")).join("").toUpperCase():input;
}
for(const spec of PALETTE){
 const hex=rgbToHex(getComputedStyle(document.documentElement).getPropertyValue(spec.token));
 const item=document.createElement("article");item.className="kit-swatch";
 const swatch=document.createElement("span");swatch.className="kit-swatch__color";swatch.style.backgroundColor="var("+spec.token+")";
 const copy=document.createElement("span");copy.className="kit-swatch__details";
 const title=document.createElement("strong");title.textContent=spec.name;
 const role=document.createElement("small");role.textContent=spec.role;
 const value=document.createElement("code");value.textContent=hex;
 copy.append(title,role,value);item.append(swatch,copy);$("palette").append(item);
}
const choices=[
 ["Primary","primary","house"],
 ["Secondary","secondary","map"],
 ["Ghost","ghost","info"],
 ["Danger","danger","error"],
 ["Disabled","primary","house"]
];
for(const [name,variant,iconName] of choices){
 const row=document.createElement("div");row.className="kit-row";
 const label=document.createElement("span");label.textContent=name;
 const b=createButton({label:variant==="danger"?"Demolish":variant==="secondary"?"Open Map":variant==="ghost"?"Details":"Build",variant,iconName,
 disabled:name==="Disabled",onClick:()=>{$("buttonFeedback").textContent=name+" button clicked — same component API as the game.";}});
 row.append(label,b);$("buttonGallery").append(row);
}
let activeNav="Build";
for(const [label,iconName] of [["Build","house"],["Roads","roads"],["Map","map"],["Tasks","tasks"],["Citizens","people"]]){
 const button=createNavTool({label,iconName,active:label===activeNav,compact:true,onClick:()=>{
  activeNav=label;for(const b of $("navigationGallery").children){
   const active=b.getAttribute("aria-label")===label;b.classList.toggle("active",active);
   b.setAttribute("aria-pressed",String(active));
  }
 }});
 $("navigationGallery").append(button);
}
$("tabGallery").append(createTabs({onChange:(_,label)=>{$("tabFeedback").textContent="Selected: "+label;}}));
const resources=[
 {label:"Treasury",value:"1,240",iconName:"gold",delta:"+32/mo"},
 {label:"Wood",value:"86",iconName:"wood",delta:"+12/mo"},
 {label:"Food",value:"66",iconName:"food",delta:"+8/mo"},
 {label:"People",value:"32",iconName:"people",delta:"+3/mo"},
 {label:"Tools",value:"9",iconName:"tools",delta:"+2/mo"}
];
mountResourceBar($("resourceGallery"),resources,{compact:true});
for(const spec of [
 {text:"Constructing",variant:"success",iconName:"food"},
 {text:"Upgrade ready",variant:"info",iconName:"tools"},
 {text:"3 / 4 workers",variant:"warning",iconName:"people"},
 {text:"5m 30s",variant:"neutral",iconName:"tasks"}
])$("statusGallery").append(createStatusPill(spec));
for(const item of [
 {text:"Building completed!",variant:"success"},
 {text:"New citizens have arrived.",variant:"info"},
 {text:"Not enough resources.",variant:"warning"},
 {text:"A road is disconnected.",variant:"danger"}
])$("alertGallery").append(createAlert(item));
for(const item of [
 {text:"So cozy here!",variant:"success",iconName:"smile"},
 {text:"Lovely town!",variant:"info",iconName:"heart"},
 {text:"Need more homes!",variant:"warning",iconName:"warning"}
])$("emoteGallery").append(createStatusPill(item));
function showToast(){
 $("toastGallery").replaceChildren(createToast({title:"House constructed!",detail:"3 citizens joined your town."}));
}
showToast();
const gallery=[
 {title:"House",description:"A cozy home for citizens.",cost:"20 wood · 10 stone · 50 gold",iconName:"house"},
 {title:"Lumber camp",description:"Harvests timber near the forest.",cost:"75 gold · 8 tools",iconName:"wood"}
];
for(const item of gallery)$("buildGallery").append(createBuildRow({...item,onClick:()=>openSheet(item.title,item.description)}));
$("toggleGallery").append(createToggle({label:"Music",checked:true}),createToggle({label:"Sound effects",checked:true}),createToggle({label:"Vibration",checked:false}));
$("volume").addEventListener("input",e=>{$("volumeValue").textContent=e.target.value+"%";});
const backdrop=$("modalBackdrop");
function closeSheet(){backdrop.replaceChildren();backdrop.hidden=true}
function openSheet(title,description){
 backdrop.hidden=false;
 const content=document.createElement("div");
 const p=document.createElement("p");p.textContent=description||"Every building contributes to your settlement.";
 content.append(p);
 const actions=createDialogActions({
  primaryLabel:"Build",secondaryLabel:"Cancel",primaryIcon:"house",
  onPrimary:()=>{closeSheet();showToast();},onSecondary:closeSheet
 });
 const sheet=createSheetPreview({title,body:content,footer:actions});
 backdrop.replaceChildren(sheet);
 sheet.querySelector('[aria-label="Close"]').addEventListener("click",closeSheet);
}
$("sheetButton").append(createButton({label:"Open build menu",variant:"primary",iconName:"house",onClick:()=>openSheet("Construction","Choose the next addition to your settlement.")}));
backdrop.addEventListener("click",e=>{if(e.target===backdrop)closeSheet();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet();});
const node=document.createElement("span");node.className="kit-version";node.textContent=UI_VERSION;
document.querySelector(".kit-eyebrow").append(" · ",node);
