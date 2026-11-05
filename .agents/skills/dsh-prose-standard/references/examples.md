# Calibration examples

Distilled from review decisions, not a text template. Each pair shows the editorial boundary: enough to preserve the contract, without the reasoning transcript or implementation inventory around it.

## Keep the complete proposition

**Leaked:** "Validation rejects a bad record (rule 4)."

**Balanced:** "Validation rejects a record whose declaration is missing, whose name contains an uppercase letter, or whose inline icon exceeds 32 KiB; the caller receives the first violation with its JSON path."

A citation to an internal rule id resolves nowhere at HEAD. Name the owner and restate the facts the reader must act on.

**Leaked:** "The cache was changed after review feedback."

**Balanced:** "A cache key includes every immutable input and output-affecting option. A failed refresh preserves only data permitted by the documented recovery contract and reports the failure."

## State the local contract, not the implementation tour

**Over-detailed:** "`generate` awaits `fetchData`, assigns `entry.title`, calls `validateDocument`, and writes the file through `writeIfChanged`."

**Balanced:** "The generator reads every source, validates the assembled document with the shipped validator, and writes only when the bytes differ. A validation failure names the offending path and exits 1."

Readers can open the function for the call order. They cannot recover the obligations the prose omitted.

**Over-detailed:** "The document type lives in `types.ts`; `Document.entries` is `Entry[]`; each entry's metadata is a record."

**Balanced:** "Each entry has one name, one version, and display metadata for English and Chinese. The validator owns the record types; consumers import them from the package root."

## Do not narrate tests

**Over-detailed:** "The test creates a temporary directory, writes `index.json`, stubs the fetcher, and asserts `exitCode === 0`."

**Balanced:** "The generator test runs the real entry point against fixture sources and asserts the emitted index, the cache state, and the exit status; the Git path uses a local repository over the test transport."

The test code shows the mechanics. The prose must show what counts as correct and why external state is the assertion.

## Generated summaries must stand alone

A catalog or README summary extracted from JSDoc is read without its source comment. Write the extracted sentence as a complete statement; do not assume the preceding paragraph or a link target is visible.

## Preserve limits and recovery

**Over-detailed:** "The implementation handles errors."

**Balanced:** "An oversized tarball, an unreadable Git object, or a malformed index aborts the run after the failing source. Previously cached sources remain usable on the next run; the process exits 1 and reports the source and reason."

Error wording is behavior: name what is rejected, what survives, and how the reader recovers.

## User-visible strings are behavior

A diagnostic that names the wrong file, a default that contradicts the README, or a status that omits the retry state is a defect, not style. Change it only with evidence from the owning behavior, and update the bilingual counterpart and its recorded hash in the same change.

## Dev Note is the only scratch zone

Hypotheses, measurements, and open directions belong in the final non-authoritative Dev Note, folded behind `<details>`. Every other section states current behavior. Never manufacture an incident, a measurement, or a decision to make the section look substantive; `None.` is a complete answer.
