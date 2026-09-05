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
| Laguna S 2.1 | Local ds4 (revived); sigQ8/Q4K, guarded | 3/10 | Only field model to attempt curation before pressure — correct block ids in a comma-joined string, rejected by the instructive error, then permanent abandonment; four forced compactions. |
| Muse Glimmer 30B | Local Lemonade; `UD-Q8_K_XL` | 4/10 | The field's best-executed curation under the hygiene nudge: six incremental prunes, 71.6% → 16%, zero compactions, zero output truncations — but purely pressure-triggered, and two prunes discarded its own repair-round working set. |

## Observations by model

### DeepSeek V4 Flash — local Dwarfstar `ds4`, `dwarfstar-iq2`

**Status:** Final grade: **3/10**.

The completed session had seven automatic compactions. The model made six
`prune_context` calls: three bare listing-mode calls and three effective
exclusions of 13, 5, and 88 stale blocks respectively, each following
explicit user intervention about context management — demonstrating that it
can inspect the block list and prune effectively when directed.

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
entries, of which six are genuine force-compactions. The trailing
triple (19:09/19:22/19:34, tokensBefore 124582 -> 124176 -> 115128) is a
failure-retry cascade of the known compaction reservation defect —
physically impossible as genuine refills at the session's observed generation and tool-traffic rates — and is
not counted as three separate failures.

