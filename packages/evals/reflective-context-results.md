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
