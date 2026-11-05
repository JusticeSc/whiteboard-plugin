# Documentation guidance

This subtree contains product context, architecture, development, testing, and release documentation for the root-level JavaScript/ESM DSH plugin. Read [project context](PROJECT-CONTEXT.md) for product facts and the root [AGENTS.md](../AGENTS.md) for repository-wide requirements.

## Writing

- State current, verified behavior. Keep rationale in its decision owner and link to the source, test, or product document that owns each detailed fact.
- Keep one physical line per paragraph; use Markdown soft wrapping. Preserve code, tables, and list structure.
- Update English and Chinese pairs together, preserving equivalent meaning and links. This repository has no active translation-pairing command; review both sides directly.
- Document JavaScript/ESM plugin ownership and actual package commands. Do not assume a TypeScript workspace, docs build, coverage gate, or template checker.
- Keep safety and compatibility limitations explicit, including Host ownership of persisted canvas state and the isolated `DSH_HOME` requirement for end-to-end checks.

## Scope

Use [architecture](architecture.md) for runtime roles, [development](development.md) for contributor workflow, and [testing](testing.md) for active verification. The active package checks are declared in the root `package.json`: `npm test` and optional `npm run test:e2e`; `node --check index.js` is the focused syntax check documented by root instructions.

Governance-template documents or scripts that describe TypeScript, pnpm, translation pairing, doc budgets, or aggregate gates are reference-only unless the package manifest and current CI explicitly activate them. The current docs subtree has no automated budget or translation-pairing gate.
