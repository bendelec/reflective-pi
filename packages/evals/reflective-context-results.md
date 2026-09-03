# Reflective context evaluation results

This document records qualitative observations from evaluating rxpi's reflective
context-management proof of concept. An observation may be provisional while a
task is still running, and later transcript review may change its grade.

All listed models were observed during the same long-running, independent agentic task
whose end-to-end solution required at least ten times the model's context-window
capacity in tokens. Some form of context management — pruning or compaction —
was therefore unavoidable.

## Summary

| Model | Hosting / quantization | Subjective grade | Short summary |
| --- | --- | --- | --- |
| DeepSeek V4 Flash | Local Dwarfstar `ds4`; `dwarfstar-iq2` | 3/10 | It can use `prune_context` effectively after explicit user direction, but did not autonomously sustain curation: seven automatic compactions occurred, including four after its final reminder. |
| DeepSeek V4 Flash | Venice (hosted); BF16 | 3/10 | Most autonomous curation intent observed, least effective execution: 18 self-initiated calls, one effective 42-block prune, fourteen silently absorbed no-ops, then six-plus harness force-compactions. |
| Qwen3.8 27B | Local Lemonade; `UD-Q8-L-XL` | 5/10 | It made three substantial, deliberate cleanups after independently recognizing stale context, but then relied on six automatic compactions through the harder second half of the task. |
| Laguna S 2.1 | OpenRouter (hosted); full precision | 3/10 | Responded to its only explicit hygiene nudge within one second, exactly as instructed — but the nudge raced the sixth compaction and lost by 3 ms. No proactive curation; five earlier buildups offered no nudge to respond to. |

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

### DeepSeek V4 Flash — Venice-hosted, unquantized BF16

**Status:** Final grade: **3/10** (opposite profile of the IQ2 run).

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
physically impossible as genuine refills at the session's observed generation and tool-traffic rates — and is
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

### Laguna S 2.1 — OpenRouter-hosted (poolside), full precision

**Status:** Final grade: **3/10**.

Completed all three rounds in one session with two subagent delegations,
both correctly on the evaluated model: a focused code review of the
avoidance-region changes and a docs-consistency check during the final
repair round. It never misused a tool: zero malformed calls, zero
hallucinated ids, zero no-op calls.

Six automatic compactions carried the session (98k–120k tokens before
each); `prune_context` and `summarize_context` were never effectively
executed. Its first `list_context` (orientation) was the name-slotting
miscall also observed locally — expecting a repository file listing,
self-correcting immediately. Its second, deep in repair round 2, was a
correct, immediate response to the explicit hygiene nudge: the session's
only hygiene message fired at 91.9% (19:25:18.850) in the same turn
boundary as the sixth compaction (19:25:18.847 — the compaction won by
3 ms), and the model answered it one second later with the instructed
behavior: list the blocks, prune what is no longer needed. The listing
showed the already-compacted context — four fresh blocks, nothing stale
— and it correctly declined and returned to work. The five earlier
compactions fired at gradual 75%-crossings where the 80% hygiene tier
was preempted by the raised compaction reserve (32k), so no earlier
nudge existed to respond to.

Notable outside the curation axis: the most output-efficient completion
measured (571k output tokens versus 644k–968k for the other models), the
highest reasoning volume in the field (~359k tokens of thinking,
including coherent 32k-token turns), and effective work from compaction
summaries it never requested. Reconsideration markers 0.80 per 1k
output tokens — the second most hesitant model in the field, consistent
with the local repetition-attractor anatomy: the temperament that stays
a trait at full precision collapsed into a 41-cycle attractor on the
local quant through an unguarded sampler (see the serving-stack notes
below).

3/10 reflects demonstrated responsiveness to the harness's explicit
curation instruction — immediate, correct, and following its script —
with the execution consumed by a harness race (exempt per the Qwen
compaction-rescue precedent), and no opportunity to demonstrate
proactive curation: the signals were structurally preempted until the
racing moment.

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
| DeepSeek V4 Flash (unquantized) | Venice (hosted), BF16 | 3/10 | none | 421 | 30.00M | 968k | 0.48 |
| Qwen 3.8 27B | Lemonade, UD-Q8-L-XL | 5/10 | 5 (work-package delegation) | 806 | 51.16M | 961k | 0.40 |
| Laguna S 2.1 (hosted) | OpenRouter, full precision | 3/10 | 2 (review, docs check) | 408 | 22.77M | 571k | 0.80 |

Laguna S 2.1 attempt 1 (mainline llama.cpp serving) is discarded; attempt 2
(revived ds4 stack) is in progress and not yet graded.

## Methodology notes

2026-09-03: Context-status staleness across compaction: the status value
a model reasons against lags one turn behind a compaction that resolves
the pressure. Laguna's only curation intent reacted to a 91.9% status one
second after compaction had reduced the context to four fresh blocks.
Models that act on current mid-buildup pressure (Qwen at 70.9%) curate
successfully; models that react only at the boundary are nudged at the
moment curation is pointless — and may learn that curation attempts are
empty gestures. Backlog: surface the compaction event itself, or return
the post-compaction status with the first post-compaction turn.

2026-09-03: Hygiene-nudge preemption and race, root cause: raising
`compaction.reserveTokens` to 32k moved the auto-compaction line to 75%,
below the hard-coded 80% hygiene-message threshold. Gradual buildups
then compact before the hygiene message can ever fire (five of Laguna's
six compactions had no nudge), and a turn that jumps past both thresholds
emits the nudge in the same turn boundary as the compaction — Laguna's
only nudge raced its compaction and lost by 3 ms, then the model's
correct one-second response arrived to an already-compacted context.
Earlier graded runs (16k reserve, 87.5% line) were unaffected: the
80% tier sat below the line. Fix: derive the hygiene threshold from the
compaction line (line minus five points, clamped) so the nudge always
precedes compaction for any reserve.

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
