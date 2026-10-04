---
name: context-curation
description: Curate context in the reflective-pi fork after completed work slices, before switching tasks, and after a mistaken prune. Decide what to keep, summarize, or exclude for the work ahead.
---

# Context curation (reflective-pi)

Sessions here run for days and mix several concerns: fork development, upstream
base updates, deployment and smoke tests, and investigations of other projects
that use this harness. Curate at every work-slice boundary, not when the window
fills. Record durable results in project files first; a session summary is no
substitute for a verified artifact.

Use `list_context` for atomic blocks and IDs. Previews are reminders, not
evidence that an uncertain block is safe to remove. A tool call and its results
are one block and are judged together.

- **Keep** exact wording and evidence the active task needs: applicable user
  requirements and corrections, unresolved findings, and the result the next
  step relies on. Retain user messages by preference, but a superseded request
  may be summarized or excluded when no applicable constraint is lost.
- **Summarize** what may matter later but serves equally well in shorter form.
  Preserve decisions, outcomes, uncertainty, paths, and open questions. Never
  promote an unverified claim to a fact.
- **Exclude** blocks with no forward value, or content safely available
  elsewhere. In this repo that usually means: resolutions and diffs (in git),
  decisions (in `packages/coding-agent/docs/*.md`), session forensics
  (re-derivable from `~/.pi/agent/sessions/*.jsonl`), and subagent transcripts
  (in the child's own session file).

Work-slice boundaries worth acting on: a merge wave finished, a subagent report
received, a decision record updated, a deploy/verify cycle closed, a topic
handed to another session, an investigation concluded.

Examples from this repo:

- A decision is written into `docs/upstream-base-update.md` and staged. Exclude
  the investigation that produced it; keep the decision text if the next step
  still depends on its exact wording.
- A delegated worker returns a conflict-resolution report. Keep its findings and
  open questions; exclude the raw conflict dumps it was built from.
- An unrelated project (GuFo, vectorwalker) is handed back to its own session.
  Exclude the whole investigation, keeping only the outcome and where it was
  recorded.

Do not remove the only copy of a needed result — in particular, keep an
outstanding error or verification list until the items are fixed or recorded.
Curation changes model context, not session history; the user can restore
mistakes with `/prune`.

## Project lessons

- **2026-10-03 — cite metrics, never extrapolate them.** I reported context use
  as 78%, 81%, 86% and 89% across several turns with no measurement behind any
  of them; the TUI showed 63%. Rule: state context usage, throughput, or any
  other measured quantity only by quoting the most recent `[context-status]`
  line or a fresh measurement from this turn. Without one, say "not measured".
- **2026-10-03 — 556 blocks resident at 60% window use.** Closed topics (GuFo,
  session forensics, render-cost study, two audits) had accumulated for days
  because curation only happened when the harness injected pressure. Rule:
  curate when a topic closes, and treat "the durable record is written and
  staged" as the signal to exclude the material behind it.
- **2026-10-03 — pruning is cheap compared with re-reading.** Excluding 538
  blocks cost one listing and two calls; the underlying files, commits and
  session logs remained readable on demand.
