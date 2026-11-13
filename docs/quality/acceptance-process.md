# Willow Valley quality workflow

## Definition of ready
1. State the player problem, expected behavior and non-goals.
2. Assign a requirement ID, such as WV-ROAD-001.
3. Write observable acceptance criteria, including touch, errors, and edge cases.
4. Identify regression risks to existing mechanics, saves, and visuals.
5. Develop from `develop` on a `feature/*` branch.

## Definition of done
1. Implement behavior, using versioned migrations if existing saves would otherwise break.
2. Add acceptance tests with matching AC IDs and negative cases.
3. Run **all** existing tests on each change and keep CI green.
4. Exercise browser interactions where possible. Flag Safari-specific behavior for real iPhone testing.
5. Verify draft/confirmed state, persistence, economy effects, and cancel/undo where relevant.
6. Document feature flags and player instructions.
7. Merge to `develop` for preview. Obtain player acceptance before a separate PR promotes to `main`.

## Test layers
- Pure geometry and simulation tests: Node's built-in `node:test`.
- Browser interaction tests: desktop and mobile-viewport automation where available.
- Real iPhone Duo in portrait: player acceptance for touch comfort, safe areas, and pinch/swipe reliability. Emulation does not prove physical-device behavior.
- Manual adversarial tests: rapid taps, cancelled touches, pinch during editing, long roads, and reload mid-draft.

Every pull request documents requirements, AC IDs, relevant automated tests, regression risks, save compatibility, and the deployment decision.
