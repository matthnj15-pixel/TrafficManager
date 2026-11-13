# Traffic Manager

School Pickup is a first playable traffic engineering scenario. Shorten the pickup queue without delaying buses or leaving more trips unfinished.

## Play locally

Run `npm start` and open http://127.0.0.1:4173. The game itself requires no dependencies.

- In **Design**, drag the square merge node along Alder Avenue, or select **Adjust curve** and drag either round handle. The handles keep the curve aligned with the adjoining roads.
- Select **Connect lanes** and tap the pickup lane. Toggle the main lane and auxiliary merge lane. Apply edits to save them locally, or undo the last applied design.
- In **Replay**, switch between the original and edited design. The arrivals are identical. Amber vehicles are waiting on traffic, a gap, or a signal.
- **Results** compares bus delay, longest queue, and completed and unfinished trips. The top-right menu can restore the original layout.

The service worker caches the playtest after the first visit over HTTPS or localhost. Open the menu to check when offline play is ready. On an iPhone, Home Screen installation requires serving the game over HTTPS. The save belongs to that browser and origin.

## Verify

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

The model uses a fixed arrival schedule and 0.2-second steps. Browser tests use touch drags and browser clicks at 669 × 951 and 390 × 844, then reload the cached game offline and verify the saved design. The simulation is tuned for this corridor and uses a sampled minimum curve radius, a fixed signal plan, and simplified lane following and merge gaps. The longest queue measures stopped or near-stopped vehicles per lane, using vehicle lengths and nominal gaps. Results count unfinished trips explicitly.

The hardware playtest question is whether you can make the intended edit on your first or second try, and whether you can see enough in replay to want to try another design.
