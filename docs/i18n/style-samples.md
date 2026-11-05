# Translation style samples

English | [中文](style-samples.zh.md)

Use the closest sample to calibrate register, not as translation memory or as this project's runtime contract. These excerpts retain the human-finalized source samples covered by [SOURCE-LICENSE.txt](../../SOURCE-LICENSE.txt); they are inherited calibration, not a claim of a new human approval in this checkout. Terminology, faithfulness and structure override a sample; a sample's register takes precedence over general voice descriptions. Add a new local gold sample only after human review records that approval; an agent's candidate is not gold.

## Defensive rule

English sample:

> **Dispose must reach quiescence, not just request it** — Await child exit after killing or aborting. Optional notifications may stop early; resources and listeners needed for completion or final persistence must survive until consumers settle.

Chinese sample:

> **dispose（资源释放）必须等待所有任务完全停稳，不能仅下发终止指令就返回**：发出终止或中止信号后，等待子进程退出。可选通知可以提前停止；完成操作或最终持久化所需的资源与监听器，必须保持可用直到消费者结束。

## Policy statement

English sample:

> The gate's limit, stated plainly: a green gate means the pair was confirmed consistent at these exact contents, not that the confirmation was sound. It checks hashes and Markdown structure; it cannot judge whether the two sides actually say the same thing — that is the reviewer's half of the contract. A re-recorded pair with a sloppy counterpart passes the gate; it must not pass review.

Chinese sample:

> 门禁的限制很明确：通过门禁只说明两侧文件当前的 blob hash 与伴随记录吻合，并且 Markdown 结构签名一致，也就是说，这组内容曾被确认一致；它不代表这次确认可靠。评审人必须检查两种语言是否真正表达了相同的意思。即使译文粗糙、表意有误，重新记录配对后仍能通过门禁，但绝不能通过人工评审。

## Decision rationale

English sample:

> Comparing git timestamps of the pair (no record) — rejected: formatting-only edits would false-positive, and a counterpart committed after an unrelated edit would false-negative; content identity is the only signal that means what the gate claims.

Chinese sample:

> 对比双语文件的 git 时间戳（无记录方案）——不予采纳：仅调整格式的改动会触发误报，无关修改后再提交译文又会造成漏检。只有基于内容本身的标识（每侧文件的 blob hash 与伴随记录比对），才能承载门禁所声称的语义。
