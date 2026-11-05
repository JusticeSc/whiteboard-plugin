---
name: dsh-find-simplifications
description: Find evidence-backed simplifications in this repository's code, APIs, configuration, tests, and prose; write or consolidate proposals, identify small inline cleanups, or assess simplifications from another branch. Use for removing dead, duplicated, speculative, or unnecessarily maintained behavior and infrastructure.
---

# Finding simplifications in this repository

Find changes that remove maintained obligations: APIs, representations, lifecycle states, configuration paths, dependencies, tests, or documentation. Prefer a few well-supported candidates over a count of deletions. This is guidance, not a checklist; keep the user's scope and distinguish a survey from permission to implement its proposals.

**Plugin scope:** This checkout is a root-level JavaScript/ESM plugin, not the upstream TypeScript workspace. [AGENTS.md](../../../AGENTS.md), [package.json](../../../package.json), and the [CI workflow](../../../.github/workflows/ci.yml) define active checks; upstream pnpm, documentation, and archive verifiers are not installed. Bilingual pairs are reviewed manually without a sidecar.

## Establish scope and constraints

Read `AGENTS.md`, [architecture](../../../docs/architecture.md) before judging packages, [defensive patterns](../../../docs/defensive-patterns/README.md), and [testing policy](../../../docs/testing.md). Consult the relevant active Agent Notes for intentional decisions; use the [note rules](../../notes/README.md) for new records. Archived notes are historical examples, not current authority: never inspect, verify, or repair their outbound links.

Preserve current data contracts and their shared type and validation owners. Keep source and artifact planes distinct and evaluate proposed removals against actual consumers and the user's authority. Unused members remain candidates when removing them preserves the contract.

For broad requests, divide independent domains along actual project boundaries, including relevant code, tests, configuration, and documentation. Give each agent a bounded domain and require consumer evidence and rejected alternatives. Inspect substantial production machinery as well as obvious unused symbols; do not stop after the first promising deletion.

## Search for removable obligations

Use these questions to guide discovery. Calibrate a candidate against the current owner's code, tests, and Agent Notes; a past decision illustrates a trade-off, not a current deletion inventory.

- **Does a declared feature have a complete effect path?** Trace producer, transformations, provider or endpoint support, and observable result. A field copied everywhere may still have no setter, no reader, or only implementations that reject it. Search constructors and discriminant emitters as well as callers.
- **Which distinctions change a consumer's action?** Several internal states may require one model-facing status or one usable identifier. Keep internal distinctions that control authorization, residency, durability, or ownership; remove public distinctions that only invite an unusable choice.
- **Could a smaller explicit behavior remove the subsystem?** Fixed intervals, caller-supplied time zones, or reported activation failure can eliminate generalized calendars, persisted defaults, or automatic rollback. Name the capability given up and the machinery deleted. A production caller makes this a behavior decision, not an automatic rejection; implementation must remain within the user's authorization.
- **Can a consumer read the authoritative value when needed?** Look for copied histories, promotion ledgers, invalidation events followed by reads, and feature caches beside a shared projection stream. Derivation or reuse may delete subscriptions, retained data, stale-response handling, and recovery paths together. Establish the required time of observation first.
- **Is composition being mistaken for policy?** Optional service presence, a provider method, or a sibling tool can express availability without deciding deployment behavior. Explicit configuration or a caller-intent operation may remove registries and dependency checks. Preserve distinct operations when their ownership or completion timing differs.
- **What owns the complete maintenance cost?** Trace pass-through configuration, duplicate application trees, demo launchers used by products, resolver-only workspaces, and installation helpers with their own upgrade lifecycle. Compare the entire removed system with the replacement, including residual glue; moving complexity or adding a gate to keep duplicate definitions equal does not remove it.

## Prove reachability and the trade-off

Start with `rg`, then read the matches. Search exact symbols, property reads and writes, config keys, package names, exported type names, and both `term(` and `.term(` call forms. Tests and declarations can show a contract without proving a shipped producer or consumer.

Include actual `packages/*/*/src`, `apps/*/src`, `scripts/`, workspace discovery and configuration, package manifests and built artifacts, `.github/` workflows, and their owning documentation and Agent Notes. Classify examples and fixtures by their actual entry point rather than directory name. Follow generated artifacts to real consumers; documentation-only examples are not fixed callers, while manifest fields used by packed consumers are. Ensure unused-code analysis covers manifest-driven entries and generated outputs.

