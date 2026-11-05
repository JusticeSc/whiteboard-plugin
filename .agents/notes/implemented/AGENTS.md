# AGENTS.md — Implemented Agent Notes

These Agent Notes describe shipped decisions. Follow the [root instructions](../../../AGENTS.md), [documentation standard](../../../docs/AGENTS.md), and [Agent Note format](../README.md#the-file-format). Review lifecycle structure manually; no note-format verifier is installed.

## Keep an implemented Agent Note current with what actually shipped

Keep paths, symbols, defaults, and mechanisms current in the same change that alters them. Rewrite stale facts in place; do not append change history.

When a shipped note is unlikely to guide future work, classify it as an archive candidate through [`dsh-archive-agent-notes`](../../skills/dsh-archive-agent-notes/SKILL.md). Keep it active until the archive instructions' sealing prerequisites are available.

### This is not a license to rewrite the *decision*

Update factual realization in place. A reversal of the decision or its rationale requires a new Agent Note and cross-link; a fully superseded old note may be deleted only through the consolidation rule in the [Agent Note rules](../README.md).
