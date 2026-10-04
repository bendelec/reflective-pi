# Reflective-context PoC: status and next experiment

This page connects the current rxpi implementation with the research roadmap. The
completed first phase is archived separately: [results and individual run
records](../../../evaluations/reflective-context/phase-1/README.md),
[evaluation method](../../../evaluations/reflective-context/phase-1/method.md),
and [mechanism research notes](../../../evaluations/reflective-context/phase-1/research-notes.md).
The archive records the evidence and grades; this page tracks the implementation
and what comes next.

## Question and finding

Can a coding agent maintain its context as a focused working set instead of
relying on automatic compaction once capacity runs low? The first evaluation
phase found that most models could make useful keep/prune/summarize choices, but
none sustained proactive curation throughout the long task. The clearest example,
[Qwen 3.8 Flash](../../../evaluations/reflective-context/phase-1/runs/qwen-3-8-flash-llamacpp.md),
curated at a completed work-package boundary and 47% context use. After a later
automatic compaction collapsed its history into one summary, both C++ work and
curation deteriorated. This is informative within-session evidence, not a
controlled causal test of downstream quality.

Selection can also be unsafe. GPT-5.6 Terra excluded its initial task and
requirements during a late cleanup; Muse Glimmer removed active repair material.
Avoiding compaction or minimizing retained tokens is not, by itself, success.
The [phase-one conclusion](../../../evaluations/reflective-context/phase-1/README.md#phase-one-conclusion-and-next-phase)
explains the evidence and its limits.

## Current mechanism and decisions

- The system prompt asks the model to curate at natural work boundaries. The
  separate `list_context`, `prune_context`, and `summarize_context` tools make
  reading, exclusion, and summary replacement explicit. Their split fixed the
  previous success-shaped no-op when a model listed instead of pruning.
- Capacity-status messages are a safety signal. The hygiene threshold tracks ten
  percentage points below the automatic-compaction line; Muse Glimmer followed
  a warning with six incremental prunes and avoided compaction. This was
  effective pressure-driven behavior, not proactive curation.
- Curation markers persist in the session and are reversible through `/prune`.
  Tool exchanges are atomic blocks. New `context_edit` and cancellation entries
  are branch-local by ancestry; legacy `prune` markers retain their global semantics.
- Model-visible post-prune accounting feedback was removed. Re-reading a
  replaceable file does not prove a bad selection; the
  [research notes](../../../evaluations/reflective-context/phase-1/research-notes.md#replaceability-and-re-reading)
  explain the trade-off. Skipping stale post-prune compaction checks remains a
  correctness fix: the next check must use the rebuilt context.

The [user-visible behavior](reflective-context.md), [prune implementation](prune.md),
and [context construction](context-building.md) are documented separately.

## Next phase

Replace **automatic** summary-based compaction with a hard, capacity-triggered,
harness-led interruption. The working model receives an inventory of live blocks
and must decide what to keep, prune, or summarize before task work resumes. Manual
`/compact` remains; there is no automatic summary fallback. If cleanup cannot
preserve task state and free enough capacity, stop for user intervention. This is
planned work, not part of the current implementation.

Evaluate preservation of task instructions and decisions, continuity of work,
usable capacity recovered, and interventions required—not just prune count or
absence of compaction. Later research may train a smaller model for natural-boundary
initiative or introduce a monitoring model; see the [fork roadmap](../../../ROADMAP.md).
