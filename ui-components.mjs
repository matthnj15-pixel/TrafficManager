/**
 * Willow Valley living UI system.
 * Each exported function is used in both the game and the /ui-kit/ catalog.
 * styles.css owns the exact paint tokens; the catalog reads them at runtime.
 * No dependencies, network requests, or external fonts are required.
 */
export const UI_VERSION="WV-UI-002";
export const PALETTE=[
 {name:"Authentic Teal",token:"--wv-teal",role:"Primary"},
 {name:"Sidecar Yellow",token:"--wv-yellow",role:"Secondary"},
 {name:"Harvest Orange",token:"--wv-orange",role:"Warning / accent"},
 {name:"Hearth Red",token:"--wv-red",role:"Danger / critical"},
 {name:"River Blue",token:"--wv-blue",role:"Information"},
 {name:"Moss Olive",token:"--wv-olive",role:"Success"},
 {name:"Stone Gray",token:"--wv-stone",role:"Neutral"},
 {name:"Mist Gray",token:"--wv-mist",role:"Muted surface"},
 {name:"Charcoal",token:"--wv-charcoal",role:"Dark surface"},
 {name:"Night Ink",token:"--wv-night",role:"Dark text"},
 {name:"Paper",token:"--wv-paper",role:"Raised surface"}
];
// Simple original SVG paths. Replaced by matched Kenney assets only when
// approved and bundled locally; no external icon dependency.
const GLYPHS={
 gold:'<circle cx="12" cy="12" r="9" fill="#D98C3F" stroke="#8d612d" stroke-width="1.5"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#F3E8BC" stroke-width="1.3"/><path d="M9 12h6M12 9v6" stroke="#F3E8BC" stroke-width="1.5"/>',
 wood:'<path d="m4 15 11-10 5 5-11 10Z" fill="#ae774a" stroke="#684b36" stroke-width="1.4"/><path d="m15 5 5 5m-10 0 4 4m-8 0 4 4" stroke="#F3E8BC" stroke-width="1.3"/>',
 food:'<path d="M12 21V8m0 4c-7-1-8-6-7-9 6 0 9 5 7 9Zm0 4c1-7 5-9 10-9-1 6-5 9-10 9Z" fill="#7F8E5A" stroke="#547254" stroke-width="1.5" stroke-linecap="round"/>',
 tools:'<path d="m6 19 12-12M14 4l6 6M5 15l4 4" fill="none" stroke="#526f75" stroke-width="4" stroke-linecap="round"/><circle cx="6" cy="18" r="2" fill="#F3E8BC"/>',
 people:'<circle cx="9" cy="8" r="3.3" fill="#5F8FA8"/><circle cx="17" cy="9" r="2.7" fill="#5F8FA8"/><path d="M3 21v-3a6 6 0 0 1 12 0v3Zm11 0v-3c0-2 2-4 4-4s4 2 4 4v3Z" fill="#5F8FA8"/>',
 house:'<path d="m2.5 10 9.5-7 9.5 7" fill="none" stroke="#384c42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 10v10.5h15V10L12 4.7Z" fill="#F3E8BC" stroke="#4a5845" stroke-width="1.2"/><path d="M10 20.5v-6h4v6M6.8 12.5h2v2h-2zm8.2 0h2v2h-2" fill="#D98C3F" stroke="#4a5845" stroke-width=".8"/><path d="m5.5 18 2 2m-1-5 2 2m7-4 2 2m-1 2 2 2" stroke="#8C897A" stroke-width=".65"/>',
 roads:'<path d="M1.5 15.8C5 16 5.3 5 11.8 6s5.2 12.2 11 10.8" fill="none" stroke="#594e3d" stroke-width="5" stroke-linecap="round"/><path d="M1.5 15.8C5 16 5.3 5 11.8 6s5.2 12.2 11 10.8" fill="none" stroke="#e4c993" stroke-width="3.2" stroke-linecap="round"/><path d="M2 19.8c3 .5 3-9.4 5.5-11.2M15.7 7.7c3.7 3.1 2.5 7.2 6.8 6.2" fill="none" stroke="#8a7655" stroke-width=".8" stroke-linecap="round" stroke-dasharray="1.4 2"/>',
 map:'<path d="m2 5.5 7-2.7 6.3 3 6.7-2.5v15.5l-6.7 2.4-6.3-3-7 2.5Z" fill="#F3E8BC" stroke="#4a5943" stroke-width="1.3"/><path d="M9 2.8v15.4m6.3-12.4v15.4" fill="none" stroke="#9e885b" stroke-width="1" stroke-dasharray="1.5 1.2"/><path d="m4.4 13 1.6-3.4 1.6 3.4m-1.6-5v6.5M17.4 15.2l2.7-2.8M19.9 15l-2.2-2.5" stroke="#035352" stroke-width="1" fill="none"/>',
 build:'<path d="m6 19 12-12" stroke="#035352" stroke-width="3" stroke-linecap="round"/><path d="m13 5 5-3 4 4-5 5Z" fill="#D98C3F" stroke="#83532f"/><path d="m3 17 4-4 4 4-4 4Z" fill="#8C897A"/>',
 tasks:'<rect x="4" y="3" width="16" height="19" rx="3" fill="#F3E8BC" stroke="#035352" stroke-width="1.4"/><path d="m8 11 2 2 4-4m-6 8h8" fill="none" stroke="#035352" stroke-width="1.6"/>',
 tree:'<path d="M11 16v6h3v-6" fill="#8d704e" stroke="#594d3c" stroke-width=".8"/><path d="m12.5 1.5-8 10.2h3L3 17.4h19l-4.5-5.7h3Z" fill="#8e9f72" stroke="#385c50" stroke-width="1.25" stroke-linejoin="round"/><path d="m12.5 5-3 6m5-5 2 6m-8 2 2 2m6-1 2 2" fill="none" stroke="#f0e4bc" stroke-width=".75" stroke-linecap="round"/>',
 check:'<circle cx="12" cy="12" r="10" fill="#7F8E5A"/><path d="m6 12 4 4 8-9" stroke="#fff9eb" stroke-width="2.3" fill="none" stroke-linecap="round"/>',
 warning:'<path d="M12 2 23 22H1Z" fill="#D98C3F" stroke="#945d35"/><path d="M12 9v6m0 3v.5" stroke="#fff9eb" stroke-width="2.5" stroke-linecap="round"/>',
 error:'<circle cx="12" cy="12" r="10" fill="#C85A4B"/><path d="m8 8 8 8m0-8-8 8" stroke="#fff9eb" stroke-width="2.4" stroke-linecap="round"/>',
 info:'<circle cx="12" cy="12" r="10" fill="#5F8FA8"/><path d="M12 11v7m0-12v.5" stroke="#fff9eb" stroke-width="2.3" stroke-linecap="round"/>',
 heart:'<path d="M12 21 3 12C-1 5 6 1 12 7c6-6 13-2 9 5Z" fill="#C85A4B"/>',
 smile:'<circle cx="12" cy="12" r="10" fill="#F3E8BC" stroke="#D98C3F"/><circle cx="8.5" cy="9" r="1.1" fill="#035352"/><circle cx="15.5" cy="9" r="1.1" fill="#035352"/><path d="M7 14q5 6 10 0" fill="none" stroke="#035352" stroke-width="1.7"/>',
 compass:'<circle cx="12" cy="12" r="9.5" fill="#F3E8BC" stroke="#8c764c" stroke-width="1.1"/><path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z" fill="#035352" stroke="#456d62" stroke-width=".7"/><path d="m12 4 1.1 6.9L20 12l-6.9 1.1L12 20l-1.1-6.9L4 12l6.9-1.1Z" fill="#E6C07A"/><circle cx="12" cy="12" r="2.1" fill="#035352"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16" stroke="#035352" stroke-width="2.4" stroke-linecap="round"/>',
 settings:'<circle cx="12" cy="12" r="8.5" fill="none" stroke="#035352" stroke-width="3"/><circle cx="12" cy="12" r="3.5" fill="#D98C3F"/>',
 close:'<path d="m5 5 14 14m0-14L5 19" stroke="#035352" stroke-width="2.5" stroke-linecap="round"/>'
};
export function icon(name,{size=22}={}){
 const span=document.createElement("span");
 span.className="wv-icon";
 span.setAttribute("aria-hidden","true");
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 24 24");
 svg.setAttribute("width",String(size));svg.setAttribute("height",String(size));
 svg.innerHTML=GLYPHS[name]||GLYPHS.info; // trusted, static SVG artwork
 span.append(svg);return span;
}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
export function createButton({label="Build",variant="primary",iconName,disabled=false,onClick,id}={}){
 const b=el("button","wv-btn wv-btn--"+variant);
 b.type="button";if(id)b.id=id;if(iconName)b.append(icon(iconName,{size:20}));
 b.append(el("span","wv-btn__label",label));b.disabled=!!disabled;
 if(typeof onClick==="function")b.addEventListener("click",onClick);
 return b;
}
export function createResourceChip({label="Gold",value="1,240",iconName="gold",delta,id,compact=false}={}){
 const c=el("div","wv-resource"+(compact?" wv-resource--compact":""));c.dataset.resource=label.toLowerCase();
 c.append(icon(iconName,{size:25}));
 const body=el("span","wv-resource__body");
 body.append(el("small","wv-resource__label",label));
 const strong=el("strong","wv-resource__value",value);if(id)strong.id=id;body.append(strong);
 c.append(body);if(delta!==undefined)c.append(el("small","wv-resource__delta",delta));
 return c;
}
export function mountResourceBar(target,items,{compact=false}={}){
 target.replaceChildren(...items.map(item=>createResourceChip({...item,compact})));
 return target;
}
export function createNavTool({label="Build",iconName="house",active=false,id,onClick,compact=false}={}){
 const b=el("button","dock-tool wv-nav-tool"+(compact?" wv-nav-tool--compact":"")+(active?" active":""));b.type="button";
 if(id)b.id=id;b.setAttribute("aria-label",label);b.setAttribute("aria-pressed",String(active));
 b.append(icon(iconName,{size:25}),el("span","wv-nav-tool__label",label));
 if(onClick)b.addEventListener("click",onClick);
 return b;
}
export function createStatusPill({text="Constructing",variant="success",iconName="check"}={}){
 const pill=el("span","wv-status wv-status--"+variant);pill.append(icon(iconName,{size:18}),el("span","",text));return pill;
}
export function createAlert({text="Building completed!",variant="success"}={}){
 const a=el("div","wv-alert wv-alert--"+variant);a.setAttribute("role","status");
 a.append(icon({success:"check",info:"info",warning:"warning",danger:"error"}[variant]||"info",{size:24}),el("span","",text));
 return a;
}
export function createBuildRow({title="House",description="A cozy home for citizens",cost="20 wood · 10 stone · 50 gold",iconName="house",onClick}={}){
 const b=el("button","item wv-build-row");b.type="button";
 b.append(icon(iconName,{size:28}));
 const content=el("span","wv-build-row__copy");content.append(el("b","",title),el("small","",description));b.append(content);
 b.append(el("span","price",cost));if(onClick)b.addEventListener("click",onClick);return b;
}
export function createToggle({label="Sound effects",checked=true,onChange}={}){
 const wrapper=el("label","wv-toggle");wrapper.append(el("span","",label));
 const input=el("input");input.type="checkbox";input.checked=checked;input.addEventListener("change",()=>onChange?.(input.checked));
 wrapper.append(input,el("span","wv-toggle__track"));return wrapper;
}
export function createTabs({labels=["All","Buildings","Decorations","Infrastructure"],active=0,onChange}={}){
 const nav=el("div","wv-tabs");nav.setAttribute("role","tablist");
 labels.forEach((label,i)=>{const b=el("button","wv-tab"+(i===active?" active":""),label);
 b.setAttribute("role","tab");b.setAttribute("aria-selected",String(i===active));b.addEventListener("click",()=>{
  for(const child of nav.children){child.classList.remove("active");child.setAttribute("aria-selected","false");}
  b.classList.add("active");b.setAttribute("aria-selected","true");onChange?.(i,label);
 });nav.append(b);});
 return nav;
}
export function createPanel({title="Build",body,footer}={}){
 const panel=el("section","wv-panel");panel.append(el("h3","wv-panel__title",title));
 if(body)panel.append(body);if(footer)panel.append(footer);return panel;
}
export function createToast({title="House constructed!",detail="3 citizens joined your town.",variant="success",onDismiss}={}){
 const t=el("div","wv-toast wv-toast--"+variant);t.setAttribute("role","status");
 t.append(icon(variant==="success"?"house":"info",{size:29}));
 const lines=el("span","wv-toast__copy");lines.append(el("strong","",title),el("small","",detail));t.append(lines);
 const close=el("button","wv-toast__close");close.setAttribute("aria-label","Dismiss notification");close.append(icon("close",{size:17}));
 close.addEventListener("click",()=>{t.remove();onDismiss?.()});t.append(close);return t;
}
export function renderGameToast(target,message){
 target.classList.add("wv-toast-inline");
 target.replaceChildren(icon("info",{size:22}),el("span","",message));
 target.hidden=false;return target;
}

