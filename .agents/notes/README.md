# Agent Notes

English | [中文](README.zh.md)

An **Agent Note** records lasting decision rationale, rejected alternatives, consequences and required verification that code, tests and existing product documentation cannot carry. These rules are manually reviewed guidance for this plugin. No note-format, translation or archive verifier is installed; the manifest and CI own active checks. Existing product decisions remain owned by [DECISIONS.md](../../docs/DECISIONS.md) and [ADRs](../../docs/adr/), not duplicated here.

## Layout and naming

Use `{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`, with a `.zh.md` counterpart for a new bilingual note. Use the first-proposed date supported by the record, not an invented date. The lifecycle is:

- `proposed/`: substantial future work, not yet implemented or only partly implemented.
- `implemented/`: a shipped decision, kept factually current under [its instructions](implemented/AGENTS.md).
- `rejected/`: a declined proposal retained only while its rationale prevents a plausible, meaningful mistake.

The active lifecycle folders are the inventory; do not add a duplicate central index. Cross-reference the owning note through a relative Markdown link rather than an unexplained number or bare title.

## Classification

Choose one path-encoded class from this review convention; there is no classification gate:

| Class | Subject |
|---|---|
| `feature` | New user- or model-facing capability. |
| `bug-fix` | A defect or a gap identified by a postmortem. |
| `simplification` | Removal of code, behavior or surface without adding capability. |
| `architecture` | Shipped source structure, ownership or runtime vocabulary. |
| `process` | Tooling and workflow around the source, not runtime behavior. |
| `testing` | Test infrastructure or strategy. |

A mechanical refactor does not need its own class or note merely because code moved. Record a lasting naming, compatibility or ownership decision when it is not already owned elsewhere.

## When to write one

Create or update a note only for lasting rationale missing from existing owners. Before adding one, search active records for the same mechanism or decision and apply [supersession review](../skills/dsh-archive-agent-notes/SKILL.md). Update the current owner rather than duplicating it. Mechanical edits and minor local UI changes do not require a note.

Keep partial supersessions active and cross-linked. A different decision needs a new owner, not a rewrite of the old decision into its opposite. Full consolidation may delete an active old note only when the new owner preserves every unique rationale, alternative, consequence, required verification and named coverage gap; repair all inbound links and remove any active counterpart metadata together.

Consolidating a feature-addition note into a removal note requires complete absence from production code, configuration, schemas, durable and wire formats, migration, compatibility, current availability claims and supported-behavior tests. Preserve motivation, removal rationale, rejected alternatives, the capability given up, reintroduction conditions and actual absence evidence. Removing one transport, default or presentation is only partial supersession.

## The file format

Manually check that the status matches the lifecycle folder. Start with this literal header, followed by a blank line:

```markdown
# Agent Note: <title>

Status: <status>
```

Use `proposed`, `implemented`, or `rejected — <one-line reason>` for the status. The filename owns the first-proposed date; the status line carries no date or parenthetical amendment.

Open the body with `## Problem`, stating the motivation independently of the solution. A proposal then has `## Proposal`, `## Alternatives considered`, `## Acceptance criteria` and `## Risks`. An implemented note has `## Decision`, `## Alternatives considered` and `## Consequences`, written as shipped facts; place actual testing, deferred gaps or related owners in clearly named sections rather than retaining an implementation plan. A rejection preserves the proposal body and puts its reason on the status line.

Record real alternatives and why each lost. Never invent discussion, approval or evidence. If historical alternatives cannot be recovered, state that limitation explicitly. Keep custom technical sections when they own useful details. Preserve literal header tokens and corresponding structure in the Chinese counterpart under the [manual pairing rules](../../docs/i18n/README.md); new active pairs need no hash sidecar.

## Archiving and deletion

Delete an active implemented note only when it describes solely minor UI presentation or a purely mechanical change; remove its counterpart and any companion metadata and repair inbound links. A bug fix, performance change, new capability or substantive ownership decision is not minor merely because its implementation is small. Keep substantive records active while their alternatives, negative guarantees, durable or wire semantics, ownership boundary, security rule or reintroduction condition can guide future work.

An implemented record with historical value but little future guidance is an archive candidate. Proposed notes are never archived: keep a live proposal or reject an obsolete one. Keep rejected notes only while their losing idea remains a plausible trap; otherwise remove the complete active pair and any metadata, repairing inbound links. Do not classify by age, word count or a quota.

Follow the [archive instructions](archived/AGENTS.md) before moving any candidate. This checkout has no archive-sealing verifier, so a candidate is not a sealed archive and no automatic hash protection may be claimed. Keep candidates active until an explicitly reviewed archival procedure is available. Existing sealed English/Chinese/sidecar triplets are permanently frozen: never edit, translate, reformat, repair links inside, move or delete them, and never use them as current authority.
