# Development guide

English | [中文](development.zh.md)

This guide covers daily work on the root-level JavaScript/ESM DSH plugin. [Architecture](architecture.md) owns runtime boundaries, [testing](testing.md) owns test evidence, and [project context](PROJECT-CONTEXT.md) owns the product contract.

<a id="setup-tutorial"></a>
## Setup tutorial

### Prerequisites

- Use a Node.js version that supports the package's ESM syntax and npm. The package does not declare a Node version range; the DSH installation supplies its own compatibility requirement.
- The smoke checks need only Node.js and the repository files. They do not require a DSH server, browser, or package workspace install.
- The optional end-to-end check additionally needs a DSH installation, Chrome, credentials, and the test's isolated-store prerequisites.

### Daily workflow

1. Read the root [AGENTS.md](../AGENTS.md), [project context](PROJECT-CONTEXT.md), and the owning ADR before changing behavior.
2. Keep Host changes in `index.js` or `host/` and client changes in `client.js`; preserve the persisted document shape, tool error contracts, native composer integration, and session-scoped selection bridge.
3. Update tests and the owning documentation when observable behavior changes.
4. Run the smallest applicable checks, then report the commands and results.

<a id="verify-a-change"></a>
## Verify a change

Run these commands from the repository root as applicable:

```sh
npm test
node --check index.js
npm run test:e2e
```

`npm test` is the active required smoke check and currently runs 216 Host checks plus 105 client checks. Run `node --check index.js` for a focused Host-entry syntax check when that entry changes. Run `npm run test:e2e` only when its DSH, Chrome, credential, and isolated `DSH_HOME` prerequisites are available; it is optional and must never use the real DSH store. Review the [test evidence rules](testing.md#evidence-rules) for the parent-directory credential copy, exclusions and cleanup before execution.

## Runtime and release workflow

A client-only change takes effect after refreshing the DSH page. A Host or bundle change requires restarting the DSH web process. Changes to `package.json` or `cordis.patch.yml` require checking package exports, locale metadata, the icon, bundle insertion, and rollback documentation; the package remains private and is not published to npm.

## Reference-only governance assets

The TypeScript, Vitest, pnpm-workspace, translation-pairing and aggregate-gate tooling from the template was not integrated as active project tooling. The manifest declares `npm test` and optional `npm run test:e2e`; root instructions document `node --check index.js`, which CI also runs. No active typecheck, build, Vitest, workspace or coverage gate exists. Remaining skills and governance notes are reference guidance.
