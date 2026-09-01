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
