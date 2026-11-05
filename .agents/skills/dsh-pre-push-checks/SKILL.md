---
name: dsh-pre-push-checks
description: Use before pushing, force-pushing, marking ready for review, or claiming checks pass on a branch, and immediately after a history rewrite publishes branches, to select the smallest tests and checks that cover the outgoing diff without reflexively running the full repository suite.
---

# Pre-push checks

Select evidence for the actual `@local/whiteboard` JavaScript/ESM plugin. Read the root [instructions](../../../AGENTS.md), [manifest](../../../package.json), [testing policy](../../../docs/testing.md), and [CI workflow](../../../.github/workflows/ci.yml). No installed Git hook, TypeScript workspace, Vitest, coverage threshold, translation verifier, build or aggregate pnpm gate is implied by imported governance files. Nothing here proves remote enforcement or authorizes a commit, push, installation or live-store mutation.

## Inspect the change

Confirm the checkout, branch, comparison base and complete scope, including untracked governance additions:

```sh
git rev-parse --show-toplevel
git status --short --branch
git diff --stat
git diff --check
```

For a PR, verify its live head and base before reviewing their diff; do not guess a base or fetch/publish without the task's authorization. Reassess evidence after a base merge or history rewrite. A tracked diff omits untracked files, so inspect those separately.

## Select relevant evidence

- **Host or client behavior:** run `npm test`, which invokes the Host and client smoke suites. Check both runners' reported results; a zero-test run is not evidence. Add focused regression evidence for any changed contract.
- **JavaScript syntax:** run `node --check <file>` for each changed `.js` or `.mjs` file. `node --check index.js` matches the focused CI syntax step; syntax alone does not prove runtime behavior.
- **Governance-only changes:** verify every stated command against the manifest and CI, review all added files, check local links and paired prose, and run `git diff --check`. Do not add missing scripts or dependencies just to satisfy a template command.
- **Contract-preserving integration:** compare protected paths against a trusted Git baseline. Cover the manifest, license, bundle patch, Host/client source, locale, icon, tests and product contracts. Report Git-normalized content separately from raw bytes when checkout line endings differ.
- **Release or installation changes:** inspect the declared file list, exports, bundle patch, locale metadata and rollback instructions. A dry-run package list is not a publication or installation test. Do not publish this private package to npm.
- **Resource-owning or asynchronous tests:** consult [test reliability](../dsh-ci-test-reliability/SKILL.md) for applicable isolation and cleanup requirements; choose commands from the actual manifest, not upstream examples.

Run passing evidence once unless a later change invalidates its scope. Do not invent typecheck, build, translation, lint or coverage results for commands this package does not provide.

## Optional isolated end-to-end evidence

`npm run test:e2e` runs the v3 DSH + Chrome flow. It requires the real DSH runtime, Chrome, available model access and an isolated `DSH_HOME`. Inspect the runner before use: it creates its home under the repository's parent `.spike-e2e/dsh-home`, copies required credentials, and leaves artifacts. The repository's own ignore rules do not protect that parent directory. Confirm independent exclusion, permissions and cleanup before execution; never use the real store.

Do not substitute the legacy manual install/rollback script for isolated evidence: it can touch the real profile and needs separate review and authorization. If prerequisites or permission are missing, report E2E as not run, with the specific gap. Smoke results do not prove browser, model, installation, migration or rollback behavior.

## Handle failures and report

Record the exact command, result, selected test count and relevant platform. Investigate a nonzero exit before attributing it to the environment. Distinguish a failed assertion, unavailable prerequisite, skipped surface and pending remote result. Do not bypass a failing check or a hook without explicit permission.

Report what actually ran, what it covers, what remains unverified, and any unresolved finding with a location and consequence. A workflow file proves configuration only; inspect a real remote run before claiming CI passed. Branch protection, approvals and review ownership require separate live evidence.

## Authorized publication only

Commit, push and history rewriting are separate actions from local verification. If explicitly authorized, publish only after relevant checks pass and verify the remote ref and CI afterward. For a rewritten standalone branch, record the observed remote OID and use an exact `--force-with-lease=<branch>:<observed-oid>`; never use raw `--force`.

An official GitHub stack operation may rewrite and publish several heads before local post-sync checks can run. In that case re-query live heads and bases, inspect each changed layer, run its relevant checks, and leave merging blocked until they pass. A successful sync is not passing validation. Pending or unavailable remote evidence remains pending or unverified.
