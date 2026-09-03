# Reflective context evaluation results

This document records qualitative observations from evaluating rxpi's reflective
context-management proof of concept. An observation may be provisional while a
task is still running, and later transcript review may change its grade.

All listed models were observed during long-running, independent agentic tasks
whose end-to-end solution required at least ten times the model's context-window
capacity in tokens. Some form of context management — pruning or compaction —
was therefore unavoidable.

## Summary

| Model | Hosting / quantization | Subjective grade | Short summary |
| --- | --- | --- | --- |
| DeepSeek V4 Flash | Local Dwarfstar `ds4`; `dwarfstar-iq2` | 3/10 | It can use `prune_context` effectively after explicit user direction, but did not autonomously sustain curation: seven automatic compactions occurred, including four after its final reminder. |
| Qwen3.8 27B | Local Lemonade; `UD-Q8-L-XL` | 5/10 | It made three substantial, deliberate cleanups after independently recognizing stale context, but then relied on six automatic compactions through the harder second half of the task. |

## Observations by model

### DeepSeek V4 Flash — local Dwarfstar `ds4`, `dwarfstar-iq2`

**Status:** Final grade: **3/10**.

The completed session had seven automatic compactions. The model made three
`prune_context` calls, each after explicit user intervention. Those calls
excluded 13, 5, and 88 stale blocks respectively, demonstrating that it can
inspect the block list and prune effectively when directed.

It did not sustain that behavior. After the final, successful 88-block cleanup,
it allowed four more automatic compactions without another pruning pass. Its
reasoning repeatedly recognized the issue, but deferred it for “one more edit”
or investigation. This is a follow-through failure rather than evidence that
the tool is unusable.

Session review found 28 candidate re-reads after exclusion. Most followed fresh
external verification requests and were appropriate re-validation of files that
had become relevant or changed; they do not materially lower the grade. The
principal failure was late or absent pruning, not reckless pruning.

A 3/10 reflects demonstrated tool competence under direct guidance, but no
reliable autonomous or sustained context curation. It is unsuitable as evidence
that the current prompts alone cause models to manage context proactively.

### DeepSeek V4 Flash — local Dwarfstar `ds4`, unquantized BF16

**Status:** Final grade: **3/10** (proposed; opposite profile of the IQ2 run).

This session showed the most autonomous curation intent of any evaluated so
far, and the least effective execution. The model made 18 self-initiated
`prune_context` calls without any user direction. Exactly one was effective:
an early, reasoned 42-block exclusion of stale requirement reads and
exploration output. One call used a hallucinated id. The remaining calls —
fourteen — passed `{"ids": []}` and were each answered by the pre-split
contract's success-shaped `Pruned 0 block(s).` no-op. The model perceived
context pressure and repeatedly attempted action that the interface silently
absorbed.

The context reached the compaction ceiling repeatedly: nine compaction
entries, of which roughly six are genuine force-compactions. The trailing
triple (19:09/19:22/19:34, tokensBefore 124582 -> 124176 -> 115128) is a
failure-retry cascade of the known compaction reservation defect —
physically impossible as genuine refills at local inference speeds — and is
not counted as three separate failures.

