# Willow Valley

A mobile-first, single-settlement strategy game, designed for touch controls and persistent turns. The game is an early playable prototype.

## Play and test

After GitHub Pages is enabled with **GitHub Actions** as its source:

- Stable: https://matthnj15-pixel.github.io/Willow-Valley/
- Preview: https://matthnj15-pixel.github.io/Willow-Valley/dev/
- **Living UI Kit (Stable, after release):** https://matthnj15-pixel.github.io/Willow-Valley/ui-kit/\n- **Living UI Kit (Development):** https://matthnj15-pixel.github.io/Willow-Valley/dev/ui-kit/ (interactive components and real game preview)

**The production build uses the `main` branch.** The preview build uses `develop`. Both are deployed together to one Pages site. Game data uses separate browser storage namespaces; the preview cannot overwrite your production save.

## WV-ROAD-003 development changes

- Press and hold at the exact intended **new road node**, then drag: the node stays fixed and the curve handle moves to the **opposite** side of the finger, with radial distance determining curvature. Tap as usual for a straight segment.
- A new road may cross an existing one anywhere: the crossing produces a shared intersection junction automatically, ready for future traffic-control features.
- A street with no built connection is now allowed. The game warns that residents cannot directly reach it, and walking desire paths gradually form after monthly turns. Desire paths are not paved roads and cannot carry industry deliveries.
- All structures, including houses, farms, parks and plazas, now participate in road service. Disconnected homes reduce tax revenue and satisfaction.

## Controls

- Pan the map with one finger.
- Pinch with two fingers or use the +/- buttons to zoom.
- Select **Roads**, then tap the start and corners of a road. Every tap adds a **straight segment** and corners stay sharp.
- Enter Roads mode to reveal **existing** road junctions. Tap a built junction to extend or destroy it. The original village gateway remains protected.
- Tap a built road segment to insert an intersection, branch from it, or remove the segment. Demolition has no direct cost or refund, but disconnected industries stop producing.
- Tap empty land to place a new starting point, then tap again to make straight corners. **Hold any point for ~0.36 seconds and drag in one action** to create an additional curved segment, with the initial touch controlling its bend.
- Press and drag an unfinished segment to reshape it, or hold an orange curve handle to adjust an already built curve.
- **Build road** commits new road geometry; constructed nodes become existing junctions with extend/destroy actions.
- Drag empty map space to pan, or pinch with two fingers to zoom. A quick swipe over a road also pans instead of bending it.
- Tap **Undo** to reverse the last node or curve, **Cancel** to discard the draft, or **Build road** to commit. Cost updates with the real road length.
- Select **Build** and pick an industry, then tap a location on the map to place it.
- Advance a month to resolve production, food consumption, taxes, upkeep, and residential growth.
- Open the menu to export/import a JSON save.

## Development

- `main`: stable; never push experiments here.
- `develop`: integration/testing branch.
- `feature/*`: experiment branches, merged into develop using pull requests.
- Pull requests from develop to main promote tested changes.
- GitHub Actions runs Node's built-in test runner, then publishes main plus develop to independent site paths.

## Offline-first, no AI

Willow Valley uses entirely local, deterministic game mechanics. There is no
advisor, AI integration, cloud requirement, API token, or service charge.

### Install on iPhone (recommended)

1. Open the **Development** URL while on Wi-Fi/cellular.
2. Wait until the game displays **OFFLINE READY** at the top.
3. Use the browser's Share menu → **Add to Home Screen**. The game now has a dedicated Willow Valley PNG icon for iOS.
4. Before a flight, activate Airplane Mode and open the installed game to verify.
5. The game continues locally in airplane mode. The settlement save stays on
   this device and installation; **Export save as JSON** frequently.

The first visit needs internet access to install/cache the game's complete
HTML, CSS and JavaScript. Browser storage can be evicted, including cached
files and local saves: keep a separate JSON backup.

### Downloadable standalone HTML

The release pipeline also creates a self-contained `offline.html` file with
all CSS and JavaScript bundled into the page, using the build script:

```sh
npm install
npm run build:offline
```

Visit the Development site's `/dev/offline.html` to save the generated file.
It needs **no server or network resources** once downloaded. On desktop, this
is a portable offline option. On iPhone, Safari may not execute HTML opened
from Files consistently; the installed PWA is preferred. Browser saves are
**not automatically shared** between the downloaded file and installed site:
use Export/Import Save to transfer them.

## Architecture

- `simulation.mjs`: pure deterministic simulation, save validation, construction and road rules.
- `road-editor.mjs`: draft road geometry and undo logic.
- `road-network.mjs`: persistent junction IDs, editable edges, connected road access, and legacy save compatibility.
- `road-gesture.mjs`: interprets a hold-and-drag into an optional curve.
- `app.mjs`: browser UI, gestures, SVG drawing, local saves.
- `config.mjs`: environment-specific settings and non-AI feature flags.
- `sw.js` and `manifest.webmanifest`: offline install and scoped caching.
- `scripts/build-offline.mjs`: export a fully self-contained HTML game.
- `tests/`: unit tests without external dependencies.
- `.github/workflows/pages.yml`: tests and dual-path Pages deployment.

The prototype uses HTML, CSS, SVG, and JavaScript without external dependencies. Save files carry a version and require future migration when the schema changes. The game's economy and map visuals are early mechanics that will be refined through playtesting.


## App icon (WV-ICON-001)

The project uses the cottage-and-valley `icon.svg` artwork as the single source of truth.
`npm run build:icons` creates `apple-touch-icon.png` (180px) and modern PWA icons
(192px and 512px). The Pages workflow generates them for each deployed build,
and the service worker caches them for offline use.

On iPhone, existing Home Screen installations may keep the old icon. **Back up the
settlement JSON before removing an installed web app.** To see the new icon,
open the updated game in Safari, wait for **OFFLINE READY**, then use
Share → Add to Home Screen. Confirm the preview shows the artwork before
removing any older shortcut.

## Living UI Kit — WV-UI-002

Use [the Development UI catalog](https://matthnj15-pixel.github.io/Willow-Valley/dev/ui-kit/) to see **the exact coded UI components used by the game**.

The visual source of truth is `styles.css` (brand tokens and shared component classes).
`ui-components.mjs` creates the shared DOM elements. Both `app.mjs` and
`ui-kit/catalog.mjs` import those same functions. The catalog includes the
actual running Development game in an embedded frame, not a mockup.
Changes to canonical components are reflected in both surfaces after publishing.

The original Figma artboard and generated artwork are design references, not
pixel guarantees. The catalog shows real, interactive browser components that
run on the iPhone and work offline after caching the app.

**Contract:** resource chips, game dock, build rows, buttons, and toast renderer
are mounted from shared modules. The build catalog, modal preview, tabs,
status indicators, and inputs share the same CSS. No separate screenshot
mockups or duplicated component implementations are accepted as source of truth.

- `ui-kit/index.html`: standalone catalog route
- `ui-kit/catalog.mjs`: interactive preview instances
- `ui-kit/catalog.css`: surrounding catalog layout only
- `styles.css` and `ui-components.mjs`: authoritative shared design system
- `tests/ui-kit.test.mjs` and `tests/browser/ui-kit.spec.mjs`: token, parity,
  real-game embedding, interaction and offline regression tests

Your Development game and catalog share the same browser save: the embedded
preview can advance the actual game. Always export JSON before risky tests.
