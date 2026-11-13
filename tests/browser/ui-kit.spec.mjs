import {test,expect} from "@playwright/test";

test("WV-UI-002: living catalog renders canonical palette and interactive variants",async({page})=>{
 await page.goto("/ui-kit/");
 await expect(page.locator(".kit-swatch")).toHaveCount(11);
 await expect(page.locator(".kit-swatch").first()).toContainText("#035352");
 await expect(page.locator(".kit-swatch").nth(1)).toContainText("#F3E8BC");
 await expect(page.locator("#buttonGallery .wv-btn")).toHaveCount(5);
 await page.getByRole("button",{name:"Open Map"}).first().click();
 await expect(page.locator("#buttonFeedback")).toContainText("Secondary button clicked");
 await page.getByRole("tab",{name:"Infrastructure"}).click();
 await expect(page.locator("#tabFeedback")).toContainText("Infrastructure");
 await expect(page.locator("#navigationGallery .wv-nav-tool.active")).toHaveCount(1);
});
test("WV-UI-002: build row, modal and toast are real interactive shared components",async({page})=>{
 await page.goto("/ui-kit/");
 await page.locator("#buildGallery .wv-build-row").first().click();
 await expect(page.locator("#modalBackdrop .wv-sheet-preview")).toBeVisible();
 await page.locator("#modalBackdrop .wv-btn--primary").click();
 await expect(page.locator("#modalBackdrop")).toBeHidden();
 await expect(page.locator("#toastGallery .wv-toast")).toContainText("House constructed!");
 await page.locator("#volume").evaluate(el=>{el.value="35";el.dispatchEvent(new Event("input",{bubbles:true}));});
 await expect(page.locator("#volumeValue")).toHaveText("35%");
});
test("WV-UI-002: catalog and embedded live game share actual resource and navigation styles",async({page})=>{
 await page.goto("/ui-kit/");
 const game=page.frameLocator('iframe[title="Live Willow Valley Development game"]');
 await expect(game.locator("#people")).toHaveText("32");
 await expect(game.locator("#resourceBar .wv-resource")).toHaveCount(5);
 await expect(game.locator("#gameDock .wv-nav-tool")).toHaveCount(3);
 const bg=await game.locator("#resourceBar .wv-resource").first().evaluate(el=>getComputedStyle(el).backgroundColor);
 const swatch=await page.locator("#resourceGallery .wv-resource").first().evaluate(el=>getComputedStyle(el).backgroundColor);
 expect(bg).toBe(swatch);
 const heights=await Promise.all([game.locator("#roadsBtn").evaluate(el=>getComputedStyle(el).minHeight),page.locator("#navigationGallery .wv-nav-tool").nth(1).evaluate(el=>getComputedStyle(el).minHeight)]);
 expect(heights[0]).toBe(heights[1]);
 await game.locator("#roadsBtn").click();
 await expect(game.locator("#roadControls")).toBeVisible();
 await game.locator("#buildBtn").click();
 await expect(game.locator("#sheetBody .wv-build-row").first()).toBeVisible();
});
test("WV-UI-002: installed local UI kit can reopen while disconnected",async({page,context})=>{
 await page.goto("/");
 await page.evaluate(async()=>{await navigator.serviceWorker.register("./sw.js",{scope:"./"});await navigator.serviceWorker.ready;});
 await expect.poll(async()=>page.evaluate(async()=>{const cache=await caches.open((await caches.keys()).find(k=>k.startsWith("willow-valley:")));return Boolean(await cache.match("./ui-kit/index.html"));})).toBe(true);
 await context.setOffline(true);
 await page.goto("/ui-kit/");
 await expect(page.getByRole("heading",{name:"Willow Valley UI Kit"})).toBeVisible();
 await expect(page.locator("#palette .kit-swatch")).toHaveCount(11);
});

test("WV-UI-002: Development game links directly to its living UI catalog",async({page})=>{
 await page.goto("/?preview=1");
 await page.locator("#menuBtn").click();
 await expect(page.getByRole("link",{name:"Open the interactive Willow Valley design system"})).toBeVisible();
 await page.getByRole("link",{name:"Open the interactive Willow Valley design system"}).click();
 await expect(page).toHaveURL(/\/ui-kit\/$/);
 await expect(page.locator(".kit-hero h1")).toContainText("Willow Valley");
});

test("WV-UI-003: cartography dialog is ~80% width with a horizontal aligned action row",async({page})=>{
 for(const [width,height] of [[390,844],[600,850],[320,568]]){
  await page.setViewportSize({width,height});
  await page.goto("/ui-kit/");
  await page.locator("#sheetButton .wv-btn").click();
  const dialog=page.locator("#modalBackdrop .wv-sheet-preview");
  await expect(dialog).toBeVisible();
  const bounds=await dialog.boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds.width).toBeLessThanOrEqual(width*.8+2);
  expect(bounds.width).toBeGreaterThan(190);
  expect(bounds.height).toBeLessThanOrEqual(height*.72+2);
  const actions=page.locator("#modalBackdrop .wv-dialog-actions");
  await expect(actions).toBeVisible();
  const build=await actions.locator(".wv-btn").first().boundingBox();
  const cancel=await actions.locator(".wv-btn").nth(1).boundingBox();
  expect(build&&cancel).toBeTruthy();
  expect(Math.abs(build.y-cancel.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(build.height-cancel.height)).toBeLessThanOrEqual(1);
  expect(build.height).toBeGreaterThanOrEqual(44);
  expect(cancel.height).toBeGreaterThanOrEqual(44);
  expect(cancel.x).toBeGreaterThanOrEqual(build.x+build.width+8);
  expect(cancel.x+cancel.width).toBeLessThanOrEqual(bounds.x+bounds.width-10);
  const color=await dialog.locator(".sheet-body p").evaluate(el=>getComputedStyle(el).color);
  expect(color).toBe("rgb(64, 91, 77)");
  await actions.locator(".wv-btn--secondary").click();
  await expect(page.locator("#modalBackdrop")).toBeHidden();
 }
});
test("WV-UI-003: rustic dialog and game sheet share parchment/material tokens",async({page})=>{
 await page.goto("/ui-kit/");
 await page.locator("#sheetButton .wv-btn").click();
 const dialog=page.locator("#modalBackdrop .wv-sheet-preview");
 await expect(dialog.locator(".wv-sheet-kicker")).toContainText("THE SETTLEMENT");
 await expect(dialog.locator(".wv-icon").first()).toBeVisible();
 const border=await dialog.evaluate(el=>getComputedStyle(el).borderTopColor);
 expect(border).toBe("rgb(189, 167, 119)");
 await dialog.locator('[aria-label="Close"]').click();
 await expect(page.locator("#modalBackdrop")).toBeHidden();
 const game=page.frameLocator('iframe[title="Live Willow Valley Development game"]');
 await game.locator("#buildBtn").click();
 const real=game.locator("#sheet");
 await expect(real).toBeVisible();
 const gameBorder=await real.evaluate(el=>getComputedStyle(el).borderTopColor);
 expect(gameBorder).toBe(border);
 const realRow=game.locator("#sheetBody .wv-build-row").first();
 await expect(realRow).toBeVisible();
 const rowHeight=await realRow.evaluate(el=>el.getBoundingClientRect().height);
 expect(rowHeight).toBeGreaterThanOrEqual(55);
});