export function createAdvanceButton({id="nextBtn",onClick}={}){
 const b=el("button","advance wv-advance");
 b.type="button";b.id=id;b.append(el("small","", "END MONTH"),el("b","","Advance →"));
 if(onClick)b.addEventListener("click",onClick);return b;
}
export function mountGameDock(target){
 target.replaceChildren(
  createNavTool({id:"exploreBtn",label:"Explore",iconName:"map",active:true,compact:true}),
  createNavTool({id:"roadsBtn",label:"Roads",iconName:"roads",compact:true}),
  createNavTool({id:"buildBtn",label:"Build",iconName:"house",compact:true}),
  createAdvanceButton()
 );
 return target;
}
export function createDialogActions({
 primaryLabel="Build",secondaryLabel="Cancel",primaryIcon="house",
 onPrimary,onSecondary,primaryVariant="primary"
}={}){
 const row=el("div","wv-dialog-actions");
 row.setAttribute("role","group");row.setAttribute("aria-label","Dialog actions");
 row.append(
  createButton({label:primaryLabel,variant:primaryVariant,iconName:primaryIcon,onClick:onPrimary}),
  createButton({label:secondaryLabel,variant:"secondary",onClick:onSecondary})
 );
 return row;
}
export function createSheetPreview({title="Construction",body,footer,eyebrow="THE SETTLEMENT"}={}){
 // No legacy .sheet class: this is a compact, centered cartography dialog,
 // not the game's edge-to-edge bottom sheet.
 const sheet=el("section","wv-sheet-preview");
 sheet.setAttribute("role","dialog");sheet.setAttribute("aria-modal","true");
 sheet.setAttribute("aria-label",title);
 sheet.append(el("div","sheet-grip"));
 const kicker=el("div","wv-sheet-kicker");
 kicker.append(icon("compass",{size:17}),el("span","",eyebrow));
 sheet.append(kicker);
 const header=el("div","sheet-head");
 header.append(el("h2","",title));
 const exit=el("button","icon-button wv-dialog-close");
 exit.type="button";exit.setAttribute("aria-label","Close");
 exit.append(icon("close",{size:20}));
 exit.addEventListener("click",()=>sheet.remove());
 header.append(exit);sheet.append(header);
 const content=el("div","sheet-body");
 if(body)content.append(body);sheet.append(content);
 if(footer)sheet.append(footer);
 return sheet;
}
