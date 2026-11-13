import {test,expect} from "@playwright/test";

test("WV-OFFLINE-001: no advisor control, no external network dependency",async({page})=>{
 const requests=[];
 page.on("request",request=>requests.push(request.url()));
 await page.goto("/");
 await expect(page.locator("#advisorBtn")).toHaveCount(0);
 await page.locator("#nextBtn").click();
 await expect(page.locator("#calendar")).toContainText("April");
 expect(requests.filter(url=>!url.startsWith("http://127.0.0.1:4173/"))).toEqual([]);
});
test("WV-OFFLINE-002: install assets and continue a turn after the network is disabled",async({page,context})=>{
 await page.goto("/");
 await page.evaluate(async()=>{
   if(!("serviceWorker" in navigator))throw Error("Service workers not supported in test browser");
   const registration=await navigator.serviceWorker.register("./sw.js",{scope:"./"});
   await navigator.serviceWorker.ready;
   if(!registration.active)throw Error("Service worker did not become active");
 });
 await expect.poll(async()=>page.evaluate(async()=>{
   const cacheNames=await caches.keys();
   return cacheNames.some(name=>name.startsWith("willow-valley:")&&name.includes(":__BUILD_VERSION__"));
 })).toBe(true);
 await context.setOffline(true);
 await page.reload();
 await expect(page.locator("h1")).toHaveText("Willow Valley");
 await page.locator("#nextBtn").click();
 await expect(page.locator("#calendar")).toContainText("April");
 await page.reload();
 await expect(page.locator("#calendar")).toContainText("April");
});
test("WV-OFFLINE-004: packaged HTML is a usable single-file game",async({page})=>{
 await page.goto("/offline.html");
 await expect(page.locator("#nextBtn")).toBeVisible();
 await expect(page.locator("#advisorBtn")).toHaveCount(0);
 await page.locator("#nextBtn").click();
 await expect(page.locator("#calendar")).toContainText("April");
});

test("WV-ICON-003: installed iPhone touch icon and PWA icons are valid PNG resources",async({page,request})=>{
 await page.goto("/");
 const touch=page.locator('link[rel="apple-touch-icon"]');
 await expect(touch).toHaveAttribute("sizes","180x180");
 for(const [name,size] of [["apple-touch-icon.png",180],["icon-192.png",192],["icon-512.png",512]]){
   const response=await request.get("/"+name);
   expect(response.ok()).toBe(true);
   const bytes=await response.body();
   expect(bytes.subarray(1,4).toString("ascii")).toBe("PNG");
   expect(bytes.readUInt32BE(16)).toBe(size);
   expect(bytes.readUInt32BE(20)).toBe(size);
 }
});
