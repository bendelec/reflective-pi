# Qwen 3.8 Max — Venice-hosted `qwen-3-8-max`

**Final curation grade: 5/10.**

The session began on September 8 while GPT-5.6 Terra was finishing and
continued through September 9. It covered the initial implementation and both
repair rounds in one main session, with 17 matching subagent sessions. The Venice
session used a 131,072-token context window and a 32,768-token output limit.

The model made eleven `prune_context` calls. Five large, effective selections
excluded 91, 35, 61, 28, and 69 blocks; it also summarized two completed worker
reports. The first 91-block reset came late, at 93.6% use, but deliberately kept
the original task prompt. The 35-block prune followed the completed pathfinding
work package, retaining the simulation requirements and current implementation
material for the next package. Later, at 61.6% use, it excluded 28 superseded
blocks before updating documentation. This was a genuine pre-pressure cleanup,
not a reaction to an imminent compaction.

The behavior was not sustained. Six automatic compactions occurred: two during
initial implementation, two during the first repair, and two during the final
repair, at 106,834–130,563 tokens before compaction. After a listing at 75.7%
in the first repair, compaction replaced the listed blocks before the planned
41-ID prune could execute. Another attempted 39-ID prune just after an earlier
compaction found nearly all its IDs gone. These were stale-selection races, not
fabricated IDs. A separate 24-ID selection succeeded on only three blocks because
most of its IDs had already been removed. Post-compaction two- and three-block
prunes mostly removed bookkeeping; they did not prevent the next buildup.

The final repair's 69-block prune reduced use from 79.9% to 18.0%, yet two more
compactions followed before completion. The model did preserve the new repair
prompt and relevant summaries in that selection. No comparable loss of the task
contract is evident in the recorded prunes; the problem was failure to repeat
useful curation early enough, especially across long turns, rather than the
selection error seen with GPT-5.6 Terra. The one summary was used to retain
completed worker findings while removing replaceable exploration.

The separate [VWmini evaluation](https://github.com/bendelec/local-agent-cpp-eval/blob/main/evaluations/qwen38-max-venice-run-01.md)
records 80/82 initial and 81/82 first-repair conformance. The final repair was
completed in the candidate workspace, but its source had not been archived or
scored in that evaluation repository. C++ conformance is not an input to this
curation grade.

The 5/10 grade reflects competent, at times forward-looking use of pruning and
summarization, offset by six compactions and missed opportunities to curate before
capacity pressure. Flash earns 7/10 despite its damaging compaction because it
curated at a natural boundary as early as 47%, preserved hard-to-reconstruct
findings with a summary, and maintained a selective working set through most of
the initial round. Max made some comparably sensible selections, but its first
large prune came at 93.6%, and its later cleanups did not prevent two compactions
in each round. Neither model sustained early initiative throughout; Max's repeated
reliance on automatic compaction is the difference, not its C++ conformance.
