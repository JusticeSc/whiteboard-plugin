---
name: dsh-doc
description: Create, restructure, review, audit, or migrate Markdown documentation, package READMEs, and contributor prose using audience-first hierarchy, kind-mapped YAML metadata, bilingual line alignment, summary/contents navigation, progressive user-to-developer detail, executed-operation fact-checking, and repository validation. Use for new or revised docs, docs-tree organization, documentation-quality audits and budgets, and bilingual structure changes.
---

# Documentation workflow

**Plugin scope:** This skill retains upstream template guidance, not an installed documentation system. This checkout is a root-level JavaScript/ESM plugin; [AGENTS.md](../../../AGENTS.md), [package.json](../../../package.json), and the [CI workflow](../../../.github/workflows/ci.yml) define its active checks. Workspace, TypeScript, pnpm, documentation-budget, translation-pairing, and type-equivalence commands below are conditional upstream references, not requirements or runnable gates here. Review bilingual pairs manually; no sidecar is required.

## Summary

Make every page searchable, newcomer-readable, and exact enough for maintainers: place each fact with its owner, keep the reader path brief, and never let prose drift from the code it describes. Apply repository `AGENTS.md` files and the executed gates first, then this workflow for metadata, progressive detail, bilingual alignment, and corpus audits. Describe actual package rules from the consumer's point of view.

## Table of Contents

