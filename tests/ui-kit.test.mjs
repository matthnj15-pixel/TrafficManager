import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {UI_VERSION,PALETTE} from "../ui-components.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("WV-UI-002 AC01: exact primary/secondary and accents have one CSS source",()=>{
 const css=read("styles.css");
 assert.match(css,/--wv-teal:#035352/);
 assert.match(css,/--wv-yellow:#F3E8BC/);
 for(const token of ["orange","red","blue","olive","stone","mist","charcoal","night"])assert.match(css,new RegExp("--wv-"+token+":#[0-9A-Fa-f]{6}"));
 assert.equal(PALETTE[0].token,"--wv-teal");assert.equal(PALETTE[1].token,"--wv-yellow");
});
test("WV-UI-002 AC02: game and catalog import same shared component module",()=>{
 const app=read("app.mjs"),catalog=read("ui-kit/catalog.mjs"),game=read("index.html");
 for(const symbol of ["mountResourceBar","createBuildRow","renderGameToast"])assert.ok(app.includes(symbol));
 for(const symbol of ["createButton","createResourceChip","createNavTool","createBuildRow","createToast"])assert.ok(catalog.includes(symbol));
 assert.match(game,/id="gameDock"/);assert.match(game,/id="resourceBar"/);
 assert.match(app,/mountGameDock\(/);
 assert.equal(UI_VERSION,"WV-UI-002");
});
test("WV-UI-002 AC03: catalog shows actual game rather than pretending a mockup is the game",()=>{
 const html=read("ui-kit/index.html");
 assert.match(html,/iframe[^>]*src="\.\.\/"/);
 assert.match(html,/href="\.\.\/styles.css"/);
 assert.match(html,/src="\.\/catalog.mjs"/);
 assert.match(html,/It shares the same local settlement save/);
});
test("WV-UI-002 AC04: offline precache includes shared module and catalog",()=>{
 const sw=read("sw.js");
 for(const path of ["ui-components.mjs","ui-kit/index.html","ui-kit/catalog.mjs","ui-kit/catalog.css"])assert.ok(sw.includes(path),path);
});
