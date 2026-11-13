# Traffic Manager

School Pickup is a first playable traffic engineering scenario. Shorten the pickup queue without delaying buses or leaving more trips unfinished.

## Play on iPhone

[Open Traffic Manager](https://matthnj15-pixel.github.io/TrafficManager/) in Safari. Choose **Share → Add to Home Screen**, enable **Open as Web App**, and launch it from the new icon while online. The game menu shows **Ready for offline play** when that installation has cached the game.

GitHub Pages serves the latest passing push to `main` at the home URL. Branches named `develop` or `playtest/…` publish their latest passing push under `/previews/<branch>/`. Each preview has its own Home Screen app identity, save, and offline cache.

For initial setup, select **Settings → Pages → Source → GitHub Actions** in TrafficManager. After the tests on `main` pass, run **Publish Traffic Manager** from the Actions tab if Pages was enabled after the automatic run.

## Play locally

Run `npm start` and open http://127.0.0.1:4173. The game itself requires no dependencies.

- In **Design**, drag the square merge node along Alder Avenue, or select **Adjust curve** and drag either round handle. The handles keep the curve aligned with the adjoining roads.
- Select **Connect lanes** and tap the pickup lane. Toggle the main lane and auxiliary merge lane. With the merge lane enabled, select **Move node** and drag the diamond to change where it ends. Apply edits to save them locally, or undo the last applied design.
- In **Simulate**, watch the original and edited road side by side with the same arrivals and clock. Tap **Compare** for the single-map view, or **Worst backup** to pause at the edited design’s peak queue. Amber highlights show queued vehicles.
- **Results** compares bus delay, longest queue, and completed and unfinished trips. The top-right menu can restore the original layout.

The service worker caches the playtest after the first visit over HTTPS or localhost. Open the menu to check when offline play is ready. On an iPhone, Home Screen installation requires serving the game over HTTPS. The save belongs to that browser and origin.

## Compare with Eclipse SUMO

1. In the game menu, choose **Export designs for SUMO** after applying your edits.
2. On a desktop with Python, install the pinned native engine and run the comparison from this checkout.

   ```sh
   python3 -m pip install eclipse-sumo==1.28.0 sumo-data==1.28.0
   python3 scripts/run-sumo.py /path/to/traffic-manager-sumo-request.json /path/to/sumo-results.json
   ```

3. In the game menu, choose **Open SUMO results** and select the generated file. Both panes use that engine’s vehicle positions and trip data. The Results tab shows reported collisions. Choose **Use built-in engine** to return to the local simulator.

The desktop runner generates a SUMO network from the corridor’s lane connections, curve, taper, and signal, then runs the original and edited designs with the same departure schedule. It uses the direct curve as the shared pickup approach when both connections are enabled and lets SUMO generate internal junction geometry. Imported SUMO comparisons are session-only and tied to the exact exported design. The installed web app simulates edits offline with the built-in engine and can open an existing SUMO results file offline.

## Verify

```sh
npm ci
npm test
npm run test:sumo # With native SUMO installed
npx playwright install chromium
npm run test:browser
```

The model uses a fixed arrival schedule and 0.2-second steps. Browser tests use touch drags and browser clicks at 669 × 951 and 390 × 844, then reload the cached game offline and verify the saved design. The simulation is tuned for this corridor and uses a sampled minimum curve radius, a fixed signal plan, and simplified lane following, vehicle clearance, and zipper priority when both approaches queue. The longest queue measures stopped or near-stopped vehicles per lane, using vehicle lengths and nominal gaps. Results count unfinished trips explicitly.

The hardware playtest question is whether you can make the intended edit on your first or second try, and whether you can see enough in replay to want to try another design.


### On-device SUMO preview

In Simulate, tap **Run on-device SUMO**. The app runs the original and edited
layouts using Eclipse SUMO 1.28.0 inside a browser worker. After the first visit
shows **Ready for offline play** in the menu, you can run new layouts offline.
The engine adds about 21 MB of uncompressed assets to this preview.

To build locally, put Emscripten 4.0.23, CMake 3.31 or later, and Ninja on your
path and run `bash scripts/build-sumo-wasm.sh`, followed by `npm start`.
The build script pins the SUMO and Xerces source versions and carries the small
patches required for a static browser build. The output includes their license
and notice files.

With native SUMO 1.28.0 available, run
`TRAFFIC_TEST_SUMO=1 TRAFFIC_TEST_WASM=1 npm run test:browser` to verify offline
runs and compare WebAssembly results and vehicle trajectories with native SUMO.
