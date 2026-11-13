import {test,expect} from "@playwright/test";

async function toScreen(page,p){
 return page.locator("#map").evaluate((el,p)=>{
  const rect=el.getBoundingClientRect(),v=el.viewBox.baseVal;
  return{x:rect.left+(p.x-v.x)/v.width*rect.width,y:rect.top+(p.y-v.y)/v.height*rect.height};
 },p);
}
async function tapMap(page,p){const screen=await toScreen(page,p);await page.mouse.click(screen.x,screen.y);}
async function holdDrag(page,from,delta){
 const pos=await toScreen(page,from);
 await page.mouse.move(pos.x,pos.y);
 await page.mouse.down();
 await page.waitForTimeout(475);
 await page.mouse.move(pos.x+delta.x,pos.y+delta.y,{steps:10});
 await page.mouse.up();
}
async function extendFrom(page,p){
 await tapMap(page,p);
 await page.getByRole("button",{name:"Extend road from here"}).click();
}
const preview=page=>page.locator('#map path[stroke="#fbd18d"]');
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem("willow-valley:main:v1")));

test.beforeEach(async({page})=>{
 await page.goto("/");
 await page.locator("#roadsBtn").click();
});
test("WV-ROAD-002 AC-01: original road exposes persistent junction nodes",async({page})=>{
 await expect(page.locator('#map circle[fill="#d6e4ce"]')).toHaveCount(4);
 await tapMap(page,{x:330,y:417});
 await expect(page.getByText("Existing road junction",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Extend road from here"})).toBeVisible();
});
test("regression straight-by-default and sharp corners in the existing network",async({page})=>{
 await extendFrom(page,{x:460,y:454});
 await tapMap(page,{x:660,y:454});
 await tapMap(page,{x:660,y:590});
 expect(await preview(page).getAttribute("d")).toBe("M 460 454 L 660 454 L 660 590");
});
test("WV-ROAD-002 AC-04: tap to branch and reconnect to another existing node",async({page})=>{
 await extendFrom(page,{x:460,y:454});
 await tapMap(page,{x:480,y:320});
 await tapMap(page,{x:656,y:383});
 await page.locator("#confirmRoad").click();
 const state=await saved(page);
 expect(state.roadGraph.nodes).toHaveLength(5);
 expect(state.roadGraph.segments).toHaveLength(5);
 expect(state.gold).toBeLessThan(740);
});
test("WV-ROAD-002 AC-05: one hold-and-drag creates a curve without second tap",async({page})=>{
 await extendFrom(page,{x:460,y:454});
 await holdDrag(page,{x:560,y:325},{x:95,y:75});
 expect(await preview(page).getAttribute("d")).toContain(" Q ");
 await page.locator("#confirmRoad").click();
 const state=await saved(page);
 expect(state.roadGraph.segments.at(-1).control).not.toBeNull();
 await page.reload();
 const persisted=await saved(page);
 expect(persisted.roadGraph.segments.at(-1).control).toEqual(state.roadGraph.segments.at(-1).control);
});
test("regression draft bend, undo, and continued quick-swipe panning",async({page})=>{
 await extendFrom(page,{x:460,y:454});
 await tapMap(page,{x:680,y:454});
 await holdDrag(page,{x:570,y:454},{x:0,y:-55});
 expect(await preview(page).getAttribute("d")).toContain(" Q ");
 await page.locator("#undoRoad").click();
 expect(await preview(page).getAttribute("d")).not.toContain(" Q ");
 const before=await page.locator("#map").getAttribute("viewBox");
 const point=await toScreen(page,{x:570,y:454});
 await page.mouse.move(point.x,point.y);await page.mouse.down();
 await page.mouse.move(point.x-80,point.y+32,{steps:2});await page.mouse.up();
 expect(await page.locator("#map").getAttribute("viewBox")).not.toBe(before);
 expect(await preview(page).getAttribute("d")).not.toContain(" Q ");
});
test("WV-ROAD-002 AC-06: completed curve stays editable by hold-and-drag",async({page})=>{
 await extendFrom(page,{x:460,y:454});
 await holdDrag(page,{x:560,y:325},{x:95,y:75});
 await page.locator("#confirmRoad").click();
 const earlier=await saved(page);
 const handle=page.locator('#map circle[fill="#f3b969"]').last();
 const cx=Number(await handle.getAttribute("cx")),cy=Number(await handle.getAttribute("cy"));
 await holdDrag(page,{x:cx,y:cy},{x:0,y:45});
 const after=await saved(page);
 expect(after.roadGraph.segments.at(-1).control).not.toEqual(earlier.roadGraph.segments.at(-1).control);
 expect(after.gold).toBe(earlier.gold);
});
test("WV-ROAD-002 AC-03: existing junction deletion has no direct cost but disconnects production",async({page})=>{
 const beforeGold=Number((await page.locator("#gold").innerText()).replace(/,/g,""));
 await tapMap(page,{x:330,y:417});
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:/Destroy this junction/}).click();
 const after=await saved(page);
 expect(after.gold).toBe(beforeGold);
 expect(after.roadGraph.segments.length).toBe(1);
 await page.locator("#nextBtn").click();
 const next=await saved(page);
 expect(next.report).toContain("+0 food");
 expect(next.report).toContain("+0 wood");
});
test("WV-ROAD-002 AC-07: insert intersection on an existing segment",async({page})=>{
 await tapMap(page,{x:250,y:445});
 await page.getByRole("button",{name:/Insert a junction here/}).click();
 const state=await saved(page);
 expect(state.roadGraph.nodes.length).toBe(5);
 expect(state.roadGraph.segments.length).toBe(4);
 await tapMap(page,{x:242,y:330});
 await page.locator("#confirmRoad").click();
 expect((await saved(page)).roadGraph.segments).toHaveLength(5);
});


