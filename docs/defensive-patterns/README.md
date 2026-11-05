# Defensive patterns

English | [中文](README.zh.md)

These reference patterns describe rules and the defects they prevent. Apply a pattern only when its subject exists in the plugin; the root instructions and product context own current requirements. A pattern is review guidance, not evidence of an automated check or remote enforcement. Read the relevant page before changing that area.

## Why these rules

Five habits cover most of what follows, and each page is their application to one area:

- **Make correctness explicit.** Write it into the structure — named call points, explicit lifecycles, explicit conditions and types — rather than compensating for it afterwards with timing.
- **Keep one source of truth.** One read path for a piece of data, one home for a fact, one owner for shared state.
- **Keep the change face equal to the review face.** A change carries only the lines its stated behavior needs, and a migration moves code rather than rewriting it.
- **Require evidence.** A claim is falsifiable and recomputable — measured before and after, or checked by a test that fails on the defect — rather than kept in sync by hand.
- **Bound the complete result.** Enforce byte, count, and time limits where the complete emitted or retained value, including wrappers and metadata, is known.

| Changing | Read |
|---|---|
| Generation, fetching, caching, output writing, error handling, timing, configuration, subprocesses, teardown | [general.md](general.md) |
| Package exports, plugin entry points, and release changes | [Project context](../PROJECT-CONTEXT.md) and [development.md](../development.md) |
| UI identity, shared controls, styling, remote contracts, recovery, derived projections or display resources | [conditional-domains.md](conditional-domains.md); activate only the rules whose objects exist |

[dsh-code-review](../../.agents/skills/dsh-code-review/SKILL.md) points reviewers to this directory. Apply it within the protected contracts in the root [AGENTS.md](../../AGENTS.md).