For each candidate, record the current owner, effective producer/consumer path, what disappears, what remains, and the strongest reason to retain it. Distinguish:

- removal of unreachable or unread behavior;
- a narrower public or product behavior with an explicit loss;
- a protected obligation or insufficient evidence.

Reject a candidate when it breaks a retained obligation, merely relocates the same complexity, or has no meaningful reduction. Read rejection reasons at the level of the proposed change: a stale inventory or a mixed proposal's rejected behavior does not settle every independent item. Refresh the evidence before re-proposing one. Small local improvements belong in actionable `TODO`/`FIXME`/`XXX` comments under the [urgency rules](../../../docs/development.md), not standalone design records.

## Preserve ownership and failure semantics

For copies, freezes, validators, and callback captures, name the value's origin, next owner, and trust boundary. Typed same-process calls ordinarily borrow readonly values; parsers, config loaders, durable files, workers, and subprocesses own or validate their inputs. Hostile-getter or callback-replacement tests do not establish a requirement by themselves. A frozen root does not prove its descendants immutable, and equal ids do not prove object identity.

For asynchronous machinery, map each promise, flag, cancellation path, disposer, and reservation to its owner and transition. Collapse mechanisms only when they express the same fact. Preserve synchronous publication and rollback, callback containment, first-terminal-outcome arbitration, worker/process ownership, and dispose-to-quiescence where required. Durable markers can record real facts even when reporting ignores them; preserve documented recovery and previous-data guarantees.

## Replace infrastructure only for a net reduction

Follow the [defensive patterns for infrastructure](../../../docs/defensive-patterns/general.md) and the [package surface rules](../../../docs/defensive-patterns/README.md). Search existing dependencies and Node builtins at the engine floor before adding a package. Identify the exact implementation and dedicated tests the replacement deletes, its maintenance and transitive cost, and every residual behavior the glue must preserve.

Dependency replacement is preferred when all four gates hold: (1) net deletion of owned implementation, tests, and contracts after residual glue is counted; (2) healthy maintenance, real usage, and acceptable transitive dependency cost; (3) boundary and semantic fit, including the exact mismatches the shim must still own; and (4) no reopening a settled design seam merely by invoking a dependency slogan. A past rejection is scoped evidence, not a permanent package blacklist: revisit only with new evidence. This section owns those four gates; general infrastructure guidance does not replace them. Calibrate reachability and retained guarantees with [historical-pattern distinctions](references/historical-patterns.md), not a copied deletion inventory.

Exercise the mismatches most likely to defeat the replacement: protocol truncation, cancellation and teardown, configured bounds, deterministic test clocks, platform packaging, and source versus built entry points. A library that covers framing but requires rebuilding the same framing to enforce a size limit is not a simplification. An accepted edge-behavior change belongs in the proposal and relevant tests. Do not re-prove a dependency's generic specification while omitting tests for the harness-specific shim.

## Record, consolidate, and validate

Use [dsh-prose-standard](../dsh-prose-standard/SKILL.md) when prose is in scope. Remove code-restating or remotely owned explanations while preserving local behavior, timing, ownership, and failure obligations. Update affected READMEs, JSDoc, actual generated artifacts, configuration, and snapshots with their owning change.

A substantial proposal uses the mandatory note skeleton: `Problem`, `Proposal`, `Alternatives considered`, `Acceptance criteria`, and `Risks`. Include concrete consumer evidence, the removed maintenance cost, the capability given up, and observable acceptance conditions. An implemented decision uses the [implemented format](../../notes/README.md#the-file-format) instead. Update an existing owner when the decision is the same; do not create duplicate notes to preserve candidate counts.

Every new note requires a scoped supersession check through [dsh-archive-agent-notes](../dsh-archive-agent-notes/SKILL.md). That workflow owns retention, consolidation, triplet deletion, and frozen archive mechanics. A code survey does not imply a repository-wide note audit. Preserve partial supersessions and current durable, wire, compatibility, or rejected-alternative obligations.

When folding another branch, compare its independent diff against the target base, port only supported non-overlapping proposals, and consolidate overlapping rationale. Closing another PR requires authorization or clear ownership of that housekeeping.

For docs-only Agent Note work, run `pnpm run doc-sync`, `pnpm run lint`, and `git diff --check`; for skill or comment edits, include the applicable validator. Select other checks through [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md). Report the surveyed areas, supported candidates, meaningful rejections or deferrals, notes added/consolidated/retained/removed, and commands actually run. Use a draft PR while the survey is expanding; do not describe an unverified search as exhaustive.
