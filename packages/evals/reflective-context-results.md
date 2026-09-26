# Reflective-context evaluation results

This report records qualitative observations from the reflective-context-management
proof of concept in rxpi. Grades are provisional until a session has been reviewed;
they assess **context curation** only.

The [separate C++ agent evaluation](https://github.com/bendelec/local-agent-cpp-eval/blob/main/evaluations/overview.md)
covers each session's C++ project, architecture, code quality, and functional
requirement coverage. Consult it to assess a model's C++ development capabilities,
rather than this proof of concept's context-management results.

Each candidate completed the same long-running, independent agentic task: an
initial implementation round followed by two repair rounds in one main session.
The task was designed to require at least ten times each model's context-window
capacity, making context management unavoidable. That expectation held, or nearly
held, for the long runs; Muse Glimmer completed unusually tersely and used
substantially less than ten windows.

## Results at a glance

| Model | Hosting / quantization | Curation grade | Main finding |
| --- | --- | ---: | --- |
| DeepSeek V4 Flash | Local Dwarfstar `ds4`; `dwarfstar-iq2` | 3/10 | It pruned effectively after explicit user direction, but never sustained curation on its own. Four automatic compactions followed its last successful cleanup. |
| DeepSeek V4 Flash | Venice (hosted); BF16 | 3/10 | It showed the most autonomous intent, but the old tool contract silently accepted fourteen empty selections. One 42-block prune was effective; roughly six force-compactions still followed. |
| Qwen3.8 27B | Local Lemonade; `UD-Q8-L-XL` | 5/10 | It made three substantial, deliberate cleanups, then relied on six automatic compactions through the more difficult second half of the task. |
| Laguna S 2.1 | OpenRouter (hosted); full precision | 3/10 | It followed its only hygiene nudge correctly within one second, but the nudge and sixth compaction raced; compaction won by 3 ms. Earlier buildups produced no nudge. |
| Laguna S 2.1 | Local ds4 (revived); sigQ8/Q4K, guarded | 3/10 | It attempted curation before capacity pressure. Its block choices were correct, but it supplied a comma-separated string instead of an array and never tried again. |
| Muse Glimmer 30B | Local Lemonade; `UD-Q8_K_XL` | 4/10 | It responded well to the hygiene nudge: six incremental prunes reduced use from 71.6% to 16%, avoiding all automatic compactions. It was never proactive, and two prunes removed active repair material. |
| Qwen 3.8 Flash | Local llama.cpp (EngramHalo fork); `AP-Q5_K_XL` + MTP | 7/10 | It was the first model to curate at a work-package boundary well before pressure, used `summarize_context` appropriately, and selected blocks well. Its initiative then declined, and a single automatic compaction degraded both the C++ result and subsequent curation. |
| GPT-5.6 Terra | OpenAI Codex API subscription; `gpt-5.6-terra` | 5/10 | It made proactive cleanups in the initial and final rounds and avoided compaction, but its late first-repair prune discarded the initial task and authoritative requirements. |
| Qwen 3.8 Max | Venice (hosted); `qwen-3-8-max` | 5/10 | It made several substantial, mostly well-targeted cleanups and one appropriate summary, but six automatic compactions still interrupted the three rounds. Unlike Qwen 3.8 Flash (7/10), it did not maintain a useful working set for long enough to avoid repeated compaction. |

## Current findings

The Qwen 3.8 Flash session is the most informative result so far. It is the
first run to use `summarize_context` and provides the clearest comparison of the
two context-management strategies in one task:

- Before automatic compaction, model-led curation preserved a lean, useful working
  set while both session execution and C++ work remained strong.
- After automatic compaction replaced most history with one monolithic summary,
  the model lost both detailed project understanding and a useful inventory for
  further curation. An explicit intervention and an 87-block prune later rebuilt a
  usable context.
- The same model did not sustain its early initiative. It curated unprompted once,
  then mostly responded to hygiene warnings. The present harness can support
  proactive curation, but the behavior does not yet appear to be a stable model
  habit.

The later Qwen 3.8 Max session adds a useful contrast: it could exclude large,
replaceable work-package histories and once curated at 61.6% use, but six
compactions still occurred. Flash's early work-boundary curation and selective
summary kept its working set useful through most of the initial round; Max's
largest first cleanup came at 93.6%, and its useful later prunes did not keep pace
with context growth across the three rounds. This difference in sustained control
of context, not C++ task quality or the mere number of tool calls, explains the
7/10 versus 5/10 grades.

These observations are encouraging but preliminary. They do not establish that
context curation improves all models or tasks, nor do they isolate model quality,
serving configuration, and harness behavior from one another.

## Evaluation records

### DeepSeek V4 Flash — local Dwarfstar `ds4`, `dwarfstar-iq2`

**Final curation grade: 3/10.**

The completed session required seven automatic compactions. The model made six
`prune_context` calls: three old-contract listing-mode calls and three effective
exclusions of 13, 5, and 88 stale blocks. Each effective cleanup followed an
explicit user intervention about context management. This demonstrates that the
model could inspect the block list and make useful selections when directed.

It did not maintain that behavior. After the final 88-block cleanup, it allowed
four further automatic compactions without another curation pass. Its reasoning
often recognized the problem, but deferred it for “one more edit” or another
investigation. The main failure was follow-through, not inability to use the tool.

Transcript review found 28 candidate re-reads after exclusion. Most followed new
external verification requests and were appropriate re-validation of files that
had become relevant or changed. They do not materially affect the grade.

The 3/10 grade reflects demonstrated tool competence under direct guidance, but
no reliable autonomous or sustained curation. This run is not evidence that the
current prompts alone produce proactive context management.

### DeepSeek V4 Flash — Venice-hosted, unquantized BF16

**Final curation grade: 3/10.** This is the inverse profile of the local
Dwarfstar IQ2 DeepSeek V4 Flash run.

This model showed the strongest autonomous intent among the evaluated models and
the weakest execution. It made 18 self-initiated `prune_context` calls without user direction.
One early, reasoned exclusion of 42 stale requirement reads and exploration blocks
worked. One call used a hallucinated ID. The remaining fourteen calls passed
`{"ids": []}`; the pre-split interface answered each with the success-shaped
no-op `Pruned 0 block(s).` The model perceived pressure and repeatedly attempted
action, but the interface provided no clear failure signal.

The session contains nine compaction entries, six of which are genuine
force-compactions. The final three entries (19:09, 19:22, and 19:34; `tokensBefore`
124582 → 124176 → 115128) are a retry cascade caused by the known compaction
reservation defect. Given the observed generation and tool-traffic rates, they
cannot represent three separate context refills and are not counted as three
failures.

No subagents were used, unlike Qwen 3.8 Flash's eight delegated sessions and the
local Dwarfstar IQ2 DeepSeek V4 Flash run's four verification passes. The session
produced 968k output tokens, the largest total before Qwen 3.8 Max, and least
effective curation.
Its reconsideration rate was among the most stable—0.30 markers per 1k output
tokens, equal to Qwen3.8 27B and well below the local Dwarfstar IQ2 DeepSeek V4
Flash run's 1.35—so stable reasoning did not translate into effective curation.

The 3/10 grade recognizes genuine autonomous intent and one competent large
prune, but the harness still had to compact roughly six times after those attempts.

### Qwen3.8 27B — local Lemonade, `UD-Q8-L-XL`

**Final curation grade: 5/10.**

At 70.9% context use, without user intervention, the model chose to curate before
starting its next work package. It listed blocks, identified stale exploration and
build output, and selected blocks deliberately.

Its first three selection calls used a nested `ids` object instead of the required
array. It persisted with that malformed shape even after the user supplied the
correct syntax. This was a real tool-use weakness, but the then-untyped schema
said only that `ids` accepted `Any`, despite the tool requiring an array of
strings. The contract was therefore avoidably ambiguous. After interruption and
resume, the model successfully selected 62 blocks, then made two further
deliberate selections of 43 and 67 blocks.

The model explicitly kept material that might remain valuable and removed content
that could be reread from disk. That trade-off need not match a human's exact
selection to count as competent forward-looking curation. The initial syntax
failures are consequently not a material score deduction: the exposed contract
was ambiguous, and the corrected contract was used successfully.

The trigger was still capacity pressure. The model did not consider curation until
70.9% use. A higher score requires treating context hygiene as an independent
quality goal at plan milestones, topic changes, and other natural boundaries, not
only as a response to imminent capacity loss.

The behavior also did not last. After its third cleanup, the model allowed six
automatic compactions. At 88.5%, it chose to write a comprehensive completion
report rather than curate and immediately triggered compaction. At 95%, it called
`prune_context` after compaction had already reduced the context, credited the
listing call with the reduction, and made no selection.

One compaction attempt failed at 124,600 recorded tokens because the compaction
prompt and system instructions exceeded Qwen3.8 27B's 131,072-token input limit.
The user temporarily selected a larger-context model to perform the compaction.
This was an inherited harness-reserve failure, not a Qwen3.8 27B failure.

The 5/10 grade reflects substantial autonomous, deliberate pruning early in the
task but no durable hygiene practice through the difficult second half. This
session used the original prompt; the stronger quality-driven policy and the
above-80% fallback instruction were introduced later.

### Laguna S 2.1 — OpenRouter-hosted (poolside), full precision

**Final curation grade: 3/10.**

The model completed all three rounds in one session and delegated two focused
subtasks, both to the evaluated model: a review of the avoidance-region changes
and a documentation-consistency check during the final repair. It made no malformed
tool call, hallucinated no ID, and made no no-op curation call.

Six automatic compactions carried the session, each at 98k–120k tokens before
compaction. `prune_context` and `summarize_context` were never effectively
executed. The first `list_context` was an orientation mistake also seen in the
locally served Laguna S 2.1 run: the model expected a repository file listing and
corrected itself immediately.

The second listing was a correct response to the only hygiene nudge. The nudge
fired at 91.9% at 19:25:18.850, in the same turn boundary as the sixth compaction
at 19:25:18.847. The model followed the instruction one second later: it listed
blocks, found the already-compacted context contained only four fresh blocks, and
correctly declined to prune. The earlier five compactions occurred during gradual
buildups at the 75% compaction line. The 80% hygiene tier had been preempted by
the raised 32k reserve, so no earlier nudge existed to answer.

Outside the curation axis, this was the most output-efficient completion: 571k
output tokens, versus 644k–968k for the other models then measured. It used 454k
thinking tokens (79% of output), including coherent 32k-token turns, and used
compaction summaries effectively despite never requesting them. Its
reconsideration rate was 0.80 per 1k output tokens, second highest among the
evaluated models. The OpenRouter full-precision model retained a trait that
collapsed into a 41-cycle attractor on the local ds4 quantization; see the local
serving note below.

The 3/10 grade reflects immediate and correct response to the harness instruction,
with the action consumed by a documented harness race. The model had no opportunity
to demonstrate proactive curation because the signals were structurally preempted
until that race.

### Laguna S 2.1 — local ds4 (revived branch), sigQ8/Q4K, repetition-guarded

**Final curation grade: 3/10.**

This was a single approximately 24-hour session with no subagents: the initial
prompt, two repair prompts, several short continue nudges, and one early
thinking-style steering message. It attempted curation before capacity pressure.
Early in orientation, with no context-status message,
it listed the context and selected four correct block IDs. It sent them as a
comma-separated string rather than the required array. The strict contract returned
an instructive error—`'ids' must be an array of block ids from list_context`—and
the model never attempted another prune across the remaining four approaches to
the compaction line.

This was an argument-encoding failure, not a selection failure. It matches the
model's broader structural tool-use weakness: edits repeatedly left duplicated or
missing lines at edit boundaries, several times badly enough to require rewriting
source files from scratch.

No hygiene nudge fired. The binary predated the derived 70% threshold, leaving the
80% nudge tier permanently behind the 75% compaction line. As in the
OpenRouter-hosted Laguna S 2.1 run, absence of a response to a non-existent nudge
is not held against the model.

Four threshold compactions carried the session (98.4k–99.7k tokens before each),
all produced by compact-smart. The first predates deployment of the transition
preamble; the final three include it, and that first live test passed. The run
produced the least output among the non-Glimmer sessions (281k tokens) and the
calmest reconsideration rate, 0.25 per 1k output tokens. The OpenRouter-hosted
Laguna S 2.1 run measured 0.80, the largest serving-dependent temperament shift in
the evaluation.

Serving this model locally was difficult. Quantized deployments were prone to
attractor loops that mainstream serving options did not catch. It was eventually
served on a branch of antirez's ds4 with a simple family-specific repetition guard:
a presence penalty over a session-token window. Every monitored long turn in this
run, including 16k-token outputs, stayed clean. The guard is a serving condition,
not model merit. Two user turn resets during test-code confusion are recorded as
interventions.

The 3/10 grade reflects genuine, correctly targeted pre-pressure intent followed
by permanent abandonment after one structural error. Four forced compactions then
completed the session.

### Muse Glimmer 30B — local Lemonade, `UD-Q8_K_XL`

**Final curation grade: 4/10.**

One session covered the initial and both repair rounds: 66 assistant turns, no
subagents, and 57k output tokens—the evaluation's leanest run by an order of
magnitude.

Its curation was entirely pressure-driven, but the pressure path worked end to
end. Round one reached 52.8% with no curation. During repair, the derived hygiene
threshold fired at 71.2%, and the model began pruning within three minutes. It
made six incremental `prune_context` calls over 30 minutes, removing 8–10 blocks
at a time (58 total) and reducing context use from 71.6% to 16.0%.

This is the first live validation of the derived-threshold change: the warning
preceded compaction, the model responded, and the session ended with no automatic
compactions. It is the only evaluated run to avoid them entirely. It also had
no output-limit truncations; its longest turn was 13,035 tokens, about 40% of the
cap. Every other model evaluated to date reached the 32,768-token cap early in its
initial round, usually on the first long thinking turn after short orientation turns
that read the workspace structure and requirements documents.

Retroactive re-acquisition accounting reconstructed from the session file found
four clean windows and two working-set mistakes. The model reread its own
`implementation-plan.md` and `tests/test_basic.cpp` after pruning them; both were
central to the repair round. Apart from those mistakes, the selections were sound:
mostly older read results removed in deliberate small steps rather than a panic
reset.

The run had a distinctive reasoning profile: simplification markers at 3.15 per
1k thinking tokens, compared with 0.47–1.13 for the other evaluated models, and
three unprompted “given limited time” deliberations. This same controllable-effort prior
appeared as budget vocabulary, scope trade-offs, and output restraint. Its
reconsideration rate was 0.00 per 1k output tokens, the evaluation's lowest.

The 4/10 grade recognizes the best pressure-triggered curation observed in this
evaluation: timely, sustained, mostly well targeted, and sufficient to prevent
forced compaction. It
remained a response to a warning, not curation initiated at a work-package
boundary.

### Qwen 3.8 Flash — local llama.cpp (EngramHalo fork), `AP-Q5_K_XL` + MTP

**Final curation grade: 7/10.**

#### Serving and protocol

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

#### Initial round: strong implementation and deliberate curation

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

#### First repair: degradation after automatic compaction

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

#### Interpretation

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

The implications have two layers. On the harness side, experiments should test
better guidance and a post-compaction context made of topical, selectable summaries
rather than one monolith. On the model side, proactive context hygiene may require
post-training; it does not yet appear to be behavior reliably sampled by models
trained around traditional compaction. Qwen3.8 27B, Qwen 3.8 Flash, GPT-5.6
Terra, and Qwen 3.8 Max all initiated at least one pre-pressure curation event.
That is notable, but not enough evidence to establish a family-level trait or a
durable model habit.

The session used eight delegated subagent sessions: two parallel pairs, plus
review and documentation checks in the repair rounds. One parallel pair lost two
members to KV-pool exhaustion: at 63.4% main-session context, approximately 16k
tokens remained per subagent against roughly 10k tokens of fixed prompt overhead.
The surviving solo documentation check ran at approximately 97% pool occupancy.
One subagent failure was attributed to an upstream speculative-batch bug in the
`#24840` class (`spec_i_batch` not shifted by view offset), patched in the fork
mid-series.

### GPT-5.6 Terra — OpenAI Codex API subscription

**Final curation grade: 5/10.**

This run used `gpt-5.6-terra` at the `high` reasoning level with a 131,072-token
context window and 32,768-token output limit. It was launched through a standalone
binary built before the current harness revision, so it retained the legacy
post-prune accounting feedback. The API exposed only short reasoning summaries and
encrypted continuation data, not raw reasoning content. Its 39,578 reported
reasoning tokens therefore did not create the same visible context pressure as
runs that retain their thinking output.

The session made four `list_context`/`prune_context` cycles, used no
`summarize_context` call or subagent, and never reached automatic compaction. In
the initial round, it curated without a warning at 40.0% use: it excluded 21 stale
orientation, build, and development blocks while retaining the initial task and
requirements. A second cleanup removed four failed-build and status blocks.

The first repair showed the central failure. The model did not curate again until
the harness injected its urgent hygiene instruction at 80.5% use. Listing context
then increased use to 82.9%, leaving little room before compaction. Its resulting
88-block prune reduced use to 22.2%, but included the initial task prompt and the
original requirements and public-API reads. Those are hard-to-reconstruct task
state, not ordinary replaceable file output. The trace contains no explicit model
response to either legacy accounting message.

During the final repair, the model again acted without a warning at 60.5% use. It
listed context and excluded 32 older repair-history blocks, reducing use from
79,278 to 44,242 tokens. This demonstrates that the model could make timely,
forward-looking selections, but it could not restore the discarded initial task
prompt. It did reread the requirements and API documents from disk after the
first-repair prune.

The separate [VWmini evaluation](https://github.com/bendelec/local-agent-cpp-eval/blob/main/evaluations/gpt56-terra-openai-codex-run-01.md)
reports 81/82 conformance and a 40/100 safety-capped C++ score. Those results are
not inputs to the curation grade.

The 5/10 grade recognizes repeated pre-pressure initiative and avoidance of
automatic compaction. It cannot score higher because the late, broad first-repair
prune removed the initial task and authoritative contract—the material a
forward-looking working set most needs to retain.

### Qwen 3.8 Max — Venice-hosted `qwen-3-8-max`

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

## Session comparison

The table covers the main session and eligible subagents only. The main session is
the last-created session beginning with the standard implementation prompt;
subagents are sessions created after it whose first message matches a `run` call in
the main session. All other sessions are excluded. A turn is an assistant message.
Prompt and output tokens are summed across qualifying sessions.

Reconsideration markers are `but wait`, `hold on`, `on second thought`, `scratch
that`, `let me reconsider`, `actually, let me`, and `wait, no`, counted in
assistant thinking and text per 1k output tokens.

| Model | Serving | Grade | Main session | Subagent sessions | Turns | Prompt tokens | Output tokens | Reconsideration / 1k |
|---|---|---:|---|---|---:|---:|---:|---:|
| DeepSeek V4 Flash (local Dwarfstar IQ2) | ds4, antirez IQ2 mixed | 3/10 | `01a00bb1` | 4 (verification passes) | 457 | 20.59M | 644k | 1.35 |
| DeepSeek V4 Flash (Venice-hosted BF16) | Venice (hosted), BF16 | 3/10 | `01a03896` | none | 421 | 30.00M | 968k | 0.30 |
| Qwen3.8 27B | Lemonade, UD-Q8-L-XL | 5/10 | `01a01b54` | 5 (work-package delegation) | 806 | 51.16M | 961k | 0.30 |
| Laguna S 2.1 (hosted) | OpenRouter, full precision | 3/10 | `01a067fc` | 2 (review, docs check) | 409 | 22.77M | 571k | 0.80 |
| Laguna S 2.1 (local) | ds4 revived, sigQ8/Q4K + guardrail | 3/10 | `01a06705` | none | 411 | 20.56M | 281k | 0.25 |
| Muse Glimmer 30B | Lemonade, UD-Q8_K_XL | 4/10 | `01a07220` | none | 66 | 3.40M | 57k | 0.00 |
| Qwen 3.8 Flash | llama.cpp fork, AP-Q5_K_XL + MTP | 7/10 | `01a0779f` | 8 (review/doc-check, two parallel pairs) | 643 | 33.75M | 594k | 0.08 |
| GPT-5.6 Terra | OpenAI Codex API subscription | 5/10 | `01a0815c` | none | 145 | 8.36M | 93k | 0.00 |
| Qwen 3.8 Max | Venice (hosted) | 5/10 | `01a08230` | 17 (reviews, tests, doc checks) | 744 | 32.94M | 1,515k | 0.46 |

## Method and harness notes

### Evaluation conditions

The protocol set every model to a 131,072-token context window and a 32,768-token
output limit. When a served model advertised larger limits, pi's model
configuration clamped it to those values so that the evaluations shared the same
context and output envelopes.

One local-serving constraint required an exception: DeepSeek V4 Flash on antirez
`ds4` used a 100,000-token context window. At 131,072 tokens, the model did not
fit reliably in the host's 128 GB unified memory and caused serving-side
out-of-memory failures. Its output limit remained 32,768 tokens.

GPT-5.6 Terra also differs from the current harness condition. The session used a
standalone binary built before removal of the post-prune accounting feedback and
before the revised guidance was installed. It is retained as an old-harness
frontier-model observation, not a test of those revisions. The Qwen 3.8 Max
session also retained post-prune accounting and did not use the revised guidance.

Lemonade's pi plugin falls back to a 4,096-token output limit when the server
reports no limit. A `models.json` `maxTokens` override restores the intended
32,768-token output limit and should be applied when a candidate is created.

Mechanism observations that are not specific to one model are recorded in
[reflective-context-research-notes.md](reflective-context-research-notes.md).
The current notes cover a severe over-pruning incident and the
prune-manifest-as-memory finding.

### Interface change during the series — 2026-09-01

`prune_context` originally combined two actions: no arguments listed blocks, while
an `ids` argument excluded them. Several models called it without arguments and
then reported that they had pruned successfully. The result looked successful even
though it had only listed blocks.

The interface was split into read-only `list_context` and strictly mutating
`prune_context`. The latter now fails loudly when IDs are missing. Evaluations that
began before the change are not directly comparable with later ones. The locally
served Laguna S 2.1 evaluation was interrupted during this transition and continued
under the new contract; its transcript includes both interfaces.

### Context-status behavior around compaction — 2026-09-03

A context-status message can lag one turn behind a compaction that resolves the
pressure. The OpenRouter-hosted Laguna S 2.1 run's only curation attempt reacted
to a 91.9% status one second after compaction had reduced the context to four fresh
blocks. Models that act during a buildup, such as Qwen3.8 27B at 70.9%, can curate
effectively. Models that react only
at the boundary may be prompted after curation has become pointless, and may learn
that the action is empty. The backlog is to surface the compaction event itself or
send post-compaction status with the first subsequent turn.

Raising `compaction.reserveTokens` to 32k moved the automatic-compaction line to
75%, below the old fixed 80% hygiene threshold. Gradual buildups therefore compacted
before a hygiene message could fire; five of the OpenRouter-hosted Laguna S 2.1
run's six compactions had no nudge. A single turn that passed both thresholds emitted
the nudge and compaction at the
same boundary, creating the documented 3 ms race. The threshold is now derived
from the compaction line: five percentage points below it, clamped to the supported
range. Earlier runs with a 16k reserve and an 87.5% compaction line were not
affected.

### Mechanical session accounting — 2026-09-03

All quantitative claims were recalculated from session files under a fixed protocol.
The main session is the last-created session beginning with the standard
implementation prompt. Qualifying subagents are created after it and begin with a
matching `run` call. Turns are assistant messages; token totals sum per-request
usage across those sessions; reconsideration markers are counted only in assistant
thinking and text.

This pass corrected the following earlier figures: reconsideration rates for local
Dwarfstar IQ2 DeepSeek V4 Flash, Venice-hosted BF16 DeepSeek V4 Flash, and Qwen3.8
27B are 1.35, 0.30, and 0.30 respectively (previously 1.71, 0.48, and 0.40);
OpenRouter-hosted Laguna S 2.1 has 409 turns rather than 408; the local Dwarfstar
IQ2 run made six prune calls with three effective calls rather than three total; and
the OpenRouter-hosted Laguna S 2.1 run used 454k thinking tokens rather than roughly
359k. Qwen 3.8 Max produced the largest reasoning total after its inclusion, at
1.26M reported thinking tokens (the Venice-hosted BF16 DeepSeek V4 Flash run
previously led at 810k).

The same pass verified all compaction counts and pre-compaction context sizes, the
13/5/88 and 62/43/67 block selections, the 18-call decomposition of the
Venice-hosted BF16 DeepSeek V4 Flash run including its 42-block exclusion, the four
compactions after the local Dwarfstar IQ2 DeepSeek V4 Flash run's last cleanup, and
every subagent count in the table at that time. Qwen 3.8 Max was accounted for
later under the same protocol: 17 matching `run` sessions, 744 total assistant
turns, 32.94M prompt and 1.515M output tokens.
