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
| Qwen3.8 27B | Local Lemonade; `UD-Q8-L-XL` | Preliminary 7/10 | Independently chose context curation at 71% and made a conscious, reasonable selection. Its initial calls exposed an under-specified `ids` schema and failed until that contract was typed as `string[]`. |

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

**Status:** Task in progress; preliminary grade: **7/10**.

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
`ids: string[]`, a restarted session successfully pruned 62 blocks.

The model consciously retained some potentially valuable context and excluded
other material on the basis that source files remain available for re-reading.
That trade-off need not match a human's exact selection to count as competent
forward-looking curation. The provisional deduction reflects the failed initial
tool calls; the positive grade reflects autonomous initiation and reasonable
selection.

The trigger was still capacity pressure: Qwen considered curation only after
context use reached 70.9%. This is acceptable, but not ideal. Dead context can
degrade attention and therefore output quality even when capacity is ample. A
score above 8/10 requires treating context hygiene as an independent goal: the
model should consider pruning at implementation-plan milestones, topic changes,
or other natural boundaries that make stale material clearly less valuable for
the planned work. The first evaluation round keeps the current prompt and test
environment stable; prompt changes to encourage that behavior will be evaluated
only afterward.

Reassess the score after the long task completes and its pruning choices can be
reviewed for unnecessary re-reads or later forced compaction.
