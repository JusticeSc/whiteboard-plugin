# Template: package-bundle

Use `kind: package-bundle` only when `scripts/package-readme-policy.manifest.json` assigns this kind to an actual installable composition/layer package, with a reason grounded in its manifest and entry behavior. A conditional template is not permission to add a bundle host. Ordinary libraries and individually mounted plugins use their own templates.

## Frontmatter

```yaml
---
description: "The observable capabilities this composition layer adds, for readers choosing or customizing it."
kind: package-bundle
---
```

## Skeleton

1. Actual package H1 and bilingual switcher.
2. `## Summary`: three to five sentences, at most 100 English words: the layer's observable gain, where it is included, how a user adds/removes it, and its main boundary.
3. `## Table of Contents` linking the real H2 sections.
4. `## Use this package`: orientation, smallest safe verified install/remove or activation path, resolution location, reconcile/activation effects, and missing-declaration/conflict failure modes. State what each inserted component contributes and link its behavior owner. Read the real target host interface; do not copy a source-product command that does not exist.
5. `## Understand the implementation`: visible title/anchor and a `<details>` concept-level explanation of the actual composition/patch document, insertion IDs, platform conditions, overrides, and ownership. Link exact source, never duplicate an exhaustive API catalog.
6. Optional `## Further Exploration`: group, real composition contract, and adjacent owners.
7. `## Model Experience`: the audited sentence or canonical form assigned by policy. Bundle carriers generally have no direct effect or an indirect effect through inserted packages; those packages own exact model behavior. A reasoned `noModelExperience` policy exemption is allowed only after actual audit, independently of limitations.
8. `## Known Limitations and Deferred Work`: durable override/platform/conflict constraints or the policy's justified `noLimitations` allowance.
9. Final anchored `### Dev Note` inside limitations, folded and non-authoritative; `None.` if empty. Follow named audited section exemptions for heading shape.

## Rules

The target policy's `packageKinds` selects this kind and records its reason; `allowedKinds` does not prove a package is a bundle. Verify actual activation semantics, not just a metadata label. The source host used `dsh.bundle.patch` and profile reconciliation; those names are not target requirements without that host. Execute documented operations against fresh scratch state, including failure and removal, and observe external effects. Preserve a component's separate metadata and model-effect owner. Review both languages and confirm the scoped pair only after semantic review; run the actual kind/format and docs checks.
