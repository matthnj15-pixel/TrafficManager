import createNetconvert from "./sumo-wasm/netconvert.mjs";
import createSumo from "./sumo-wasm/sumo.mjs";
import { configureJunctions, netconvertArgs, signalOutputRequest, sumoArgs, sumoInputs, sumoResult } from "./sumo-network.mjs";

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
  const compiled = configureJunctions(network, layout.design, request.signalCycle);
  const signalRequest = signalOutputRequest(compiled);
  const [trace, trips, collisions, signals] = await run(createSumo, sumoArgs(request, !!signalRequest), {
    "corridor.net.xml": compiled, "routes.xml": inputs["routes.xml"],
    ...(signalRequest && { "signals.add.xml": signalRequest })
  }, ["trace.xml", "trips.xml", "collisions.xml", ...(signalRequest ? ["signals.xml"] : [])]);
  return sumoResult(request, layout, trace, trips, collisions, compiled, signals);
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
