# Agent instructions

This repository is the `@local/whiteboard` JavaScript/ESM plugin for DeepSeek Harness (DSH). The runtime source is at the repository root; it is not a TypeScript workspace and it has no `apps/` or business `packages/` members. Read `README.md` and `docs/PROJECT-CONTEXT.md` before changing behavior.

## Standing orders

- Preserve the DSH contract in `package.json`, `cordis.patch.yml`, `index.js`, `client.js`, `host/`, `locale/`, and `icon.svg`. Do not change package identity, private distribution, DSH engine range, bundle patch identifiers, or exports unless the request explicitly requires it.
- Preserve Host authority, persisted canvas/session data, revision checks, field-level human-priority conflicts, AI switch enforcement, and undo behavior. A UI change must not move persistence into the browser or create a second conversation surface.
- Treat `README.md`, `docs/PROJECT-CONTEXT.md`, `docs/DECISIONS.md`, `docs/adr/`, and `docs/ACCEPTANCE-v3.md` as the product contract. Update the owning document when observable behavior changes.
- Validate untrusted JSON, HTTP input, imported canvas documents, manifests, and tool arguments at their boundary. Keep stable error codes and preserve failure causes.
- Keep one owner for each state transition and data format. Use the Host store/engine for durable state and the existing client bridge for selection references; do not introduce parallel caches or persistence paths.
- Use isolated `DSH_HOME` for browser or end-to-end checks. Never run tests that can write the user's real DSH store without an explicit isolated home.
- Keep credentials, local caches, `.spike-e2e/`, browser artifacts, and generated output out of Git. Preserve the plugin-specific exclusions in `.gitignore`.
- This project is source-distributed through GitHub and installed as a DSH bundle. It is private and must not be published to npm.

## Commands

The manifest is the source of truth for runnable commands:

```sh
npm test                 # Host and client smoke checks (321 checks)
npm run test:e2e         # Optional isolated DSH + Chrome end-to-end check
node --check index.js    # Focused syntax check for a changed JavaScript entry
```

Run `npm test` after behavior changes. Run `npm run test:e2e` only when DSH, Chrome, and the isolated test prerequisites are available. Its home is at `../.spike-e2e/dsh-home` relative to this repository, receives a credential copy, and remains after the run. The script removes and recreates that home at startup unless `WB_E2E_KEEP_HOME=1`; confirm permissions, independent ignore rules and cleanup first because this repository's `.gitignore` does not cover its parent. Never use the real store or substitute direct execution of scripts/install-v3.ps1 or scripts/rollback-v1.ps1, which target the caller's profile. The disposable install/rollback fixture verifies synthetic link switching only; see test/e2e/README.md. There is no active `typecheck`, build, Vitest, or workspace gate in this package. Do not infer activation of those gates from retained governance documentation.

## Repository map

```text
index.js                 Host entry, routes, storage and model tools
client.js                Web client, canvas UI and selection-reference bridge
host/                    Canvas model, store, engine, routes and tools
test/                    Host/client smoke tests and isolated e2e
docs/                    Product context, decisions, ADRs, acceptance and release evidence
.agents/                 Reusable governance skills and notes
.github/                 CI, review policy and pull-request templates
```

Changes under `host/` must preserve the persisted document shape and API error contracts. Changes under `client.js` must preserve native DSH sidebar/composer integration and keep selection state session-scoped. Changes to `cordis.patch.yml` or `package.json` require checking the DSH bundle entry and package exports.

## Verification and handoff

Report commands actually run and distinguish unavailable environment prerequisites from failures. For a release or installation change, also verify the package file list, bundle patch, locale metadata, and rollback documentation. Do not claim remote CI, GitHub branch protection, or a live DSH session was verified unless it was exercised in this checkout.

## Documentation

Use `docs/INDEX.md` and `docs/PROJECT-CONTEXT.md` for product architecture and release facts. Treat governance skills under `.agents/skills/` as reference guidance unless their steps and commands are present in this checkout; `package.json` and the current CI workflow define active checks. Keep bilingual documents synchronized when a paired governance document is edited.

## Editing these instructions

`CLAUDE.md` points to this file. Edit `AGENTS.md` as the source of truth and keep the commands and repository map aligned with `package.json` and the actual tree.
