# WV-OFFLINE-001 — Offline-only game and portable downloads

## Player problem
Willow Valley must play on an airplane, with no internet connection, no API keys,
no AI advisor, and no dependence on cloud services. Users should be able to install
the game on iPhone or keep a downloaded HTML copy.

## Acceptance criteria

| ID | Observable result | Automated validation |
| --- | --- | --- |
| AC-01 | Advisor UI, rule-based advisor and AI feature flags have been removed; no remote API required. | `tests/offline-source.test.mjs` |
| AC-02 | Website precaches HTML/CSS/modules and can load/advance with browser network disabled after first online install. | Playwright offline reload test |
| AC-03 | Offline game changes persist across reloads without server interactions; save export/import is preserved. | Playwright offline test + save regression |
| AC-04 | Build generates a self-contained `offline.html` with inlined CSS and JavaScript. | Playwright standalone-page test |
| AC-05 | Production and development have independent scope and cache names, plus existing separate save namespaces. | Scoped service worker and source assertions |
| AC-06 | Player can download the HTML edition from the game menu, and downloadable ZIP/HTML are published with Pages. | CI deployment and browser download-link checks |
| AC-07 | The complete existing simulation/road editor regression suite continues passing. | All Node and Playwright suites |

## Manual iPhone Duo portrait acceptance

- [ ] Visit development page while connected. Wait for the **OFFLINE READY** indicator.
- [ ] Use Share → Add to Home Screen. Open the resulting standalone icon.
- [ ] Advance a month and construct a road; verify changes save.
- [ ] Turn Airplane Mode ON and disable Wi-Fi as well.
- [ ] Fully close and reopen the installed app while still offline.
- [ ] Advance another month, place a building, and reload. Verify progress remains.
- [ ] Export the save JSON to Files and confirm it can be imported.
- [ ] Download the single-file HTML to Files; verify whether opening it works on this iOS version. Prefer the installed PWA if Files preview disables scripts.
- [ ] Repeat on the stable URL and confirm production save is untouched.

## Constraints and known platform behavior

- **First installation requires internet** so the service worker can cache assets.
- Device storage may be reclaimed/cleared by iOS. Cache availability and saved
  progress should not be treated as a permanent guarantee. Export backups.
- A downloaded HTML game runs without fetching dependencies, but `file://`
  navigation/storage are browser- and platform-dependent. Use the PWA for iPhone.
- A portable file has a distinct storage origin: export/import JSON to move saves.
- Future features must remain local and deterministic by default.
- CI checks offline in Chromium; the player performs the real Safari/Duo test
  before stable release.