test("WV-ROAD-003 fixed endpoint: hold at node and drag only moves opposite curve control",async({page})=>{
 await extendFrom(page,{x:460,y:454});
 await holdDrag(page,{x:560,y:325},{x:72,y:60});
 const d=await preview(page).getAttribute("d");
 expect(d).toMatch(/^M 460 454 Q /);
 expect(d).toMatch(/ 560 325$/);
 await page.locator("#confirmRoad").click();
 const state=await saved(page);
 const latest=state.roadGraph.segments.at(-1);
 const anchor=state.roadGraph.nodes.find(n=>n.id===latest.b);
 expect(anchor.x).toBe(560);expect(anchor.y).toBe(325);
 expect(latest.control.x).toBeLessThan(anchor.x);
 expect(latest.control.y).toBeLessThan(anchor.y);
});
test("WV-ROAD-003 intersection: crossing a built segment creates four connected arms",async({page})=>{
 await tapMap(page,{x:400,y:340});
 await tapMap(page,{x:400,y:540});
 await page.locator("#confirmRoad").click();
 const state=await saved(page);
 const crossing=state.roadGraph.nodes.find(n=>Math.abs(n.x-400)<2&&n.y>400&&n.y<475);
 expect(crossing).toBeTruthy();
 expect(state.roadGraph.segments.filter(e=>e.a===crossing.id||e.b===crossing.id)).toHaveLength(4);
});
test("WV-ROAD-003 isolated road: new independent street is allowed and gains desire paths",async({page})=>{
 await tapMap(page,{x:110,y:100});
 await tapMap(page,{x:240,y:100});
 await page.locator("#confirmRoad").click();
 await expect(page.locator("#toast")).toContainText("Isolated street");
 const isolated=await saved(page);
 expect(isolated.desirePaths).toHaveLength(0);
 await page.locator("#nextBtn").click();
 const later=await saved(page);
 expect(later.desirePaths).toHaveLength(1);
 expect(later.desirePaths[0].progress).toBeGreaterThan(0);
 expect(later.roadGraph.segments).toEqual(isolated.roadGraph.segments);
});
test("WV-ROAD-003 disconnected homes show red warning and lower taxes",async({page})=>{
 const before=await saved(page);
 await tapMap(page,{x:330,y:417});
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:/Destroy this junction/}).click();
 await expect(page.locator('#map circle[fill="#d6e4ce"]')).toHaveCount(3);
 expect(await page.locator('#map rect[stroke="#c54f43"]').count()).toBeGreaterThan(0);
 await page.locator("#nextBtn").click();
 const s=await saved(page);
 expect(s.gold).toBeLessThan(before.gold);
 expect(s.report).toContain("residents");
});
