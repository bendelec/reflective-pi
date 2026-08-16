# Reflective context management

This document describes how `rxpi` (`reflective-pi`) gives the coding agent
explicit awareness of, and proactive control over, its own context window.

## Motivation

An LLM sees only what its context window contains, and quality degrades as that
window fills with stale or irrelevant content. Upstream Pi manages this
reactively: the harness compacts context when it crosses a threshold or
overflows, and the user can trigger compaction manually.

`rxpi` adds a second, agentic lever. It treats context as a curated working
set that the model is made aware of (via `[context-status]` messages) and can
curate itself (via the `prune_context` tool). The goal is relevance and quality —
retain what still has value for the work at hand, exclude what is completed,
stale, or superseded — rather than relying only on user- or harness-driven
compaction after the fact.

## `[context-status]` messages

Between turns, the harness may inject a short system note reporting current
context-window usage:

```
[context-status] window 128,000 · used 45,230 (35.3%)
```

These messages are **threshold-triggered, not inserted every turn**. A message
is emitted only after a turn that actually executed tool work finished, and only
when at least one of the following holds:

- context is at least **80%** full (reported on every such turn while it stays
  that full);
- the usage percentage crossed a **10% multiple** since the last message (e.g.
  20% → 30%);
- the just-finished turn grew context usage by more than **5 percentage
  points**;
- no status message has been emitted yet (establishing a baseline).

A status message is *not* emitted after a turn that did no tool work, because
that would force an otherwise-terminal response into an extra turn. It is also
skipped on the turn immediately after a prune, because the usage figures are
stale (measured before the prune); a fresh message is forced on the following
turn instead.

A status message is an ordinary message: it is appended to the transcript,
persisted to the session file, rendered as a highlighted line in the TUI (accent
below 70% usage, warning at 70% and above), and sent to the model on the next
request. The model's system prompt frames context as its working set: it keeps
information likely to matter for work ahead and, after completing a task or
changing direction, excludes reads, explorations, tool results, and attempts
that no longer inform the next steps. It does this before capacity is scarce,
because context quality depends on relevance rather than remaining token space.
When following a plan, it retains material needed for the remaining steps; in
open-ended interactive work, it uses judgment about likely follow-up. The
`[context-status]` figures measure capacity; they do not determine when to
prune. Curation is based on the value of the content.

## `prune_context` — the agent curates its own context

The central feature is the always-available `prune_context` tool, which lets the
model reduce its own context deliberately. It has two modes:

- **List** — called with no parameters, it returns the current context blocks,
  each with a short id and a one-line preview.
- **Prune** — called with `{"ids": ["id1", "id2"]}`, it **excludes** the matched
  blocks from context.

Blocks are the atomic unit of pruning. A **tool exchange** — an assistant
message containing tool calls plus every immediately-following tool result — is
one block, pruned all-or-nothing so a result is never left dangling from its
call. Every other message is a block of one. The id the tool reports (and
accepts) is the block's *first* entry id.

Unknown ids are reported and ignored; each matched block is excluded atomically.
Exclusion is all the tool does — `prune_context` has no restore/reverse mode.

## How exclusion works — context vs. history

Pruning changes the **model's context without touching session history**.

- A prune is recorded as an append-only `PruneEntry` (`type: "prune"`,
  `targetId`, `state: "included" | "excluded"`), following the same
  latest-wins pattern as labels. These entries are never mutated or deleted.
- When context is built for the model, excluded entries are filtered out of the
  message list. The tree and the `.jsonl` session file are unchanged: every
  message is still there, just omitted from what the model sees next.

So pruning never loses information; it only narrows the context window the model
operates in. The agent tool only ever *excludes*. Restoring a block (flipping
its state back to `"included"`) is done from the `/prune` TUI, not by the agent
tool (see below).

## `/prune` — optional user control

For users who want direct control, `rxpi` also ships a `/prune` command that
opens a selector over the same blocks:

- a linear list of atomic blocks with previews;
- `Space` toggles the selected block's state locally (staged);
- `Enter` commits all staged changes atomically, `Escape`/`Ctrl+C` aborts;
- `Ctrl+A` toggles between "included only" and "show all" views.

The "show all" view is where pruned blocks appear (marked `[pruned]`) and can be
restored — toggled back to `"included"` — since the same selector stages changes
in both directions. This is a convenience on top of the agentic tool, not the
primary mechanism: the model can curate its context without the user, and the
user can review or reverse that curation here.

## Planned follow-up work

This is a concise MVP. If the initial experiments demonstrate that reflective
context curation improves results, the planned follow-up work is:

- **Per-block token accounting or previews.** The prune UI does not yet show
  token counts per block or estimate freed tokens.
- **A `"summarized"` prune state.** A pruned block is currently either excluded
  or included; there is no mini-summary replacement yet.

Per-turn status insertion is not planned. Threshold-triggered status messages
are intentional: they provide useful awareness without creating noise or forcing
unnecessary follow-up turns.

## Where it lives

- Threshold/trigger logic: `packages/coding-agent/src/core/agent-session.ts`
  (`_maybeBuildContextStatusMessage`).
- Tool definition: `packages/coding-agent/src/core/agent-session.ts`
  (`_createPruneToolDefinition`).
- Block grouping + previews: `packages/coding-agent/src/core/prune.ts`.
- Context filtering: `packages/coding-agent/src/core/session-manager.ts`
  (`buildContextEntries`).
- TUI selector: `packages/coding-agent/src/modes/interactive/components/prune-selector.ts`.
- TUI rendering of status notes:
  `packages/coding-agent/src/modes/interactive/components/context-status-message.ts`.
