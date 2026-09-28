# Qwen 3.8 Flash — local llama.cpp (EngramHalo fork), `AP-Q5_K_XL` + MTP

**Final curation grade: 7/10.**

## Serving and protocol

The model ran through llama.cpp on the EngramHalo fork (Strix Halo, ROCm), with
an `AP-Q5_K_XL` main model; an `easiix Q8_0` MTP draft model; an SSD-mapped
n-gram engram table; KV q8_0; the FA vector kernel; and
`draft-mtp,ngram-mod` speculative decoding. The protocol setting was xhigh:
the template supports `low`, `medium`, and `xhigh`, with `high` remapped to
`xhigh` as its closest equivalent. The GGUF's embedded sampling defaults applied
(temperature 1.0, top-k 20, top-p 0.95), because pi sends no sampling parameters
unless configured. Throughput was approximately 15–20 tokens/second with
acceptance-discounted MTP.

This was the first run on a live-instrumented harness. A surgical session reset
introduced the then-experimental post-prune accounting mechanism, so only later
prune windows contained its messages. The mechanism was subsequently removed;
reacquisition of a file from disk is not, by itself, evidence of poor curation.

## Initial round: strong implementation and deliberate curation

The initial round produced 218 assistant turns and 243k output tokens.

At 47% context use, without a hygiene warning, at a completed work-package
boundary, the model called `list_context` and pruned stale requirement-document
reads. Its reasoning was explicit: the documents remained on disk and could be
reread if needed. This is the evaluation's clearest boundary-initiated curation
event and the behavior that the Qwen3.8 27B record identifies as necessary for a score
above 8/10.

The initial round contained five prune calls. They submitted 14, 17, 75, 68, and
53 IDs, excluding 8, 17, 58, 58, and 48 blocks respectively. Each curation event
was preceded by `list_context`. The model also made the series' first
`summarize_context` call, using it appropriately: it summarized irreplaceable
conversational material—the subagent-review conclusions—and pruned file reads that
could be reacquired from disk. It used summaries to preserve value, not merely to
remove tokens.

The native-only accounting reported no `read` or `edit` of an excluded file within
15 turns for the 58-, 58-, and 48-block prunes. A shell-aware audit found that
some files represented in those excluded blocks were reread through `bash` within
the same windows. A later 87-block recovery prune did not complete an accounting
window before the session ended.

The post-series audit recorded additional re-acquisition: requirements documents
from the first prune were reread nine minutes after exclusion, and documents plus
`simulation.cpp` from the 48-block prune were reacquired for remaining
documentation work. One further window contained only a 95-character exception.
These observations describe the model's working-set transitions; they are not used
as a direct quality verdict. The removed native-only tracker also did not observe
shell-mediated reads such as `sed` and `grep`.

A separate mechanical weakness affected several selections. Across five prune
calls, approximately 30 submitted IDs were unknown. Every one was a corrupted copy
of a real ID: dropped digits, transpositions, near-character substitutions, an
embedded space, or one stale already-pruned ID. Corrupted forms then propagated
through the model's own later reasoning. The model never fabricated an ID, and
paths, code, and diffs were copied correctly. The operator therefore recorded this
as a general weakness with long digit strings, not as a curation-selection defect.
Harness validation made the consequence zero. It is recorded but not scored.

## First repair: degradation after automatic compaction

From the first repair prompt, the model's initiative weakened. It still curated
when the hygiene warning appeared, and it executed those actions well, but it no
longer acted early at work-package boundaries. Repair work also added diagnostic
reasoning and diff/test residue with no disk original, so its successful
round-one strategy of rereading files could no longer remove enough context.

At 98,728 tokens, automatic compaction ran. The resulting context had 17 blocks,
one of them a machine summary representing the entire project history. Two effects
followed from this same loss of detailed context:

- **C++ work degraded.** The model reconstructed project scope from
  summary-level requirements and implemented unrequested features. Those scope
  confabulations introduced regressions that the second repair later removed;
  the final repair described all three defects as fixed by deletion.
- **Curation degraded.** Inventory-based selection no longer had useful objects to
  act on. A single, unprunable project-history summary cannot be selectively
  curated. As context grew again, the model made 5-ID gestures rather than
  rebuilding a working set.

An operator interruption prevented one further compaction. After an explicit hint
to curate proactively, the model made an 87-block prune. That action rebuilt a
lean, self-curated context. The final repair then ran cleanly, briefly, and without
further curation. The model did not itself degrade and recover; its available
context did.

The compaction also removed, or summarized too tersely to preserve, build-location,
CMake-structure, and testing-convention details that the model's earlier curation
had deliberately retained. While evaluating the output, the C++ task operator
accidentally deleted the project's `./build/` directory. With no clear build
information in its context or project directory, the model confabulated the
fictitious root path `/home/will_cohen/reporting`, which appeared in none of its
inputs, instead of checking its current directory. It listed the parent directory,
thereby exposing similarly named directories for the other evaluated candidates,
and then found `/tmp` build directories created by the operator and evaluator while
testing candidates. Those were not this candidate's build directories.

The operator aborted the session before the model could act on those findings,
restored `./build/`, and reset the session to immediately before the first attempt
to find `/home/will_cohen/reporting`. A short corrective prompt stated that `./build/`
had been removed accidentally and instructed the model to reconfigure with CMake
before continuing. Audits of the main and all subagent sessions found no other
boundary event.

## Interpretation

This session provides two linked signals.

1. **Model-led curation has a measurable advantage.** Before compaction, the model
   maintained a useful working set while both C++ quality and session behavior
   remained strong. After the monolithic compaction summary replaced that working
   set, both deteriorated. The 87-block recovery prune restored a lean context and
   a clean final round.
2. **Proactive curation was not durable.** Even the strongest candidate initiated
   curation once, then became warning-responsive and later missed the opportunity
   altogether. GPT-5.6 Terra provides a related mixed result: it curated early in
   the initial and final rounds, but its late first-repair selection discarded the
   task contract it needed to preserve.

The implications have two layers. On the harness side, the next experiment will
replace automatic compaction with forced, selective cleanup before context runs
out; simply changing the shape of the summary after compaction would not test
this approach. On the model side, proactive context hygiene may require
post-training, but these sessions cannot establish that cause. Qwen3.8 27B,
Qwen 3.8 Flash, GPT-5.6 Terra, and Qwen 3.8 Max all initiated at least one
pre-pressure curation event. That is notable, but not enough evidence to
establish a family-level trait or a durable model habit.

The session used eight delegated subagent sessions: two parallel pairs, plus
review and documentation checks in the repair rounds. One parallel pair lost two
members to KV-pool exhaustion: at 63.4% main-session context, approximately 16k
tokens remained per subagent against roughly 10k tokens of fixed prompt overhead.
The surviving solo documentation check ran at approximately 97% pool occupancy.
One subagent failure was attributed to an upstream speculative-batch bug in the
`#24840` class (`spec_i_batch` not shifted by view offset), patched in the fork
mid-series.
