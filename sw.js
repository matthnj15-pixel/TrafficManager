/* Willow Valley offline shell.
 * Assets are cached at install time; app data stays in local browser storage.
 * Each Pages path has its own service-worker scope and cache namespace.
 */
const VERSION="__BUILD_VERSION__";
const PREFIX="willow-valley:"+new URL(self.registration.scope).pathname+":";
const CACHE=PREFIX+VERSION;
const REQUIRED=["./","./index.html","./styles.css","./app.mjs","./config.mjs","./simulation.mjs","./ui-components.mjs"];
const OPTIONAL=["./road-editor.mjs","./road-network.mjs","./road-gesture.mjs","./desire-paths.mjs","./manifest.webmanifest","./icon.svg","./apple-touch-icon.png","./icon-192.png","./icon-512.png","./offline.html","./ui-kit/index.html","./ui-kit/catalog.mjs","./ui-kit/catalog.css"];
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(REQUIRED);
    await Promise.all(OPTIONAL.map(async url=>{
      try{const response=await fetch(new URL(url,self.registration.scope),{cache:"reload"});if(response.ok)await cache.put(new URL(url,self.registration.scope),response);}
      catch(error){/* Older stable builds may not include optional modules. */}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url),scope=new URL(self.registration.scope);
 // Never intercept unrelated resources, other environments, or downloads.
 if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   // A directory URL and its index.html must both work in airplane mode.
   if(url.pathname.endsWith("/ui-kit/")||url.pathname.endsWith("/ui-kit")){
     const kit=await cache.match("./ui-kit/index.html");if(kit)return kit;
   }
   const matched=await cache.match(request,{ignoreSearch:true});
   if(matched)return matched;
   try{
     const response=await fetch(request);
     if(response.ok&&url.origin===scope.origin)await cache.put(request,response.clone());
     return response;
   }catch(error){
     if(request.mode==="navigate")return await cache.match("./index.html")||Response.error();
     return Response.error();
   }
 })());
});
