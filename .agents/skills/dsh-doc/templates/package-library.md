# Template: package-library

Use this template for a package whose entry exports a plain module API: functions, classes, and types that callers import. Inspect the manifest and real entry rather than inferring shape from the folder name.

A library README distinguishes dependency use, exported decisions, and deliberate boundaries. It has no host mount or profile-install path, but still classifies its actual model effect as `none`, `indirect`, or canonical behavior, or records a justified audited exemption. A model-free library must not invent a model flow.

## Frontmatter

```yaml
---
description: "What the library lets a caller build, in one or two concrete sentences with the consuming packages or searchable domain terms."
kind: "package-library"
---
```

## Skeleton

```markdown
# <package-name>

English | [中文](README.zh.md)

## Summary

Three to five sentences and at most 100 `wc -w`-style words: what a caller can DO with the library, who consumes it, the smallest entry point, and the main boundary. Apply the [Summary voice rules](../SKILL.md#voice-and-judgment).

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### When to use it

Name the consuming call sites (which app, package, or runtime imports it) and the decision the caller delegates to it.

### Entry point

The smallest import-plus-call that works, in a `ts` fence, followed by what success and failure look like. Link the owning contracts in `src/index.ts` for exact detail instead of restating them.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Design notes and a source-map table. No API catalogs.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Adjacent pages, closest prerequisite first.

<a id="model-experience"></a>
## Model Experience

Follow `scripts/package-readme-policy.manifest.json`: `noModelExperience` may omit this section only with its audited generic/model-agnostic reason; `sentenceModelExperience` assigns the approved none/indirect form, otherwise use the actual canonical form. The model exemption is independent of `noLimitations`. Never invent interaction or restate a consumer's implementation to fill a section.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

Current consumer and maintenance constraints as top-level bullets, or the owning check's justified audited no-limit allowance after source/test review. Never invent a limitation or substitute a cleanup queue.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
```

## Rules

- **Classify by the entry, not the folder.** Read `src/index.ts` and `package.json`: a plain module API with no runtime host surface is a library.
- **Describe only what the package owns.** Validation rules, accepted record shapes, and type definitions belong to this package; fetching, installation, and rendering belong to its callers.
- **Keep the artifact plane honest.** A packed consumer imports the root export from `lib/`; source tests import the workspace through the root `paths` map. Do not document a source subpath the manifest does not export.
- **No invented install path.** A library is consumed as a dependency; do not describe a host, profile, or discovery-page install that this repository does not provide.
- Re-run `pnpm run verify-translation-pairing --write packages/<group>/<pkg>/README.md` after editing the pair.
