# Template: package-reference

Use `kind: package-reference` when `scripts/package-readme-policy.manifest.json` assigns it through `defaultPackageKind` or a reasoned `packageKinds` entry. Describe the actual runtime contract identified from manifest and entry. This conditional template does not require a plain library to adopt a host. Read the real composition/loader contract before documenting installation; a plugin mount and bundle activation are different operations.

## Frontmatter

```yaml
---
description: "The concrete capability readers choose, configure, or debug, with searchable domain terms."
kind: package-reference
---
```

## Skeleton

1. One H1 with the actual package name, followed by the bilingual switcher.
2. `## Summary`: three to five sentences, at most 100 English words, explaining what readers do, when to choose it, cost, and boundary, not runtime identity narration.
3. `## Table of Contents`: link actual H2 sections.
4. `## Use this package`: orientation, when to choose/avoid, the smallest verified mount/configuration, observable success and failure, recovery, and a field/default/meaning table only for decision-relevant fields. Link the actual generated configuration owner if one exists; do not invent a catalog or host command.
5. `## Understand the implementation`: visible title/anchor, with concept-level design, ownership, lifecycle, and dataflow folded under `<details>`. Link source for exact detail; no API/JSDoc inventory.
6. Optional `## Further Exploration`: three to seven directly useful adjacent owners, prerequisites first.
7. `## Model Experience`: actual policy-assigned canonical or audited sentence form; see [classification rules](../references/review.md#package-readme-review). Quote stable owned model text verbatim; link schemas at their generated owner. A model-agnostic generic package may omit this section only through a reasoned audited policy exemption, never by assuming no current model means no duty.
8. `## Known Limitations and Deferred Work`: durable consumer gaps and maintenance traps, or the independent justified no-limit policy allowance. No ordinary cleanup inventory.
9. Final anchored `### Dev Note` inside limitations, folded and explicitly non-authoritative; `None.` if empty. Named audited section exemptions determine the final heading shape.

## Verification

Mount the real entry in its supported composition and execute every documented command, setting, default, and failure claim before asserting it. A bundle-only activation command is not a plugin install path. Current source-compatible Cordis hosts identify service/default or `apply` entries; other hosts bind their actual entry contract in documentation policy rather than inheriting Cordis by analogy. Exercise useful valid and invalid kind/format fixtures through the actual documentation runner. Review the counterpart's meaning, then scoped pair confirmation and applicable docs checks. Structural green is not operational or designer approval.
