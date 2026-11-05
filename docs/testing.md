# Testing policy

English | [中文](testing.zh.md)

This page records the checks that are active for the root-level JavaScript/ESM plugin. Commands come from [AGENTS.md](../AGENTS.md) and [package.json](../package.json); [development](development.md) owns workflow selection.

## Active checks

- **Host smoke suite** (`node test/smoke.mjs`): exercises the pure canvas model, claims, durable store and engine, v3 model tools, AI-switch behavior, undo, and HTTP routes. It does not require a browser or a running DSH instance.
- **Client smoke suite** (`node test/client-smoke.mjs`): loads `client.js` through a stubbed module loader and React surface, then exercises client mapping, operation diffs, change application, bridge translation, registration, and text bounds. It does not require a browser.
- **Combined smoke check** (`npm test`): runs both suites and currently reports 216 Host checks plus 105 client checks.
- **Optional isolated end to end** (`npm run test:e2e`): starts a throwaway DSH web process, uses Chrome and an isolated `DSH_HOME`, and checks the real sidebar, composer reference, AI switch, persistence behavior, and protection of the real store. It requires local DSH, Chrome, credentials, and the test prerequisites.
- **Focused syntax check** (`node --check index.js`): checks the Host entry without starting DSH.
- **Windows script isolation regression** (`node test/install-rollback-isolation.mjs`): checks synthetic junction/manifest switching, cleanup after observer failures and independent concurrent processes. CI runs this on Windows; it does not start DSH or replace the browser/model check.

## Evidence rules

Run `npm test` after behavior changes. Use the v3 end-to-end check only when its prerequisites are available. Its isolated home is in `../.spike-e2e/dsh-home` relative to this repository. By default the script removes and recreates that home at startup; `WB_E2E_KEEP_HOME=1` skips the reset. It copies credentials there and leaves the home after the run; confirm permissions, independent ignore rules and cleanup before execution. The repository's `.gitignore` does not cover the parent directory. Keep browser artifacts out of commits. Direct execution of scripts/install-v3.ps1 or scripts/rollback-v1.ps1 targets the caller's profile and is not an isolated substitute. The disposable fixture described in [the test guide](../test/e2e/README.md) checks synthetic link switching, not historical v1 runtime compatibility. A missing optional prerequisite is not a pass; report it separately from a test failure. Do not claim remote CI, GitHub branch protection, or a live DSH session unless it was exercised.

Test Host persistence and tool contracts through the Host entry points. Test client selection state through the existing bridge and native composer integration; do not introduce a second store or conversation surface merely to make a test pass.

## Reference-only checks

The governance template's TypeScript, Vitest, coverage, pnpm-workspace, translation-pairing, package-export and aggregate-gate tooling was not integrated as active plugin checks. The manifest and CI do not define or invoke `typecheck`, `build`, `check:all`, `check:ci` or coverage thresholds. Treat those as template guidance only.
