# Documentation review and calibration

## Newcomer test

After three to five linked pages, an engineer without repository context can explain the feature, use it safely, locate state and owners, recognize failure, and identify where to change it. Restore missing public explanation if source inspection is needed merely to discover the normal flow. Move unrelated internals deeper. Judge outcomes, not presence of template headings.

## Evidence review

Check each material statement against its strongest owner: manifest for names and entries, public types/JSDoc for API contracts, runtime for effects, tests for exercised paths, generated catalogs for inventories, and active decisions for rationale. Prior README or report is not stronger than current code. Compare an existing page against the fetched current trunk identified by the live repository; do not assume a branch name or rely on memory.

Execute every claimed command, configuration, default, error, and platform operation against the current tree, including representative failure cases. Reading an implementation does not prove an operational result. Missing key/network/tool or permission means name the limit and verification owner rather than assert success. Do not require model credentials for model-free behavior. Keep source and derived documents synchronized owner-first.

## Package README review

Require:

- searchable concrete metadata and mechanically derived kind;
- three-to-five-sentence Summary of at most 100 English words describing what the reader does, not internal registration identity;
- linked contents and orienting paragraphs before dense detail;
- when to choose or avoid it, smallest safe real entry path, success/failure and relevant security/durability/performance limits;
- concept-level developer ownership, architecture and data/lifecycle flow, with exact detail linked to types/code rather than an API catalog;
- actual model-effect classification: `none`, `indirect`, or canonical behavior, or a justified audited exemption; even a library must classify honestly, never invent a model flow;
- durable consumer and maintenance limitations, or an owner-approved justified no-limit allowance, not a cleanup queue;
- final two H2 sections `Model Experience` and `Known Limitations and Deferred Work`, with the final anchored `### Dev Note` inside limitations; only a named audited exception changes that shape;
- optional directly useful Further Exploration before those final sections.

Group maps own no runtime model/limitation sections. Parser-owned/generated/Note/postmortem formats use named skeleton exceptions. No copied profile install path for a plain library. No implementation narration, repeated sibling rationale, or exhaustive generated inventories in prose.

The actual policy is `scripts/package-readme-policy.manifest.json`. Its reasoned `noModelExperience` map permits generic/model-agnostic packages to omit that section; its `sentenceModelExperience` map owns none/indirect statements. `noLimitations` independently exempts limitations with its own justification. No model section is not an unclassified gap when this audited reason exists; equally, a no-model exemption never removes durable limitation duties. Four README kinds (`package-group`, `package-reference`, `package-library`, `package-bundle`) route to their own templates through policy; upgrade and persistence record kinds are separate.

## Semantic calibration

Read the actual kind template before authoring. Use reviewed target package pages only for applicable reader flow, not as evidence their operations have been rerun. Apply [prose examples](../../dsh-prose-standard/references/examples.md) to complete propositions and [leakage examples](../../dsh-trim-cot-leakage/references/examples.md) to sanctioned history and near-miss keeps. A pattern, sentence length, gate count, or hash is not semantic certification. English 20/25-word prompts are review heuristics, never quotas. Translation genre samples have their own [approval status](../../../../docs/i18n/style-samples.md); do not manufacture human approval.

## Verification

For a changed acceptance rule demonstrate a useful valid fixture and an invalid fixture through the real top-level format runner. Run scoped tests and the relevant metadata/kind, Summary, model-effect, limitation, type-reproduction, pair, link, budget and Skill metadata checks through their actual manifest entries. `pnpm run verify-type-equiv` applies when type/JSDoc reproductions exist. `pnpm run test:docs` and PR-level `pnpm run doc-sync` complement, not replace, meaning review and the newcomer test. Report exact exercised surfaces; pending CI and unrun platforms stay unverified.
