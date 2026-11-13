# Traffic Manager

School Pickup is a first playable traffic engineering scenario. Shorten the pickup queue without delaying buses or leaving more trips unfinished.

## Play on iPhone

[Open Traffic Manager](https://matthnj15-pixel.github.io/TrafficManager/) in Safari. Choose **Share → Add to Home Screen**, enable **Open as Web App**, and launch it from the new icon while online. The game menu shows **Ready for offline play** when that installation has cached the game.

GitHub Pages serves the latest passing push to `main` at the home URL. Branches named `develop` or `playtest/…` publish their latest passing push under `/previews/<branch>/`. Each preview has its own Home Screen app identity, save, and offline cache.

For initial setup, select **Settings → Pages → Source → GitHub Actions** in TrafficManager. After the tests on `main` pass, run **Publish Traffic Manager** from the Actions tab if Pages was enabled after the automatic run.

## School Pickup

- **Move node**. Drag the square along Alder Avenue. With the auxiliary lane connected, drag the diamond to end the lane and the triangle to start its taper. A longer taper raises the modeled curve speed and takes up more of the lane. A lane ending close to the signal leaves less room for the queue.
- **Adjust curve**. Drag the round handles to change the pickup bend while keeping its ends aligned. The radius limits the modeled approach speed.
- **Connect lanes**. Tap the pickup lane and choose its receiving lanes.
- **Road Builder**. Tap an Alder Avenue segment to change its directional lane counts or curve. Use **Add node** to split a segment at a chosen point. **Clear avenue** gives you the existing connection points. Draw between two points, then choose the lane layout. Drag the pickup node sideways in **Move node**, or the slip start sideways in **Draw slip lane**, to snap to a northbound lane. You can also select the lane in **Junctions**.
- **Junctions**. Tap a map node to inspect its movement. Edit the signal's right turn and timing, the school access turn, or the priority at a merge. The pickup junction and auxiliary lane end have independent rules.
- **Draw slip lane**. Tap a start on Alder Avenue and an end on the cross street. Drag the endpoints and bend to refine it. The lane creates a fork node and a merge node. Open **Junctions** to set priority at the merge. Results counts trips that lose their only modeled access.
- **Signal timing**. Split green time between Alder Avenue and the cross street in a fixed 40-second cycle. Yellow and all-red clearance are built in.
- **Test design** applies edits and opens **Simulate**. Simulate and Results run Eclipse SUMO 1.28.0 in a browser worker. The two layouts share demand and simulation time. **Worst backup** jumps to your largest measured queue and highlights its road.
- **Results** shows changes in queue length, bus and cross-street delay, completed trips, and collisions. The objective is to shorten the queue while protecting service on both roads.

The 210-second scenario uses a fixed 116-trip schedule and 0.2-second simulation steps. Queue length counts near-stopped vehicles and nominal gaps on the longest queued lane. At the end of the run, the difference between scheduled trips and completed trips is the number still unfinished.

## Build and verify

Build the offline engine with Emscripten 4.0.23, CMake 3.31 or later, and Ninja on your path. The build adds about 21 MB of uncompressed assets. The app caches them on its first online visit.

```sh
bash scripts/build-sumo-wasm.sh
npm ci
npm start
```

Open http://127.0.0.1:4173. To verify the native engine and compare it with the browser run, install the same SUMO version.

```sh
python3 -m pip install eclipse-sumo==1.28.0 sumo-data==1.28.0
npm test
npm run test:sumo
npx playwright install chromium
TRAFFIC_TEST_SUMO=1 npm run test:browser
```

The native test runner and the offline game use the same SUMO network builder, signal program, and results parser. Browser tests exercise touch edits at 669 × 951 and 390 × 844, reload offline, and rerun the saved design.
