import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {join} from "node:path";

const icons=[
 ["apple-touch-icon.png",180],
 ["icon-192.png",192],
 ["icon-512.png",512]
];
test("WV-ICON-002 generated PNG icons have correct dimensions and signatures",{skip:process.env.CHECK_BUILT_ICONS!=="1"},()=>{
 for(const [name,size] of icons){
   const file=join(process.cwd(),name);
   assert.ok(existsSync(file),"Missing generated icon "+name);
   const data=readFileSync(file);
   assert.deepEqual([...data.subarray(0,8)],[137,80,78,71,13,10,26,10],name+" should be PNG");
   assert.equal(data.toString("ascii",12,16),"IHDR");
   assert.equal(data.readUInt32BE(16),size,name+" width");
   assert.equal(data.readUInt32BE(20),size,name+" height");
   assert.ok(data.byteLength>500,name+" should contain actual artwork");
 }
});
