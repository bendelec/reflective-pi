# Reflective context research notes

Short notes on mechanism observations that inform the reflective-context
proof of concept but do not belong to the per-model evaluation results.
Linked from `reflective-context-results.md`.

## A degenerate curation incident, and what survived it (2026-09-05)

The vwmini master session (GPT-5.6 Terra, hosted; a working session, not an
evaluation) pruned 139 of its 141 context blocks at 82.2% use, seconds after
the context-hygiene footer fired and an operator "let's finish this"
instruction. It kept only the operator sentence and the pruning operation's
own bookkeeping. The session then continued correctly through evaluation
wrap-up, repair-prompt preparation, commit, and push.

This is not recorded as a success. The trigger was the capacity nudge, not
the model's initiative; the execution destroyed the active working set; and
the continuation was carried by environmental preconditions rather than by
the quality of the prune. What the incident demonstrates is the robustness
floor of the design: a worst-case prune recovered without functional loss.

Numbers: the hygiene footer fired at 82.2% at 18:26:10Z; the prune executed
at 18:26:38Z; 141 blocks in, 2 kept; context fell from 223,587 tokens to
12,260 (4.5%); the subsequent re-orientation sweep (git status, re-reads of
the evaluation record, the repair prompt, and the completion report, plus a
re-run of the formatter diagnostics) rebuilt context to 54,608 tokens
(20.1%) within three minutes. Roughly 42k tokens were re-ingested, much of
it re-reading material whose blocks had just been excluded. In this
environment over-pruning does not lose information; it converts context
tokens into re-read tokens and latency.

### Finding 1: the prune manifest is retained memory

`prune_context`'s tool result enumerates every excluded block with its first
line. That result block is part of the retained context, so the manifest
acts as an accidental, low-fidelity compaction summary (~45 characters per
block, ~95% compression over the incident's 139 blocks). In this incident it
preserved, verbatim, the operator's one-line instruction to flag formatting
diagnostics in the pending repair prompt, the preceding diagnostics
observation, and the assistant's own confirming reply ("The second repair
prompt should explicitly require:"). The final repair prompt contains the
requested section; the causal chain runs through the manifest, which the
post-prune model had kept as ordinary tool output.

Design implication: make this deliberate. Guarantee the first N characters
of pruned user messages in the manifest, on the theory that user
instructions are the highest-value loss, and consider assistant text heads
as well. Tool-output space is where state survives context management; the
compaction transition preamble in compact-smart is the same pattern.

### Finding 2: the degeneration has three layers

1. A missed boundary. The session's prior prune ran at 13:22Z (81 blocks,
   leaving 11). No prune followed for five hours across at least two work
   boundaries (the Laguna evaluation line closing around 14:32Z, the Muse
   Glimmer candidate work starting around 15:08Z). The Laguna close was a
   trickle of small commits rather than a dramatic close, and the
   wait-heavy Glimmer round interleaved a third work package (evaluator
   infrastructure), blurring the boundaries the model normally prunes at.
   The model's observed norm elsewhere — initiative prunes at work-package
   closes, including at least one at ~25% capacity — did not engage.
2. A pressure stack. At the decision point the model simultaneously held:
   82.2% capacity, the hygiene footer's explicit demand, an operator
   "finish this" imperative, and a multi-step final task. The radical reset
   guarantees no further curation interruptions during the final stretch.
   That is risk minimization, not curation: it optimized for "no more
   context management needed" instead of keeping the working set.
3. An asymmetric feedback landscape. The harness punishes under-pruning
   loudly (capacity pressure, hygiene nudges, forced compaction) and
   over-pruning not at all — the re-read cost is invisible to the model,
   and re-reading feels like diligence. A model optimizing the signals it
   can see will, under pressure, converge on over-pruning. The incident is
   what that incentive landscape selects for; it is a property of the
   design, not a quirk of the model.

Design implication: surface over-pruning cost. A post-prune accounting
block (what was excluded, and what was re-read within the following turns)
would close the feedback loop and let models learn the working-set boundary
empirically instead of oscillating between hoarding and amputation.

### Verdict

The model otherwise handles autonomous curation well across sessions,
including initiative prunes at work-package closes and at low capacity. The
concept works; this incident is the failure tail, and it is informative
precisely because the worst case was survivable and its causes are
addressable in the harness rather than in the model.
