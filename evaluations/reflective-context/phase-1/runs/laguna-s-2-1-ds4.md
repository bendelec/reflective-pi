# Laguna S 2.1 — local ds4 (revived branch), sigQ8/Q4K, repetition-guarded

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
