# Reflective-context research notes

This note preserves detailed observations and deferred design questions from the
Qwen 3.8 Flash session. The cross-session conclusions and active experiment plan
are in [Reflective-context PoC findings](../../packages/coding-agent/docs/reflective-context-poc.md).

## A1. Long block-ID handling

Across five prune calls, about 30 submitted IDs were unknown. All were corrupted
copies of real IDs rather than invented IDs: character drops, substitutions or
adjacent transpositions, insertions, and several more extensively mangled
siblings. Twenty-one were within edit distance two of a real ID. The errors also
propagated when the model copied a malformed ID from its own earlier reasoning.

The harness reports unknown IDs, but the model did not act on that correction in
five or more opportunities. An edit-distance suggestion such as `did you mean Y?`
could help, but fuzzy matching in a destructive operation has complexity and a
wrong-suggestion risk. It is likely to benefit only models already trying to
prune. First establish, through the cross-session review, whether this is a
general pattern or specific to this session.

## A2. Execution friction under pressure

At 12:07, the model produced a strong descriptive prune plan and made a `bash`
call in the same turn. It did not execute the prune; automatic compaction followed
two or three turns later. When IDs were already available, selections did execute.

A descriptive plan requires `list_context`, matching descriptions to IDs, then
`prune_context`. That multi-step procedure competes with primary work exactly
when capacity pressure is high. The observation is established; the appropriate
response remains open. Earlier ideas such as pruning by description, embedding
IDs in context-status messages, or automatically refreshing listings all have
substantial trade-offs.

## A3. Keeping curation in the model's attention

Tool-result corrections for unknown IDs were ignored repeatedly. Context-status
pressure messages were also ignored for two or three turns before compaction.
This suggests that the channel carrying curation guidance may affect whether the
model uses it.

Future experiments should compare concise guidance in system instructions,
context-status messages, and tool results. The question is broader than correcting
IDs: it is how to keep context curation salient without repeatedly adding enough
text to become its own source of attention dilution.

## A6. Cross-session pattern review

Review the current evaluation set before adding further candidates. Classify
curation behavior (no plan, a late plan, a plan that is not executed, and
effective proactive curation), ID-copy errors, correction integration,
pressure-signal response, and subagent use. Separate candidate-specific behavior
from patterns that may justify a harness change.

The Qwen analysis provides a repeatable method: use `list_context` snapshots as
the ID-to-path source, scan post-prune windows with shell-aware inspection, and
compare malformed IDs with real IDs by edit distance. Re-read counts remain
descriptive working-set telemetry, not a quality measure.

One original locally hostable candidate remains but is low priority. Whether to
add a small number of larger frontier models is an open decision; analyse the
existing cross-section first.

## A7. `/tree` restoration and branch-scoped pruning

Navigating with `/tree` to a point before a prune does not restore excluded
blocks; they render as `[prune: excluded]` stubs. Curation state also remains
session-global rather than branch-scoped.

This is deferred until the upstream harness v2 work provides explicit branch or
lane identity. It remains planned, not abandoned.
