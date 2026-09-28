# Phase-one evaluation method and harness notes

## Evaluation conditions

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
[research-notes.md](research-notes.md).
The current notes cover a severe over-pruning incident and the
prune-manifest-as-memory finding.

## Interface change during the series — 2026-09-01

`prune_context` originally combined two actions: no arguments listed blocks, while
an `ids` argument excluded them. Several models called it without arguments and
then reported that they had pruned successfully. The result looked successful even
though it had only listed blocks.

The interface was split into read-only `list_context` and strictly mutating
`prune_context`. The latter now fails loudly when IDs are missing. Evaluations that
began before the change are not directly comparable with later ones. The locally
served Laguna S 2.1 evaluation was interrupted during this transition and continued
under the new contract; its transcript includes both interfaces.

## Context-status behavior around compaction — 2026-09-03

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

## Mechanical session accounting — 2026-09-03

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
