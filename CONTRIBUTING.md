# Contributing

English | [中文](CONTRIBUTING.zh.md)

This repository contains the root-level JavaScript/ESM package `@local/whiteboard`, a DeepSeek Harness (DSH) plugin. Host code in `index.js` and `host/` owns durable canvas state and tools; `client.js` renders the sidebar and bridges selection references into the native composer.

## Before you change code

Read the root [AGENTS.md](AGENTS.md), [project context](docs/PROJECT-CONTEXT.md), and the owning product or ADR document. Use [architecture](docs/architecture.md) for boundaries, [development](docs/development.md) for the daily workflow, [testing](docs/testing.md) for evidence, and [the documentation standard](docs/AGENTS.md) for contributor prose.

## Workflow

- Keep one change focused on one observable behavior, and update its tests and owning documents when the behavior changes.
- Preserve Host authority, persisted document shape, revision checks, field-level human-priority conflicts, AI-switch enforcement, undo behavior, and native DSH composer integration.
- Validate untrusted JSON, HTTP input, imported canvas documents, and tool arguments at their boundaries. Keep existing error codes and failure causes.
- Update both sides of a bilingual documentation pair in the same change. Keep the content equivalent; no translation-record command is active in this package.
- Keep credentials, `.spike-e2e/`, browser artifacts, caches, and generated output out of commits. Follow the plugin-specific exclusions in `.gitignore`.
- Do not add dependencies or configuration unless an active plugin consumer requires them.

## Verify

Run the checks that cover the change from the repository root:

```sh
npm test
node --check index.js
npm run test:e2e
```

`npm test` runs the Host and client smoke suites and is the normal required check. Run the syntax check when a JavaScript entry changes. Run `npm run test:e2e` only when DSH, Chrome, credentials, and an isolated `DSH_HOME` are available; it is optional and must never use the real DSH store. Report commands actually run and distinguish unavailable prerequisites from failures.

The governance template's TypeScript, Vitest, pnpm, coverage, workspace, and aggregate-gate tooling is not integrated as active plugin checks. The manifest and current CI do not define or invoke those gates; use the commands above and root instructions as the source of truth.

## Review and release

Review changes against the product context, ADRs, [defensive guidance](.agents/skills/), and the actual tests. Local review-policy files do not prove remote branch protection or a successful GitHub workflow. The package is private, source-distributed through GitHub, and installed as a DSH bundle; it must not be published to npm.

## License and provenance

Contributions to the plugin are accepted under the repository's MIT [license](LICENSE). Do not copy incompatible code, assets, or documentation. Record imported-source provenance in [SOURCE-LICENSE.txt](SOURCE-LICENSE.txt) when the imported surface changes.
