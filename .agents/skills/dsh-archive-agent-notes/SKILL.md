---
name: dsh-archive-agent-notes
description: Use when adding, auditing, pruning, archiving, restoring, or reviewing Agent Notes in this repository; checks every new note for superseded active records, deletes records only about small UI or purely mechanical changes, classifies other implemented notes by future decision value, deletes rejected notes that no longer prevent a tempting fallacy, and applies the frozen archived/{kind} triplet and manifest rules.
---

# Archive Agent Notes

Reduce the active decision corpus without erasing history that can still guide work. Judge every note semantically; word count and age are discovery aids, never archive criteria.

**Plugin scope:** this checkout has no note-format, translation or archive-sealing verifier. The root instructions, manifest and CI own active checks; active bilingual notes use manual pair review without new hash sidecars. Keep archive candidates active until an explicitly reviewed sealing procedure exists. Never run absent upstream pnpm commands, fabricate seals or treat an imported manifest as proof of automatic protection.

## Read the contracts

Read [the Agent Note rules](../../notes/README.md), [the archive instructions](../../notes/archived/AGENTS.md), and applicable active lifecycle instructions before classifying. Use current code, configuration, product docs, newer decisions and inbound links to establish whether a rationale still owns or constrains anything. Do not duplicate decisions already owned by product documents or ADRs.

## Check supersession when adding a note

Before drafting, apply the [creation criteria](../../notes/README.md#when-to-write-one). Search active notes covering the same decision, mechanism or rejected alternative. Classify full or partial supersession in the same change: retain and cross-link partial supersessions or independently useful rationale, identify implemented archive candidates, reject obsolete proposals, and remove rejected notes that no longer prevent a plausible mistake. Apply the consolidation rule only when the new owner preserves every unique proposition. Do not turn a missing sealing tool into an invented archive result.

## Classify by future value

Apply these lifecycle-specific outcomes:

- **Implemented — delete:** remove an active pair and any companion metadata only when it describes solely minor UI presentation or a purely mechanical change. Repair or remove inbound links. A bug fix, performance change, new capability or substantive ownership decision is not minor merely because its implementation is small.
- **Implemented — keep active:** retain rationale, alternatives, negative guarantees, durable or wire semantics, ownership boundaries, security rules and reintroduction conditions likely to guide a future change. A mechanical rename can still record a lasting compatibility or naming decision; size is not the test.
- **Implemented — archive candidate:** identify a complete substantive historical decision unlikely to guide future work but worth preserving. Keep the candidate active until sealing prerequisites exist. Do not use this category to retain a note that qualifies for deletion.
- **Proposed — never archive:** keep a live proposal; reject an obsolete proposal with an honest reason and the rejected lifecycle format.
- **Rejected — keep as a guardrail:** retain a losing proposal only while it remains a plausible, meaningful trap and the record explains why it loses.
- **Rejected — delete:** remove the whole active pair and any companion metadata when the premise no longer exists, a newer owner fully supersedes it, or it no longer prevents re-litigation. Repair or remove inbound links.

Inspect every note in scope, classify analogous groups under one principle, and report genuinely borderline cases. Never work toward a quota or infer value from age or word count. Never delete or otherwise change sealed archived artifacts through these active-note rules.

## Archive prerequisites and frozen history

This checkout cannot establish a new automatic seal. Do not move a candidate into the frozen archive or modify its manifest just to satisfy imported guidance. Any future sealing tool needs explicit authorization, an independently reviewable committed baseline, complete English/Chinese/sidecar triplets and protection for every existing seal.

A future reviewed sealing move may only relocate the complete triplet, insert identical `Archived: YYYY-MM-DD` lines immediately below both `Status: implemented` lines, mechanically record those metadata-only edits, and repair or remove inbound links. Preserve body text, title punctuation, layout and language switchers. Never translate, reformat, update facts or repair outbound links inside the archived note.

After sealing, never edit, move, translate, reformat or delete the artifact. An archived note is an intentional historical citation target, not current behavioral authority. An empty or imported manifest does not demonstrate that these protections have run.

## Validate and report

Manually review lifecycle, status, structure, counterpart meaning and inbound links; compare against a trusted baseline. Run `git diff --check` and select other available evidence through [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md). Do not claim a format, translation, archive, lint or doc-sync gate ran when the manifest provides none.

Report active implemented notes kept, deleted and identified as archive candidates; rejected notes kept or deleted; proposed notes rejected; and borderline classifications with their rationale and word count. Distinguish a candidate from an actually sealed archive. Do not claim frozen outbound links were verified or automatic hash protection was established.