- [Workflow](#workflow)
- [Fact-check procedure](#fact-check-procedure)
- [Placement and kinds](#placement-and-kinds)
- [Page structure](#page-structure)
- [Voice and judgment](#voice-and-judgment)
- [Audit the corpus](#audit-the-corpus)
- [Wordcount budgets](#wordcount-budgets)
- [Validation](#validation)

## Workflow

Follow this sequence for each requested scope. Keep the common reader path brief, but do not delete failures, ownership, limitations, or other required contracts merely to reduce words.

1. Read root and more-specific `AGENTS.md`, [the documentation standard](../../../docs/AGENTS.md), the target page, its source/tests, the navigation owner, and the bilingual record.
2. Classify the page by one primary job and reader: quick start, task guide, contributor tutorial, architecture overview, package/group reference, upgrade guide, agent instruction, decision record, postmortem, or scratch.
3. Place the page at its nearest owner. Keep package contracts beside package code; use `docs/` for cross-workspace learning, development, architecture, test policy, and discussion.
4. Define the reader's starting state, observable outcome, likely failure, recovery path, and next useful depth before writing details.
5. Add or revise YAML metadata, then write `Summary`, `Table of Contents`, user-facing content, developer-facing content, optional `Further Exploration`, and final `Dev Note` in that order where the kind permits.
6. Update the bilingual counterpart in the same pass. Keep headings, lists, tables, code, links, frontmatter layout, and physical line count aligned.
7. Verify every claim against code, tests, package metadata, or a current decision owner, and run the operations the page instructs.
8. Run focused checks, then `pnpm run test:docs`, `pnpm run doc-sync`, `pnpm run lint`, and `git diff --check`; re-read the complete diff for correctness and repository fit.

## Fact-check procedure

Documentation states how the code behaves today, and the only admissible evidence for an operation claim is having run it. The procedure is mandatory for every new document and every new paragraph that claims an operation, command, default, error, or platform difference.

1. **Read the real interface first.** Open the implementation and manifest for the command or API you describe. Do not infer a flag, output field, exit status, cache location, or package shape from another project or an older README.
2. **Run it.** Execute the documented command with representative and boundary inputs, including one failure case. Record the exact observed output, side effects, and exit status. Never copy an untested command into a page.
3. **Write only observed behavior.** State the requirement, the result, and the recovery path. If you cannot execute a claim, remove it or label the limitation instead of asserting it.
4. **Check every relative link and command path** against the real tree, including links that cross workspace boundaries.
5. **Prefer the owner.** If a statement duplicates source, tests, a generated file, or another page, link there instead of maintaining a second copy.
6. **Re-run the page's own instructions** before merging a change that touches them.

## Placement and kinds

Kind metadata selects the page's template. Open the template before writing and follow its skeleton.

| Kind | Use for | Template |
|---|---|---|
| `package-group` | `packages/README.md` and `packages/<group>/README.md` — orient a family and map its direct packages | [package-group.md](templates/package-group.md) |
| `package-library` | A package with a plain module API and no runtime host surface — consumer entry points, exports, limits, verification | [package-library.md](templates/package-library.md) |
| `package-reference` | Runtime package contract selected by the target README policy; document actual entry/composition, not an invented host | [package-reference.md](templates/package-reference.md) |
| `package-bundle` | Actual installable composition/layer package selected with an audited policy reason | [package-bundle.md](templates/package-bundle.md) |
| `upgrade-guide` | A release-to-release migration for an externally observable break | [upgrade-guide.md](templates/upgrade-guide.md) |
| `persistence-change` | A mechanically detected persisted-type acknowledgement with generated schema companion, not an inferred historic format or release | [persistence-change.md](templates/persistence-change.md) |

Cross-cutting pages under `docs/` follow the tier rules in [docs/AGENTS.md](../../../docs/AGENTS.md); they do not need a package template. Skills, Agent Notes, and postmortems are owned by their directories. Add a new kind only with a distinct template, a documented repository position, and a focused check that maps documents to it.

README classification is owned by `scripts/package-readme-policy.manifest.json`: `allowedKinds`, `groupKind`, `defaultPackageKind`, and reasoned `packageKinds` assignments. Read actual manifests and entries to justify each kind; a policy label does not create a plugin or bundle host. This template has no package-specific assignments and defaults new package READMEs to `package-reference`; assign `package-library` when a real plain library has no runtime host surface. Runtime-host kinds are conditional, not a requirement to adopt Cordis. Actual persisted-type acknowledgements use the separate non-README `persistence-change` kind; `upgrade-guide` separately owns externally perceptible reader migration. Do not invent persistence-release or historical-format objects.

## Page structure

1. Frontmatter with `description` and `kind`, then one H1 title.
2. Language switcher for a bilingual page.
3. `## Summary`: three to five explanatory sentences stating what the reader can do or observe, why it matters, the operating model, and the most important boundary. English package Summaries stay within 100 words; a shape/word-count gate does not prove their meaning.
4. `## Table of Contents`: links to the page's H2 sections.
5. Stable content ordered from user-facing use to developer detail: setup and run, inputs and outputs, rules and behavior, failure and recovery, integration, limits. Open substantive H2 sections with orientation before dense detail.
6. Optional `## Further Exploration` for adjacent subjects before the final package sections.
7. Package READMEs end with H2 `Model Experience` and `Known Limitations and Deferred Work`; final anchored `### Dev Note` belongs inside limitations. Classify actual model effects (`none`, `indirect`, or canonical), including libraries, or use a justified audited exemption. Keep durable limitations or a justified no-limit allowance, never invent model behavior or cleanup lists. Group maps have no runtime model/limitation sections. Other authored pages end in non-authoritative `## Dev Note`; parser/generated/Note/postmortem exceptions need their named owner. Fold heavy concept-level detail, not API catalogs. Write `None.` for empty working context.

The same policy's `noModelExperience` is a reasoned audited exemption equivalent to the source generic/model-agnostic no-section registry. It may omit Model Experience; `sentenceModelExperience` owns approved none/indirect statements. `noLimitations` is independent: a model exemption never implies a limitation exemption. Honor the actual policy, not an unconditional “all libraries omit” or “all packages must add” rule. Current absence of model business never permits inventing model behavior.

An example or installation section must describe the real artifact and its actual consumption path. Do not invent installation, hosted discovery, or model-visible registration.

## Voice and judgment

- **Summary says what the subject does.** The opening Summary and user-facing sections describe outcomes, benefits, and when to choose the subject, never its role, type, or internal identity.
- **Developer sections explain, never enumerate.** Fold implementation content to the concept, architecture, and data flow; link code for exact detail. No full API catalogs, exhaustive column lists, event-payload enumerations, or JSDoc restatement.
- **Current state only.** Ordinary documentation describes the current codebase. Historical evidence belongs in its dedicated record, and the Dev Note is the only non-authoritative zone.
- **One owner per fact.** Link the real owner of a contract, validation rule, shared type, or application wiring rather than duplicating it.
- **Defensive prose.** State non-obvious contracts, limits, and failure behavior. Delete implementation narration, test walkthroughs, review history, and duplicated rationale.
- **Truthful provenance.** Keep source license and attribution statements accurate. Do not claim a consumer, service, deployment, or enforcement that this repository does not contain.

Use [dsh-prose-standard](../dsh-prose-standard/SKILL.md) for sentence-level contract coverage and editorial judgment.

## Audit the corpus

- Find pages whose subject, paths, commands, or package names no longer exist.
- Follow generated references to their generator; fix the generator, not the output.
- Verify navigation entries resolve and every moved page's inbound links were repaired.
- Compare each bilingual pair's meaning, terminology, and structure, not just its recorded hashes.
- Report budgets and link counts as observations, not as proof that content is correct.
- Audit all nine slop classes: duplicated rules; change/history narration; hand-kept status; code-derived catalogs; implementation/control-flow narration; repeated sibling rationale; paragraph walls; decorative emphasis inflation; and future-tense implemented specifications. Apply semantic judgment, not banned-word deletion.
- Classify tutorial versus reference by reader job, split substantial mixed forms, and order tutorial prerequisites before dependent actions. Scratch has an owner, creation/expiry date, and promotion target. Dev Note never becomes a second writable task queue; promote durable facts/rationale/incidents to their real owners and delete resolved chatter when closing.

## Wordcount budgets

Budgets bound the reader's working set; they do not license deleting necessary obligations.

- Package Summary: 100 English words.
- Package README total: 2000 English words; developer detail stays folded.
- Cookbook and development pages: 2500 English words unless their subject requires a longer reference.
- Agent Notes and postmortems follow their own directory rules.

Prefer relocating detail to its existing owner, then condensing without changing propositions, then justifying an owner-specific ceiling increase. Budgets are guardrails, not reduction quotas; retain 5% headroom where applicable. `pnpm run verify-doc-budgets` measures only the pages in its manifest; other ceilings above are authoring guidance. The command never proves correctness.

## Validation

- `pnpm run doc-sync` — the complete documentation gate.
- `pnpm run test:docs` — quick pairing, wrap, link, budget, skill metadata, and Agent Note checks.
- `pnpm run verify-md-links` and `pnpm run verify-md-wrap` — targeted link and line-wrap repair.
- `pnpm run verify-translation-pairing --write <path>` — refresh a pair's record after an intentional edit; never use `--write` to make an unexplained mismatch disappear.
- Re-run every command the page instructs before merging a claim about it.

Report what each command actually checked. A green local run does not prove that a remote workflow, review gate, or consumer integration enforced it.

## Detailed references

Load the relevant complete branch, not only this entry's summary:

- [Metadata, links, and bilingual pairs](references/metadata-links-i18n.md): kind-to-template mapping, concrete descriptions, renderer-valid paths, line alignment, and confirmation records.
- [Page structure and hierarchy](references/structure-hierarchy.md): tutorial/reference depth, nearest owners, atomic moves, scratch expiry, and Dev Note lifecycle.
- [Page style](references/style.md): controlled technical English, semantic emphasis, valid separators, and visible heading/anchor folds. The 20/25-word prompts are not mechanical limits or certification.
- [Review and calibration](references/review.md): actual facts, package model/limitation classification, valid/invalid format evidence, semantic examples, and the three-to-five-page newcomer test.
- [Conditional website workflow](references/website-sync.md): canonical Markdown, public allowlist, tested projection/link/image behavior, raw twins/index, and separate deployment authority. There is no website command or deployment implied by this template.

For documented type/JSDoc reproductions, change canonical source first, synchronize every bilingual copy, and run `pnpm run verify-type-equiv`. A single source type owner does not replace published-copy drift checking. Routine translation remains one lightweight active-agent pass; never auto-load the manual-only extended translation Skill.
