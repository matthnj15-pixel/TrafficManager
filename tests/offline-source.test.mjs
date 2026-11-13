import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const read=p=>readFileSync(new URL(p,root),"utf8");
test("WV-OFFLINE-001: no AI advisor and no cloud runtime calls",()=>{
 const html=read("index.html"),app=read("app.mjs"),config=read("config.mjs"),sim=read("simulation.mjs");
 assert.doesNotMatch(html,/advisorBtn|>Advisor<|openai|API key/i);
 assert.doesNotMatch(app,/advisorPanel\(|advisorBtn|OpenAI|remoteAI|fetch\(/i);
 assert.doesNotMatch(config,/remoteAI|localAdvisor|api.?key/i);
 assert.doesNotMatch(sim,/export function advice\(/);
});
test("WV-OFFLINE-002: offline shell keeps app assets and distinct caches per path",()=>{
 const sw=read("sw.js"),html=read("index.html");
 assert.match(html,/rel="manifest"/);
 assert.match(sw,/caches\.open\(CACHE\)/);
 assert.match(sw,/self\.registration\.scope/);
 assert.match(sw,/app\.mjs/);
 assert.match(sw,/simulation\.mjs/);
 assert.match(sw,/desire-paths\.mjs/);
});
test("WV-OFFLINE-003: game retains local save export and import",()=>{
 const app=read("app.mjs");
 assert.match(app,/localStorage\.setItem\(SAVE_KEY/);
 assert.match(app,/Export save as JSON/);
 assert.match(app,/Import a saved game/);
});

test("WV-ICON-001: iOS touch icon and PWA PNG assets are declared",()=>{
 const html=read("index.html"),manifest=JSON.parse(read("manifest.webmanifest")),sw=read("sw.js");
 assert.match(html,/<link rel="apple-touch-icon" sizes="180x180" href="\.\/apple-touch-icon\.png">/);
 assert.match(html,/<meta name="apple-mobile-web-app-title" content="Willow Valley">/);
 assert.ok(manifest.icons.some(icon=>icon.src==="./icon-192.png"&&icon.sizes==="192x192"));
 assert.ok(manifest.icons.some(icon=>icon.src==="./icon-512.png"&&icon.sizes==="512x512"));
 for(const file of ["apple-touch-icon.png","icon-192.png","icon-512.png"])
  assert.ok(sw.includes(file),"Offline install cache should include "+file);
});
