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
curate itself (via the `list_context`, `prune_context`, and `summarize_context`
tools). The goal is relevance and quality —
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

- context is at or above the **hygiene threshold** (reported on every such
  turn while it stays that full, with a mandatory context-hygiene check
  instruction). The threshold is derived from the automatic-compaction line —
  five percentage points below it, clamped to the range [50%, 80%] — so the
  hygiene instruction always arrives before automatic compaction. With
  default compaction settings it is 80%; raising `compaction.reserveTokens`
  lowers both the line and the threshold together (a reserve that compacts at
  75% moves the threshold to 70%);
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
request. The model's system prompt treats context hygiene as a quality
requirement, not merely a capacity concern: stale or redundant context competes
for attention and degrades planning, reasoning, and implementation quality even
when the context window is far from full. The model should therefore assess its
working set at natural boundaries — after a plan milestone, investigation,
refactor, or failure, and before a new topic or work package — then retain only
material likely to help with the planned next steps or likely follow-up.

`[context-status]` figures measure capacity; capacity pressure is a safety
signal rather than the normal hygiene trigger. At or above the hygiene
threshold (see above), the status note adds a mandatory fallback instruction to list blocks with `list_context` and
exclude every block that no longer adds value before continuing substantive
work. This gives models that do not independently curate their context a clear
last-resort action before automatic compaction.

## `list_context` and `prune_context` — the agent curates its own context

The always-available context tools are split by verb: `list_context` inspects,
`prune_context` mutates, `summarize_context` replaces.

### Why one verb per tool

`prune_context` originally had two modes: called with no parameters it listed
the current blocks, and called with `{"ids": [...]}` it excluded them.
Evaluation showed a recurring failure with that dual-mode interface: models
that had used the tool correctly would, later in a session, call it bare or
with an empty ids array and then report that they had successfully pruned the
context. The bare call returned a success-shaped listing, so nothing in the
transcript contradicted that claim.

The interface now follows one principle: **a tool should have one verb.** A
mutating tool must fail loudly when its mutation payload is missing, so misuse
can never read as success. Concretely:

- `list_context` is read-only, takes no parameters, and ends with an explicit
  note that listing changes nothing.
- `prune_context` requires a non-empty `ids` array. A bare call, an empty
  array, or ids that match nothing fail with an error result that points at
  `list_context`, turning misuse into a self-correcting loop:
  call → error → list → call with ids.
- `summarize_context` follows the same rule.

### `list_context`

Called with no parameters, it returns the current context blocks, each with a
short id and a one-line preview, plus a read-only reminder of how to act on
them.

### `prune_context`

Called with `{"ids": ["id1", "id2"]}`, it **excludes** the matched blocks from
context. A tool call and its results are always excluded together. When some
ids match and others do not, the matched blocks are excluded and the unknown
ids are reported; when no id matches, the call fails without changing
anything.

Blocks are the atomic unit of pruning. A **tool exchange** — an assistant
message containing tool calls plus every immediately-following tool result — is
one block, pruned all-or-nothing so a result is never left dangling from its
call. Every other message is a block of one. The id the tools report (and
accept) is the block's *first* entry id.

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

## `summarize_context` — retain the essential part of a block

`summarize_context` is a separate agent tool for blocks whose full text is no
longer useful but whose essential result may matter later. The normal workflow
is to first list current blocks with `list_context`, then call
`summarize_context` with one or more reported IDs. Each selected atomic block is
sent independently to the configured summary model. rxpi appends a
`"summarized"` prune marker for every entry in that block; only the marker for
the block's first entry stores the generated replacement text.

When building the next model context, rxpi omits the original entries and
inserts that replacement text at the block's original chronological position.
A subsequent `"included"` marker restores the original block and suppresses the
replacement. A failed request changes no selected blocks.

Block summarization uses the currently selected agent model by default. To use a
faster or cheaper secondary model instead, configure it in `settings.json`:

```json
{
  "reflectiveContext": {
    "summarizationModel": {
      "provider": "provider-id",
      "model": "model-id"
    }
  }
}
```

This setting affects block summarization only. It does not change Pi's manual
or automatic compaction behavior.

## `/prune` — optional user control

For users who want direct control, `rxpi` also ships a `/prune` command that
opens a selector over the same blocks:

- a linear list of atomic blocks with previews;
- `Space` toggles the selected block's state locally (staged);
- `Enter` commits all staged changes atomically, `Escape`/`Ctrl+C` aborts;
- `Ctrl+A` toggles between "included only" and "show all" views.

The "show all" view is where excluded blocks appear as `[pruned]` and summarized
blocks appear as `[summarized]`. Either can be restored by toggling it back to
`"included"`. The selector does not yet initiate new summaries; it is the
review and restoration interface for agent-generated summaries. This is a
convenience on top of the agentic tools, not the primary mechanism: the model
can curate its context without the user, and the user can review or reverse
that curation here.

## Planned follow-up work

This is a concise MVP. If the initial experiments demonstrate that reflective
context curation improves results, the planned follow-up work is:

- **Per-block token accounting or previews.** The prune UI does not yet show
  token counts per block or estimate freed tokens.
- **Manual summary requests in `/prune`.** The selector can display and restore
  summarized blocks, but cannot yet create them.

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
