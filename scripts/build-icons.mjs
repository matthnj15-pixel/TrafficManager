// Generate genuine PNG Home Screen icons from Willow Valley's existing SVG.
// Usage: node scripts/build-icons.mjs [source-repository-directory] [output-directory]
import sharp from "sharp";
import {readFile,mkdir} from "node:fs/promises";
import {join,resolve} from "node:path";

const source=resolve(process.argv[2]||".");
const dest=resolve(process.argv[3]||source);
const svg=await readFile(join(source,"icon.svg"));
await mkdir(dest,{recursive:true});

for(const [name,size] of [
  ["apple-touch-icon.png",180],
  ["icon-192.png",192],
  ["icon-512.png",512]
]){
  const path=join(dest,name);
  await sharp(svg,{density:320})
    .resize(size,size,{fit:"fill"})
    // iOS adds its own rounded mask; ensure no transparent corners.
    .flatten({background:"#193f30"})
    .png({compressionLevel:9})
    .toFile(path);
  console.log("Generated",name,size+"×"+size);
}
