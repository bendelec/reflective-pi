# Reflective-context PoC: findings and next experiments

This page records the current cross-session conclusions of rxpi's reflective-context
proof of concept. It is a status document, not a model leaderboard. The
[candidate records and session measurements](../../evals/reflective-context-results.md)
are the evidence for the claims below.

## Question and current status

The PoC asks whether a coding agent can maintain its own context as a focused
working set, rather than relying only on automatic compaction after the context
has become full. The intended benefit is twofold:

- avoid loss of useful detail when automatic compaction replaces a long history
  with a broad summary; and
- reduce attention dilution from closed topics, obsolete tool output, and other
  material that is still in the window but no longer helps with the work ahead.

The evidence is encouraging but preliminary. It supports model-led curation as a
useful capability and shows a strong within-session comparison in Qwen 3.8 Flash.
It does not yet establish a causal result across models, tasks, or serving
configurations. Most evaluated models have not made proactive curation a durable
habit.

## What has worked

### Forward-looking, model-led curation

The strongest evidence comes from [Qwen 3.8 Flash](../../evals/reflective-context-results.md#qwen-38-flash--local-llamacpp-engramhalo-fork-ap-q5_k_xl--mtp).
At a completed work-package boundary and 47% context use, it retained information
needed for upcoming work, excluded stale document reads, and summarized
hard-to-reconstruct subagent conclusions. C++ work and session behavior remained
strong while it maintained that working set. After automatic compaction replaced
most history with one summary, both deteriorated; a later large prune rebuilt a
lean context and the final repair was clean.

This is an informative within-session comparison, not isolated proof of causation.
It does show why a model with knowledge of its next task can make choices that a
backward-looking compaction summary cannot.

### Separate, explicit tool verbs

The original `prune_context` tool combined listing and mutation: omitting `ids`
listed blocks, but its success-shaped result led models to believe they had
pruned. In the Venice-hosted DeepSeek V4 Flash session, fourteen empty selections
were silently accepted. The interface now has three distinct tools:

- `list_context` lists blocks and never changes context;
- `prune_context` excludes selected blocks and fails clearly without valid IDs;
  and
- `summarize_context` replaces selected blocks with summaries.

This one-verb contract has significantly reduced model confusion. It does not
remove all structural tool-use errors—for example, some models still send IDs in
the wrong argument shape—but it makes failures visible instead of presenting a
no-op as a completed action.

### Capacity warnings as a fallback

Context-status messages make capacity pressure visible. The hygiene threshold now
tracks ten percentage points below the automatic-compaction line, rather than
using an independent fixed percentage. This corrected a configuration failure in
which a raised output reserve made compaction occur before any hygiene warning and
gives the model more room to act before compaction.

Muse Glimmer provides the first successful end-to-end example of this fallback:
at 71.2% use it responded to the warning with six incremental prunes, reduced use
from 71.6% to 16%, and avoided automatic compaction. This was effective
pressure-driven behavior, not proactive curation at a work-package boundary.

## What remains unresolved

### Proactive curation is not yet durable

The strongest candidate initiated curation early only once, then became dependent
on warnings. Other models either waited for pressure, required user direction, or
stopped after a malformed tool call. The current system prompt and status messages
can support good curation, but do not reliably cause models to keep context hygiene
in mind during primary work.

A capacity threshold is necessary as a safety mechanism, but it cannot identify a
natural work boundary. A harness-side boundary heuristic would be speculative,
task-dependent, and difficult to validate. Current evaluation evidence does not
justify one.

### Automatic compaction destroys selectivity

Current automatic compaction replaces a large part of the transcript with a single
summary. That summary cannot be selectively pruned, and it can omit details that
the model had deliberately kept available. The Qwen 3.8 Flash session shows the
consequence: after compaction it had neither detailed project understanding nor a
usable inventory for further curation.

### Block selection and state management remain fallible

Models can corrupt long block IDs, choose an invalid argument shape, or discard
material that is still needed. In Qwen 3.8 Flash, about 30 unknown IDs across five
prune calls were corrupted copies of real IDs, and malformed IDs propagated when
the model copied its own earlier reasoning. The tool reports unknown IDs, but the
model did not act on that correction repeatedly. A fuzzy `did you mean` correction
may help, but it adds complexity and risk to a destructive operation; the
cross-session review must establish whether this is a general problem first.

Curation state is also session-global rather than branch-scoped. The user can
restore blocks through `/prune`, and durable session history is retained, but
these safeguards do not make a poor live selection free.

## Replaceability and post-prune re-reading

A file read again after pruning is not, by itself, evidence that the earlier prune
was wrong. Repository files and reproducible command results are replaceable
working material. User instructions, decisions, external observations, and
subagent findings are harder to reconstruct and need stronger protection.

In the local serving stacks used for the PoC, every `prune_context` call has
invalidated the server-side KV cache and caused a cold prefill. Under that observed
condition, retaining an old file copy does not preserve a free cached copy; pruning
it can reduce immediate prefill and attention burden, while a later tool call can
restore the file if needed. The tool cost of reacquisition is real but bounded.

For this reason, model-visible post-prune re-acquisition accounting was removed.
Its 15-turn re-read signal measured a curation style, not curation quality, and
risked rewarding retention of easily replaceable files. The [over-pruning research
note](../../evals/reflective-context-research-notes.md) describes the distinct,
more serious failure mode: losing nearly all hard-to-reconstruct task state.

## Changes and decisions so far

| Change | Decision and evidence |
| --- | --- |
| Proactive context-hygiene guidance | Retained. It defines the target behavior, but has not yet made it reliable across models. |
| `list_context`, `prune_context`, and `summarize_context` | Retained. Separate verbs fixed misleading no-op semantics; block summaries give the model a way to preserve irreplaceable conclusions. |
| Derived hygiene threshold | Retained. It ensures warnings precede compaction when reserve settings change. Its 10-point lead accounts for turns large enough to consume the previous 5-point lead; the Muse Glimmer session validates the pressure-response path. |
| Post-prune accounting feedback | Removed. Re-reading replaceable material is not a demonstrated negative outcome, and the feedback added attention load while optimizing an unvalidated proxy. |
| Skip stale post-prune compaction checks | Retained as a correctness fix. A curation action rebuilds live context, so the pre-prune usage estimate must not immediately trigger compaction of the old context. |

## Next experiments

1. **Evaluate the revised curation guidance.** The next pilot uses concise static
   guidance to preserve hard-to-reconstruct state while removing closed,
   replaceable material, and an urgent status message with the same distinction.
   Compare system instructions, context-status messages, and tool results as
   channels for future guidance changes. Do not add recurring post-prune feedback
   unless it has a distinct purpose beyond the existing factual tool result.
2. **Review the current evaluation cross-section.** Classify curation initiative,
   plans that were not executed, ID-copy errors, response to corrections and
   pressure signals, and subagent use. Use this before deciding which harness
   changes merit implementation. One low-priority locally hostable candidate
   remains; whether to add larger frontier models is an open decision.
3. **Reduce execution friction at capacity pressure.** The Qwen session shows that
   a strong descriptive plan can lose to competing work when it still requires
   listing blocks and matching descriptions to IDs. Keep the response open; ideas
   such as pruning by description or surfacing IDs in status messages have
   substantial trade-offs.
4. **Evaluate outcomes, not re-read counts.** Compare continuity of task state,
   preservation of decisions, recovery after compaction, curation initiative, and
   output quality. Treat post-prune reacquisition as descriptive telemetry only if
   it is recorded at all.
5. **Preserve selectivity through compaction.** Explore topical, selectable
   summaries or another post-compaction context structure instead of one monolithic
   project-history summary.
6. **Improve decision support.** Show trustworthy per-block capacity estimates in
   `list_context` and `/prune`, and allow users to create summaries from `/prune`.
7. **Make curation state branch-scoped.** Defer `/tree` restoration of excluded
   blocks and branch-scoped curation state until the upstream harness v2 work
   provides explicit branch or lane identity.

## Evidence and implementation references

- [Evaluation records and method](../../evals/reflective-context-results.md)
- [Mechanism research notes](../../evals/reflective-context-research-notes.md)
- [Reflective context management](reflective-context.md) — current user-visible behavior
- [Prune implementation](prune.md) and [context construction](context-building.md) — implementation details
