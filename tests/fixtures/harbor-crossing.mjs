// A four-arm save on Harbor Merge's shipped terrain and OD schedule.
// Harbor Merge itself starts with a merge and an exit at separate junctions.
import { levelStart } from "../../model.mjs";

export function harborCrossing() {
  const design = levelStart("short-merge");
  const road = (a, b) => ({ a, b, forward: 2, backward: 2, bend: 0 });
  design.network = {
    map: "short-merge",
    nodes: [{ id: "j1", x: 270, y: 315, control: "priority" }],
    roads: [road("west", "j1"), road("j1", "east"), road("south", "j1"), road("j1", "north")]
  };
  return design;
}