No subagents were used (contrast Qwen 3.8's five delegated sessions and the
IQ2 run's four verification passes): all work happened in the main session.
The run produced the most output tokens of the evaluated field
(968k) alongside the least effective curation, and its reasoning was the
most stable tier (reconsideration markers 0.30 per 1k output tokens, level
with Qwen, versus the IQ2's 1.35) — stability did not translate into curation
effectiveness.

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
still an avoidable contract ambiguity. After a session interruption and
resume, it made its first successful array-form selection — 62 blocks — and
later two further deliberate selections of 43 and 67 blocks.

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
measured (571k output tokens versus 644k–968k for the other models), heavy
reasoning use (454k thinking tokens, 79% of its output, including coherent
32k-token turns), and effective work from compaction
summaries it never requested. Reconsideration markers 0.80 per 1k
output tokens — the second most hesitant model in the field, consistent
with the local repetition-attractor anatomy: the temperament that stays
a trait at full precision collapsed into a 41-cycle attractor on the
local quant through an unguarded sampler (see the local run's serving
note below).

3/10 reflects demonstrated responsiveness to the harness's explicit
curation instruction — immediate, correct, and following its script —
with the execution consumed by a harness race (exempt per the Qwen
compaction-rescue precedent), and no opportunity to demonstrate
proactive curation: the signals were structurally preempted until the
racing moment.

### Laguna S 2.1 — local ds4 (revived branch), sigQ8/Q4K, repetition-guarded

**Status:** Final grade: **3/10**.

A single ~24-hour session, no subagents, no false starts: initial prompt,
two repair prompts, several short continue-nudges, and one early
thinking-style steering message. It is the only run in the field that
attempted context curation *before* capacity pressure: early in
orientation, unprompted, with no context-status signal in the session at
all, it listed the context and attempted a prune selecting four correct
block ids from that listing — passed as a comma-joined string rather than
the required array. The strict contract answered with the instructive
error ("'ids' must be an array of block ids from list_context"); the model
listed once more and never attempted another prune through the remaining
~24 hours and four buildups to the compaction line. The failure was one of
argument structure, not selection or semantics — consistent with the
model's broader structural tool-use weakness: its file edits repeatedly
left duplicated or missing lines at edit edges, several times badly enough
that it rewrote source files from scratch.

No hygiene nudge ever fired in this run: the binary predated the derived
70% threshold, so the 80% nudge tier sat permanently behind the 75%
compaction line. As with the hosted run's preempted buildups, the absence
of nudge-responses is not held against the model.

Four threshold compactions carried the session (98.4k–99.7k tokens before
each), all produced by compact-smart; the first predates the transition
preamble's deployment, the last three open with it — the deployed
feature's first live test passed. The run produced the field's leanest
output (281k tokens versus 571k–968k) and its calmest reconsideration rate
(0.25 per 1k output tokens; the same model measured 0.80 hosted — the
largest serving-dependent temperament shift observed in the field).

Serving support for this model is unsatisfactory: it is prone to attractor
loops when quantized, which the mainstream serving options did not
sufficiently catch. After no luck with several alternatives, it was finally
hosted successfully on a branch of antirez's ds4 with our own simple
repetition guardrails added — a presence penalty over a session-token
window, enabled for this model family only. Under that guardrail every
monitored long turn of this run stayed clean, including 16k-token outputs;
the guardrail is a serving condition, not model merit. Two mid-work turn
resets by the user around a test-code confusion phase are recorded as
interventions; C++ content quality is graded separately.

3/10 reflects the field's only pre-pressure curation intent, genuine and
correctly targeted; its failure was structural argument encoding, and it
was followed by permanent abandonment after a single instructive error.
Four forced compactions completed the session.

### Muse Glimmer 30B — local Lemonade, `UD-Q8_K_XL`

**Status:** Final grade: **4/10**.

A single session spanning initial and both repair rounds: 66 assistant
turns, no subagents, and the field's leanest run by an order of magnitude
(57k output tokens; the field spans 281k–968k).

Curation was purely pressure-triggered — but the pressure path worked
end to end for the first time in the field. Round one climbed to 52.8%
with no curation attempt; the repair round crossed the derived hygiene
threshold (70% under the 32k reserve), the nudge fired at 71.2%, and the
model began pruning within three minutes: six incremental `prune_context`
calls over 30 minutes (8–10 blocks each, 58 blocks total), taking context
from 71.6% to 16.0%. This is the derived-threshold fix's first live
validation: the nudge preceded the compaction line, the model responded,
and the session finished with **zero automatic compactions** — the only
field model to avoid them — and zero output-limit truncations (maximum
turn 13,035, ~40% of the cap; every predecessor hit its output cap on day
one).

Retroactive re-acquisition accounting over its six prunes (the mechanism
was not yet live; the analysis is reconstructed from the session file):
four prunes had clean windows, two discarded working-set material — the
model re-read its own `implementation-plan.md` and `tests/test_basic.cpp`
within the window, exactly the repair round's subject matter. Selection
was otherwise correct: mostly older read-results, cleared in deliberate
small steps rather than a panic amputation.

A distinctive reasoning profile accompanies this: simplification markers
at 3.15 per 1k thinking tokens (the rest of the field: 0.47–1.13 — an
order-of-magnitude-family difference), and three spontaneous "given
limited time" deliberations (two in round-one design, one at the repair
round's opening) with no time language anywhere in the prompt — the
model's controllable-effort training prior, expressed three ways: budget
vocabulary, scope-trading deliberation, and output self-discipline.
Reconsideration markers 0.00 per 1k output tokens — the field's calmest,
against a range of 0.25–1.35.

The C++ evaluation (graded separately, per the established split) scored
the run 35/100 initially and 36/100 after both repair rounds — the
reflex's cost side: the simplification profile that kept the session lean
also produced the round-one findings of naive architecture and
near-absent tests, and the repair round recovered a single point. The
repair prompt deviated from the standard format by one soft sentence
encouraging less worry about time and scope (recorded per protocol; the
time vocabulary recurred once at the repair round's first turn, then was
silent for the remaining forty).

4/10 reflects the field's best-executed curation response — immediate,
sustained, correctly targeted except for two working-set misses, and
sufficient to prevent every forced compaction — while remaining strictly
a response to the capacity nudge, with no boundary-initiated curation
anywhere in the run.

## Session comparison

All evaluated runs: identical initial prompt and workspace, one initial
round plus two repair rounds in the same main session; subagent sessions
started after the main are included, discarded false starts excluded.
Reconsideration markers: "but wait", "hold on", "on second thought",
"scratch that", "let me reconsider", "actually, let me", "wait, no" per 1k
output tokens across thinking and text.

| model | serving | grade | subagent sessions | turns | prompt tokens | output tokens | reconsideration/1k |
|---|---|---|---|---|---|---|---|
| DeepSeek V4 Flash (IQ2) | ds4, antirez IQ2 mixed | 3/10 | 4 (verification passes) | 457 | 20.59M | 644k | 1.35 |
| DeepSeek V4 Flash (unquantized) | Venice (hosted), BF16 | 3/10 | none | 421 | 30.00M | 968k | 0.30 |
| Qwen 3.8 27B | Lemonade, UD-Q8-L-XL | 5/10 | 5 (work-package delegation) | 806 | 51.16M | 961k | 0.30 |
| Laguna S 2.1 (hosted) | OpenRouter, full precision | 3/10 | 2 (review, docs check) | 409 | 22.77M | 571k | 0.80 |
| Laguna S 2.1 (local) | ds4 revived, sigQ8/Q4K + guardrail | 3/10 | none | 411 | 20.56M | 281k | 0.25 |
| Muse Glimmer 30B | Lemonade, UD-Q8_K_XL | 4/10 | none | 66 | 3.40M | 57k | 0.00 |

## Methodology notes

Setup reminder for lemonade-served models: the lemonade pi-plugin falls
back to a 4,096-token output limit when the server reports none; a
models.json `maxTokens` override restores envelope parity. Pre-apply the
override when creating a candidate entry.

Mechanism observations that inform the proof of concept but do not belong
per model are recorded in [`reflective-context-research-notes.md`](reflective-context-research-notes.md)
(currently: a degenerate curation incident and the prune-manifest-as-memory
finding).

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

### Session accounting rebuilt mechanically (2026-09-03, overnight)

All quantitative claims were re-derived from the session files under a fixed
protocol: the main session is the last-created session whose first user
message is the standard implementation prompt; subagent sessions are those
created after it whose first message matches a `run` tool call of the main;
all other sessions (false starts, abandoned fragments) are excluded. Turns
are assistant messages; token totals sum per-request usage over the main and
matched subagent sessions; reconsideration markers are counted only in
assistant thinking and text.

Corrections from earlier drafts: reconsideration rates (IQ2 1.35, unquantized
DS4F 0.30, Qwen 0.30 — earlier values 1.71/0.48/0.40 were inconsistently
scoped), Laguna turns 409 (was 408), IQ2 prune calls six with three effective
(was three), Laguna thinking volume 454k (was ~359k, and not the field's
highest — the unquantized DS4F run reasoned 810k).

Verified exact in the same pass: compaction counts and per-compaction
context sizes for every run, the 13/5/88 and 62/43/67 block selections, the
18-call unquantized-DS4F decomposition including the 42-block exclusion, the
four compactions after the IQ2's final cleanup, and every subagent-session
count in the comparison table.
