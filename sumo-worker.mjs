import createNetconvert from "./sumo-wasm/netconvert.mjs";
import createSumo from "./sumo-wasm/sumo.mjs";
import { configureSignal, netconvertArgs, sumoArgs, sumoInputs, sumoResult } from "./sumo-network.mjs";

async function run(create, args, inputs, outputs) {
  const messages = [];
  const module = await create({ print: () => {}, printErr: message => messages.push(message) });
  for (const [name, contents] of Object.entries(inputs)) module.FS.writeFile(name, contents);
  const status = module.callMain([...args]);
  if (status) throw new Error(messages.join("\n") || `SUMO stopped with code ${status}.`);
  return outputs.map(name => module.FS.readFile(name, { encoding: "utf8" }));
}

async function simulate(request, layout) {
  const inputs = sumoInputs(request, layout);
  const [network] = await run(createNetconvert, netconvertArgs, inputs, ["corridor.net.xml"]);
  const [trace, trips, collisions] = await run(createSumo, sumoArgs(request), {
    "corridor.net.xml": configureSignal(network, layout.design.green, request.signalCycle), "routes.xml": inputs["routes.xml"]
  }, ["trace.xml", "trips.xml", "collisions.xml"]);
  return sumoResult(request, layout, trace, trips, collisions);
}

self.onmessage = async ({ data: request }) => {
  try {
    const original = request.original ? await simulate(request, request.original) : undefined;
    const edited = original && JSON.stringify(request.original.design) === JSON.stringify(request.edited.design)
      ? original : await simulate(request, request.edited);
    self.postMessage({ schema: "traffic-manager.sumo-comparison.v2", version: "1.28.0", original, edited });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
