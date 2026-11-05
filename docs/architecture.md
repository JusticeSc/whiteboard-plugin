# Architecture

English | [中文](architecture.zh.md)

This package is a root-level JavaScript/ESM plugin for DeepSeek Harness (DSH), not a TypeScript workspace. Read [project context](PROJECT-CONTEXT.md) and the product ADRs for the detailed contract; this page maps runtime ownership and data flow.

## Runtime boundaries

- `index.js` is the Host entry. It registers storage, routes, and the `whiteboard_read_selection` and `whiteboard_replace_selection` tools.
- `host/` owns the canvas model, validation, durable store, single-writer engine, HTTP routes, and tool contracts.
- `client.js` owns browser rendering, the native right-sidebar tab, and the session-scoped selection-reference bridge. It does not own durable state.
- `test/` contains Node smoke suites for Host and client logic plus an optional isolated browser/model end-to-end check.

The Host is the only owner of persisted canvas and session-preference state. Client selection data is a session-scoped bridge reference; the normal DSH composer remains the only conversation input surface. Host writes use revision checks, field-level human-priority merging, stable error codes, and one undo step per operation.

## Bundle boundary

`package.json` declares the private package, ESM exports, DSH engine range, client injections, and `cordis.patch.yml` bundle patch. The patch inserts the plugin into a DSH bundle; it is not a second application workspace. Locale metadata and `icon.svg` are package resources.

## Extension points

HTTP canvas operations are under `/api/whiteboard/v2`. Model-facing changes belong in the Host tool schemas and engine contracts; sidebar and composer changes belong in `client.js`. Changes to persisted documents, tool errors, or DSH registration require updates to the owning product context, ADR, tests, and release evidence.

This plugin has no `apps/` or business `packages/` members. Template-provided TypeScript, Vitest and pnpm-workspace gates are not active; consult the package manifest and CI for runnable checks.
