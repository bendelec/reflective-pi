# Reflective context — phase-one results

This phase-one archive records qualitative observations from the reflective-context-management
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
| [DeepSeek V4 Flash](runs/deepseek-v4-flash-dwarfstar-iq2.md) | Local Dwarfstar `ds4`; `dwarfstar-iq2` | 3/10 | It pruned effectively after explicit user direction, but never sustained curation on its own. Four automatic compactions followed its last successful cleanup. |
| [DeepSeek V4 Flash](runs/deepseek-v4-flash-venice-bf16.md) | Venice (hosted); BF16 | 3/10 | It showed the most autonomous intent, but the old tool contract silently accepted fourteen empty selections. One 42-block prune was effective; roughly six force-compactions still followed. |
| [Qwen3.8 27B](runs/qwen-3-8-27b-lemonade.md) | Local Lemonade; `UD-Q8-L-XL` | 5/10 | It made three substantial, deliberate cleanups, then relied on six automatic compactions through the more difficult second half of the task. |
| [Laguna S 2.1](runs/laguna-s-2-1-openrouter.md) | OpenRouter (hosted); full precision | 3/10 | It followed its only hygiene nudge correctly within one second, but the nudge and sixth compaction raced; compaction won by 3 ms. Earlier buildups produced no nudge. |
| [Laguna S 2.1](runs/laguna-s-2-1-ds4.md) | Local ds4 (revived); sigQ8/Q4K, guarded | 3/10 | It attempted curation before capacity pressure. Its block choices were correct, but it supplied a comma-separated string instead of an array and never tried again. |
| [Muse Glimmer 30B](runs/muse-glimmer-30b-lemonade.md) | Local Lemonade; `UD-Q8_K_XL` | 4/10 | It responded well to the hygiene nudge: six incremental prunes reduced use from 71.6% to 16%, avoiding all automatic compactions. It was never proactive, and two prunes removed active repair material. |
| [Qwen 3.8 Flash](runs/qwen-3-8-flash-llamacpp.md) | Local llama.cpp (EngramHalo fork); `AP-Q5_K_XL` + MTP | 7/10 | It was the first model to curate at a work-package boundary well before pressure, used `summarize_context` appropriately, and selected blocks well. Its initiative then declined, and a single automatic compaction degraded both the C++ result and subsequent curation. |
| [GPT-5.6 Terra](runs/gpt-5-6-terra-codex.md) | OpenAI Codex API subscription; `gpt-5.6-terra` | 5/10 | It made proactive cleanups in the initial and final rounds and avoided compaction, but its late first-repair prune discarded the initial task and authoritative requirements. |
| [Qwen 3.8 Max](runs/qwen-3-8-max-venice.md) | Venice (hosted); `qwen-3-8-max` | 5/10 | It made several substantial, mostly well-targeted cleanups and one appropriate summary, but six automatic compactions still interrupted the three rounds. Unlike Qwen 3.8 Flash (7/10), it did not maintain a useful working set for long enough to avoid repeated compaction. |

## Findings

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

## Phase-one conclusion and next phase

The original question had two parts: can models distinguish useful context from
replaceable residue, and will they keep doing so without being forced? Across this
long-task cross-section, most models beyond the weakest tool users made at least
some reasonable keep/prune/summarize choices. Flash curated at a completed work
boundary and summarized worker conclusions; Max preserved its task prompt during
a large prune; Terra sometimes curated early. These examples establish that the
tools can support selective, forward-looking decisions. They do not establish
that every selection was safe: Terra later excluded the original task and
requirements, and Glimmer removed active repair material.

The second part remains unsolved. Initiative was intermittent even in Flash, Max,
and Terra. Warnings prompted useful cleanup in some runs, but other runs reached
repeated automatic compaction despite prompt and tool-hint revisions. A
capacity-triggered, one-shot summary can collapse many independently useful
blocks into a single unselectable history; the Flash repair illustrates the
potential cost of that loss. Its before/after trace is not a controlled causal
test: serving conditions, harness versions, task execution, and interventions
differ across sessions. The pattern is sufficient to choose the next design
question, not to claim a general improvement in downstream task quality.

Repeatedly testing additional models on the same task is unlikely to resolve
that question. Goal-focused post-training is one possible explanation for the
lack of sustained initiative, but the sessions cannot isolate training from the
interface or task. Revised guidance alone has not been evaluated in a controlled
comparison either. The next phase therefore tests a different *mechanism*:
replace automatic summary-based compaction with a hard, harness-led, multi-step
cleanup in which the working model receives a fresh block list, decides what to
keep, prune, or summarize for the work ahead, and resumes only after the retained
context fits. The harness must reserve enough headroom for those decisions and
must protect task-critical state. Manual `/compact` remains available, but the
old automatic compaction must not run as a fallback; an unsafe or ineffective
cleanup stops for explicit intervention. This is a design target, not an outcome
shown by the phase-one runs. The fork's [roadmap](../../../ROADMAP.md) records
this and later training and monitoring-model directions.

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

## Evidence and method

- [Evaluation protocol and harness notes](method.md)
- [Cross-run research notes](research-notes.md)
- [Runnable Pi evaluation harness](../../../packages/evals/README.md)
