# Metadata, links, and bilingual pairs

The kind system and policy fields below are upstream template examples, not installed plugin checks. This root-level JavaScript/ESM plugin has no workspace README-policy manifest or translation-pairing verifier; follow [docs/AGENTS.md](../../../../docs/AGENTS.md) and [manual pairing rules](../../../../docs/i18n/README.md) for current documentation.

## README metadata

Descriptions are retrieval interfaces: state concrete capability and when to open the page, with searchable terms distinguishing neighboring owners. Reject advertisement, repeated title/audience, ungoverned tags, volatile inventories, or a technical status report. Package READMEs require lowercase `description` and `kind`; the manifest owns names, filenames own counterpart location, and the sidecar owns consistency. Do not add redundant `name`, `audience`, `tags`, or README-local `i18n` fields.

## The kind system

Each active kind maps to exactly one template, and each kind template maps to one mechanically identifiable document job. Read real manifests, entries, and the [documentation standard](../../../../docs/AGENTS.md), not directory names or remembered source-product roles.

| Kind | Position and subject | Template |
|---|---|---|
| `package-group` | `packages/README.md` or `packages/<group>/README.md`; direct package navigation, no runtime contract | [Group](../templates/package-group.md) |
| `package-library` | Package README with a plain importable API and no runtime-host install surface | [Library](../templates/package-library.md) |
| `package-reference` | Runtime package contract selected by actual README policy and documented entry/composition | [Reference](../templates/package-reference.md) |
| `package-bundle` | Actual installable composition/layer package with reasoned policy assignment | [Bundle](../templates/package-bundle.md) |
| `persistence-change` | `docs/persistence-changes/YYYY-MM-DD-slug.md` and Chinese sibling; actual detected persisted-type acknowledgement with generated schema companion | [Persistence change](../templates/persistence-change.md) |
| `upgrade-guide` | `docs/upgrade-guide/v<version>/<item>/guide.md` and Chinese sibling; one externally perceptible release-to-next break | [Upgrade](../templates/upgrade-guide.md) |

README policy is `scripts/package-readme-policy.manifest.json`: its `allowedKinds` contains the four README kinds, `groupKind` owns group defaults, `defaultPackageKind` owns member defaults, and `packageKinds` maps real directory paths to `kind` plus `reason`. Read manifest/entry facts to justify assignments instead of treating policy as a host implementation. The plain API library is a dependency, not a profile install. Runtime reference/bundle templates remain available for actual matching packages without imposing Cordis or DSH manifest fields. `persistence-change` and `upgrade-guide` are separate non-README kinds. Do not infer historic checkpoints or release observations from durable data. A new kind requires a distinct template, unambiguous position/owner, and valid/invalid runner checks.

Model and limitation exceptions are independent policy maps: `noModelExperience` records a reasoned generic/model-agnostic no-section exemption, `sentenceModelExperience` supplies an audited none/indirect statement, and `noLimitations` records its own justification. Absence of model business can justify an audited exemption, never a fake model section or an unreasoned omission.

## Repository links and path mentions

Use renderer-valid relative Markdown URLs, fragment-only links within a page, and full external URLs. A leading `/docs/` URL resolves outside the repository on GitHub and is not an acceptable unchecked shortcut. Logical path mentions are relative to their discussion. Verify every target and anchor, including package boundaries. Moved topics update every inbound link and any site mapping atomically; preserve published routes or aliases.

## Bilingual line alignment

Both languages carry equal authority. Match frontmatter layout, heading depth, paragraphs, blank lines, list kinds/counts/order, table shape/order, code fences, and total physical lines. Translate naturally on corresponding lines; never hard-wrap to a word width. Fences and comments remain byte-identical; inline code and tokens are verbatim. Move first-use annotations without changing line structure.

Repository-relative links preserve the same semantic target and exact query/fragment suffix. In the active bilingual corpus English points to `.md`, Chinese to `.zh.md`; a missing required counterpart is an error. Outside that corpus retain the authored target. Switchers deliberately cross locales. Generated English may omit its switcher only to remain byte-identical to generator output; Chinese still links back.

## Manual consistency review

The [pairing rules](../../../../docs/i18n/README.md) describe current scope and exclusions. Update existing English and Chinese counterparts together and compare meaning, conditions, terminology, headings, lists, tables, code, and links directly. There is no active pairing verifier or required sidecar in this checkout. Rename or delete both sides and repair inbound links when authorized; archived Notes remain frozen.

Follow the [documentation writing rules](../../../../docs/AGENTS.md#writing); do not automatically load the manual-only extended translation skill. Structural similarity alone does not prove terminology, naturalness, or clause preservation.
