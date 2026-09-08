# Reflective-context research notes

This document records mechanism-level observations that inform the
reflective-context proof of concept but do not belong in a single model record.
These are working research notes, not final conclusions. The per-model evidence and
grades are in [reflective-context-results.md](reflective-context-results.md).

## Severe over-pruning and recovery — 2026-09-05

A GPT-5.6 Terra working session on VWmini—not a formal evaluation—excluded 139 of
its 141 context blocks at 82.2% use. The action followed the context-hygiene footer
by seconds and coincided with an operator instruction to “let's finish this.” It
kept only that instruction and the pruning operation's own bookkeeping.

The session nevertheless completed evaluation wrap-up, repair-prompt preparation,
commit, and push. This is **not** a curation success: the model reacted to pressure
rather than acting on its own initiative, discarded active working material, and
continued only because the environment still provided enough external state.

### Observed recovery cost

| Event | Observation |
| --- | --- |
| Hygiene footer | 82.2% at 18:26:10Z |
| Prune | 18:26:38Z; 141 blocks before, 2 retained |
| Context after prune | 223,587 → 12,260 tokens (4.5%) |
| Immediate recovery | Reorientation, rereads, and formatter diagnostics rebuilt context to 54,608 tokens (20.1%) within three minutes |
| Re-ingested material | Approximately 42k tokens, much of it from blocks just excluded |

The incident establishes a robustness floor: over-pruning did not destroy durable
information. It converted tokens already in context into reread tokens and latency.
That is survivable, but not efficient or desirable.

## What the incident shows

### The prune result acted as retained memory

A `prune_context` result lists every excluded block and its first line. Because that
tool result remains in context, it became an accidental, low-fidelity summary:
approximately 45 characters per block, or roughly 95% compression across the 139
blocks in this incident.

The manifest preserved the operator instruction to flag formatter diagnostics in
the pending repair prompt, the preceding diagnostics observation, and the model's
confirmation (“The second repair prompt should explicitly require:”). The final
repair prompt included the requested section. The retained prune manifest therefore
carried information that would otherwise have been removed.

**Design implication:** make this retention intentional. Guarantee the first *N*
characters of excluded user messages in the manifest, because user instructions are
especially costly to lose. Assistant-text heads may also be useful. Tool-output
space is a practical place to preserve small but important state; compact-smart's
compaction-transition preamble uses the same pattern.

### Three conditions produced the over-prune

1. **A missed natural boundary.** The previous prune was at 13:22Z, removing 81
   blocks and leaving 11. No further prune followed for five hours despite at
   least two work-package boundaries: closing the Laguna evaluation around
   14:32Z and starting Muse Glimmer work around 15:08Z. The Laguna close was a
   trickle of small commits, and the wait-heavy Glimmer round interleaved a third
   evaluator-infrastructure package. These blurred the boundaries at which this
   model otherwise tends to curate, including at approximately 25% capacity.
2. **Stacked pressure.** At the decision point, the model faced 82.2% use, an
   explicit hygiene footer, the operator's imperative to finish, and a multi-step
   final task. Removing nearly everything guaranteed that it would not have to
   manage context again before finishing. That is risk minimization, not
   working-set curation.
3. **Asymmetric feedback.** The harness makes under-pruning visible through
   pressure, warnings, and forced compaction. It provided no immediate signal for
   over-pruning, while rereading appeared to the model as diligence. A model that
   optimizes only visible signals can converge on excessive removal.

**Design implication:** surface the cost of over-pruning. Post-prune accounting
should report what was excluded and whether related material was reread in the
following turns. This closes the feedback loop and lets a model learn its active
working-set boundary rather than oscillating between hoarding and amputation.

## Provisional conclusion

The incident is evidence of a failure mode, not evidence against the whole
approach. The same model has otherwise curated autonomously at work-package closes
and at low capacity. The important result is narrower: the worst observed
selection was recoverable, and its proximate causes suggest harness changes that
can be tested directly.