No subagents were used (contrast Qwen 3.8's five delegated sessions and the
IQ2 run's four verification passes): all work happened in the main session.
The run produced the most output tokens of the three evaluated sessions
(968k) alongside the least effective curation, and its reasoning was the
most stable (reconsideration markers 0.48 per 1k output tokens versus the
IQ2's 1.71) — stability did not translate into curation effectiveness.

One false start (an accidental wrong-model launch, folder reset before the
evaluated run) is excluded from the session.

3/10 reflects genuine autonomous intent and one competent large prune,
undermined by interface-shaped failure modes and no sustained effect: the
harness still force-compacted the context roughly six times after the
model's attempts.

### Qwen3.8 27B — local Lemonade, `UD-Q8-L-XL`

**Status:** Final grade: **5/10**.

At 70.9% context use, without user intervention, the model decided to curate
its context before beginning its next work package. It listed the blocks,
identified stale exploration and build output, and selected blocks deliberately.

Its first three selection calls failed because it emitted a nested `ids` object
rather than the required array. It then persisted with the same malformed shape
even after a user supplied the correct syntax. This is a real tool-use weakness,
but is materially mitigated by rxpi's then-untyped tool schema: the model was
told only that `ids` accepted `Any`, despite the tool requiring an array of
strings. DeepSeek V4 Flash did not encounter this problem, but the schema was
still an avoidable contract ambiguity. After the schema was changed to advertise
`ids: string[]`, a restarted session successfully pruned 62 blocks. It later
made two further deliberate selections of 43 and 67 blocks.

The model consciously retained some potentially valuable context and excluded
other material on the basis that source files remain available for re-reading.
That trade-off need not match a human's exact selection to count as competent
forward-looking curation. The initial syntax failures are therefore not a
material score deduction: the exposed schema was ambiguous, and the model used
the corrected contract successfully.

The trigger was still capacity pressure: Qwen considered curation only after
context use reached 70.9%. This is acceptable, but not ideal. Dead context can
degrade attention and therefore output quality even when capacity is ample. A
score above 8/10 requires treating context hygiene as an independent goal: the
model should consider pruning at implementation-plan milestones, topic changes,
or other natural boundaries that make stale material clearly less valuable for
the planned work.

It did not sustain the promising initial behavior. After the third cleanup, it
allowed six automatic compactions, repeatedly continuing through 80–97% context
use without making another pruning selection. At 88.5%, it explicitly chose to
write a comprehensive completion report instead of curating and immediately
triggered compaction. At 95%, it called `prune_context` only after compaction
had already reduced the context, then mistakenly credited the listing call for
the reduction and selected nothing.

One compaction attempt also failed when recorded context use reached 124,600
tokens: adding the compaction prompt and system instructions exceeded Qwen's
131,072-token input limit. The user temporarily switched to a larger-context
model to perform that compaction. This is an inherited harness reserve failure,
not a Qwen failure, and does not lower the grade.

A 5/10 reflects real autonomous and deliberate pruning early in the task, but
no durable hygiene habit through its difficult second half. This session used
the original prompt; the strengthened quality-driven policy and >80% fallback
instruction were introduced afterward and require separate evaluation.

## Session comparison

All evaluated runs: identical initial prompt and workspace, one initial
round plus two repair rounds in the same main session; subagent sessions
started after the main are included, discarded false starts excluded.
Reconsideration markers: "but wait", "hold on", "on second thought",
"scratch that", "let me reconsider", "actually, let me", "wait, no" per 1k
output tokens across thinking and text.

| model | serving | grade | subagent sessions | turns | prompt tokens | output tokens | reconsideration/1k |
|---|---|---|---|---|---|---|---|
| DeepSeek V4 Flash (IQ2) | ds4, antirez IQ2 mixed | 3/10 | 4 (verification passes) | 457 | 20.58M | 644k | 1.71 |
| DeepSeek V4 Flash (unquantized) | ds4, BF16 | 3/10 (proposed) | none | 421 | 30.00M | 968k | 0.48 |
| Qwen 3.8 27B | Lemonade, UD-Q8-L-XL | 5/10 | 5 (work-package delegation) | 806 | 51.16M | 961k | 0.40 |

Laguna S 2.1 attempt 1 (mainline llama.cpp serving) is discarded; attempt 2
(revived ds4 stack) is in progress and not yet graded.

## Methodology notes

2026-09-01: The agent tool interface changed mid-evaluation. `prune_context`'s
dual-mode contract (no-arguments listing plus ids-based exclusion) was split
into a read-only `list_context` tool and a strictly mutating `prune_context`
that fails loudly when ids are missing, after several models were observed
calling the tool bare and then reporting that they had successfully pruned.
Evaluations started before this change are not directly comparable to ones
started after it.

The Laguna S 2.1 evaluation in progress at the time of the change was started
under the old interface, interrupted, and continued under the new one. Its
transcript spans both tool contracts, and its eventual grade must be read with
that in mind.

### Laguna S 2.1 — attempt discarded, replacement stack validated (2026-09-03, temporary)

The first Laguna S 2.1 evaluation attempt (local serving via Lemonade /
mainline llama.cpp) is discarded: mainline llama.cpp did not appear able to
serve this model correctly. Evidence: the same 54k-token summarization input
produced a 32,771-token capped, non-terminating output through mainline, but
a 509-token naturally-stopping summary through a corrected serving stack
(antirez's ds4, revived laguna branch), and 1,514 tokens hosted at full
precision.

Replacement local stack, validated before the fresh session: ds4
`laguna-s2.1-revived` branch; custom Q4_K routed experts / Q8_0 signal-path
GGUF from poolside's current weights with the original July rope config
(262144 context, factor 32). Checks: clean stop tokens, coherent code
generation, deterministic two-chunk compaction with natural stops
(54,335 -> 509 tokens), and antirez's 100-case official-continuation dataset
scored avg_nll 0.239, first-token match 92/100, avg greedy LCP 10.9.

A fresh evaluation session was started from scratch on this stack. This
entry is temporary and will be reduced to a short footnote once that session
has a valid result.
