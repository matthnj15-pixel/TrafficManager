# Willow Valley — Production candidate 2026-10-28

**State:** prepared for review on `release/2026-10-28-prod-ready`, **not yet promoted** to `main`. The release was rebuilt as a single, reviewed snapshot based on the current production commit because the original `develop` → `main` PR had a history/merge conflict. No force-push or production changes were made.

## What is included

- **Road editing (WV-ROAD-001/002/003):** persistent junction graph, exact-start curve gestures, freeform road intersections, existing-road demolition without direct refund, adjustable curves, disconnected-road consequences, and walking desire paths.
- **Road requirements for all structures:** houses, industry, farms, parks and plazas use road service; disconnected homes affect tax revenue/happiness, and disconnected industry cannot produce.
- **Offline-first game (WV-OFFLINE-001):** local deterministic simulation without AI advisor; installable cached PWA; downloadable self-contained HTML/ZIP; save export/import retained.
- **Home Screen icon (WV-ICON-001):** original generated PNG icons for iPhone and PWA.
- **Living interface kit (WV-UI-002/003):** shared coded resource chips, navigation, build rows, buttons and alerts; compact parchment/cartography-inspired dialog and 44px action targets; catalog at `/ui-kit/`; updated game construction sheet.
- **Repository README navigation:** Stable, Development and Living UI Kit links.

**Not included:** 3D world/camera migration, Kenney model imports, castle mechanics, automated AI services. These remain later projects.

## Hard release constraints

1. Preserve save key `willow-valley:main:v1` (production) and `willow-valley:dev:v1` (preview). Do not overwrite or swap storage namespaces.
2. The new `roadGraph` is initialized from older `roads` arrays on loading valid legacy saves, while `version:1` stays compatible. Keep the original roads and settlement state.
3. The `main` GitHub Pages publishing workflow is authoritative for dual-branch Pages copying, optional UI kit assets, PNG icon generation, offline cache stamping and standalone HTML+ZIP publishing. The candidate explicitly carries the current `main` publishing workflow to avoid regression.
4. Preserve offline use with no runtime dependency on external APIs.
5. No destructive branch cleanup before the production PR has been reviewed and merged.

## Pre-merge acceptance checklist

- [ ] Release PR mergeable, CI green (Node unit, PNG dimensions, standalone HTML and Playwright).
- [ ] Compare page and verify `.github/workflows/pages.yml` retains the existing all-assets build.
- [ ] On real iPhone Duo, test Development offline after a full close/reopen with Wi-Fi and cellular off.
- [ ] On real iPhone Duo, review the compact Construction modal and real Build menu at portrait size.
- [ ] Export a JSON copy of **any existing Stable settlement** before production promotion.
- [ ] Test old `main` save migration in a separate browser context; do not clear real player data.
- [ ] Confirm critical existing roads, shops, homes, resource counters, income and monthly advances.
- [ ] Review changes to player-facing road behavior before release.
- [ ] Merge the conflict-free **main-based** release PR to `main` with a normal merge commit, not a force-push. This commit carries a snapshot of `develop`; Development history is retained on `develop`, and the follow-up `main` → `develop` sync PR will join the histories cleanly.
- [ ] After merge, validate GitHub Pages production URL, `/ui-kit/`, `/offline.html`, PNG app icon and offline reopen.
- [ ] Only after production smoke tests, sync `main` back into `develop` using a follow-up PR and preserve branch history.

## Rollback and data safety

- Previous production logic before this candidate is preserved at `169928a6688197bd42c974456fdc7bd4afdf0de3` (publishing workflow on main), with the README-only update at `9f9d8c65b74aa94d3904e919488950cd8883d0c2`.
- If production breaks, revert the release merge commit in a new PR to `main` and republish GitHub Pages. **Do not force-reset `main`**; preserve audit history.
- Keep existing localStorage data; avoid clearing site data or uninstalling the Home Screen app as a rollback strategy.
- Keep an exported JSON save in Files as an independent backup. Loading an upgraded save into older code may not preserve newly introduced mechanics exactly, so test restores before relying on rollback.

## Repository branch cleanup

Current persistent branches: `main`, `develop` plus the release candidate should remain until promotion and smoke tests. Thirteen old branches correspond to already-merged PRs and are **eligible for deletion after production validation**:

- `feature/road-editor-precision` (PR #2)
- `feature/road-network-editing` (PR #4)
- `feature/road-curves-intersections-desire-paths` (PR #6)
- `feature/offline-first-no-advisor` (PR #9)
- `feature/ios-home-screen-icon` (PR #11)
- `feature/live-ui-kit-shared-components` (PR #16)
- `feature/ui-rustic-compact-dialogs` (PR #18)
- `hotfix/pages-preview-modules` (PR #3)
- `hotfix/preview-road-network-modules` (PR #5)
- `hotfix/pages-dynamic-es-modules` (PR #7)
- `hotfix/pages-offline-installers` (PR #10)
- `hotfix/pages-generate-app-icons` (PR #12)
- `hotfix/pages-live-ui-kit-route` (PR #17)

The documentation branches from PRs #19/#20 are also safe to delete after merge. **Do not delete `main` or `develop`.** Enable repository **Settings → General → Pull Requests → Automatically delete head branches** for future merged feature PRs. Only merged, independently reviewed branches should be removed.
