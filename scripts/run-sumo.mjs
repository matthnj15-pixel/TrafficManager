import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureJunctions, netconvertArgs, sumoArgs, sumoInputs, sumoResult } from "../sumo-network.mjs";

const [input, output] = process.argv.slice(2);
const request = JSON.parse(readFileSync(input, "utf8"));
if (request.schema !== "traffic-manager.sumo-request.v2") throw new Error("Expected a Traffic Manager SUMO request.");
const cwd = mkdtempSync(join(tmpdir(), "traffic-manager-sumo-"));
const command = (name, args) => execFileSync(name, args, { cwd, encoding: "utf8" });
function run(layout) {
  for (const [file, text] of Object.entries(sumoInputs(request, layout))) writeFileSync(join(cwd, file), text);
  command("netconvert", netconvertArgs);
  const network = join(cwd, "corridor.net.xml");
  writeFileSync(network, configureJunctions(readFileSync(network, "utf8"), layout.design, request.signalCycle));
  command("sumo", sumoArgs(request));
  const [trace, trips, collisions] = ["trace.xml", "trips.xml", "collisions.xml"]
    .map(file => readFileSync(join(cwd, file), "utf8"));
  return sumoResult(request, layout, trace, trips, collisions);
}
try {
  const version = command("sumo", ["--version"]).split("\n")[0];
  const data = { schema: "traffic-manager.sumo-comparison.v2", version, original: run(request.original), edited: run(request.edited) };
  writeFileSync(output, JSON.stringify(data));
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
