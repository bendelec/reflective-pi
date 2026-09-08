# Reflective context management

`rxpi` gives the coding agent awareness of, and limited control over, the
context it sends to the model. The feature is a proof of concept: instead of
waiting for automatic compaction to summarize a full transcript, the model can
maintain a focused working set while it still knows which work comes next.

This page describes the user-visible behavior. For the session-tree projection
that makes it work, see [Context construction](context-building.md). For the
lower-level block and selector implementation, see [Prune implementation](prune.md).

## Goal and operating model

A full context window is not the only problem. Stale investigation, superseded
plans, and obsolete tool output compete with material needed for the next step and
can dilute the model's attention before capacity is exhausted. Output quality often
degrades as context fills past a model-specific point. Maintaining a focused
working set is therefore a quality optimization in its own right, not only a way
to avoid compaction.

The model should keep material likely to help with the next steps or a likely
follow-up. It should exclude material with no remaining value even when capacity
is still ample. The system prompt therefore directs it to assess context at natural
boundaries—after a plan milestone, investigation, refactor, or failure, and before
starting a new topic or work package. Context-window use is a safety signal, not
the normal trigger for this decision.

Three tools support that process:

| Tool | Action | When to use it |
| --- | --- | --- |
| `list_context` | List current atomic blocks and their IDs | Before making a curation decision |
| `prune_context` | Exclude selected blocks | The full block has no likely future value |
| `summarize_context` | Replace selected blocks with summaries | The full block is stale, but its essential result may be needed later |

The agent can only exclude or summarize. It cannot restore its own changes. The
user can review and restore blocks through `/prune`.

## Context-status messages

Between turns, rxpi may append a short system note such as:

```text
[context-status] window 128,000 · used 45,230 (35.3%)
```

These messages are threshold-triggered rather than emitted every turn. A status
message is appended only after a turn that executed tool work, and only when at
least one condition applies:

- no earlier status message has established a baseline;
- context use crossed a 10% boundary since the last status message;
- the completed turn increased context use by more than five percentage points; or
- context use is at or above the **hygiene threshold**.

The hygiene threshold is five percentage points below the automatic-compaction
line, clamped to 50–80%. It therefore remains below the compaction line when
`compaction.reserveTokens` changes. With the default compaction settings it is
80%; a reserve that moves automatic compaction to 75% moves the hygiene threshold
to 70%.

At or above the hygiene threshold, the status message instructs the model to list
context blocks and exclude every block that no longer adds value before continuing
substantive work. This is a last-resort fallback for models that have not curated
at natural boundaries.

A status message is not emitted after a turn with no tool work; doing so would
force an otherwise terminal response into another turn. It is also skipped
immediately after a prune, because that turn's usage figure predates the prune. A
fresh status message is forced on the following turn instead.

Status messages are persisted in the session transcript, rendered distinctly in
the TUI, and sent to the model in the next request. They use the accent style below
70% use and warning style at or above 70%.

## Agent curation workflow

### List blocks first

`list_context` accepts no parameters and changes nothing. It returns the current
atomic blocks, a short preview of each, and the ID to use with the mutating tools.
It ends with an explicit reminder that listing is read-only.

### Exclude blocks that are no longer useful

`prune_context` accepts a non-empty array of block IDs:

```json
{ "ids": ["id1", "id2"] }
```

It excludes each matching block from the next model context. A tool exchange—an
assistant tool-call message and its immediately following results—is always one
block, so a tool call cannot be left without its result or vice versa.

A bare call, an empty array, or a selection with no matching ID fails with an error
that directs the model to `list_context`. If some IDs match and some do not, rxpi
excludes the matching blocks and reports the unknown IDs. The interface deliberately
keeps one verb per tool: a failed mutation cannot look like a successful list or
prune operation.

Exclusion does not delete session history. It changes only the context built for
later model requests.

### Summarize blocks whose result still matters

`summarize_context` also accepts a non-empty ID array. It sends every selected
atomic block independently to a summary model, then replaces the original block
at its original chronological position with the resulting summary. If any summary
request fails, no selected block is changed.

By default, rxpi uses the active agent model. A faster or less expensive model can
be configured for block summaries only:

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

This setting does not change manual or automatic compaction.

## Context changes are reversible

Every curation action is stored as an append-only `PruneEntry` in the session file.
A marker records the target entry and one of three latest-wins states:

- `included` — use the original block (the default);
- `excluded` — omit the original block; or
- `summarized` — omit the original block and insert its stored replacement summary.

The transcript and session tree retain the original entries. When context is built,
rxpi filters excluded entries and substitutes summaries where required. A restored
`included` marker reveals the original block again.

Markers are session-global rather than branch-scoped in this MVP. A change made on
one branch can therefore affect another branch. Do not rely on branch-local pruning
until the planned harness-v2 lane migration provides an explicit branch identity.

## `/prune`: user review and recovery

`/prune` opens a selector over the same atomic blocks used by the agent tools.

- `Space` stages an include/exclude change for the selected block.
- `Enter` commits all staged changes atomically.
- `Escape` or `Ctrl+C` discards staged changes.
- `Ctrl+A` switches between included-only and show-all views.

The show-all view marks excluded blocks as `[pruned]` and summarized blocks as
`[summarized]`. Selecting either and restoring it changes its state to `included`.
The selector can inspect and restore summaries, but cannot create one; use
`summarize_context` for that.

## Post-prune feedback

After `prune_context`, rxpi tracks file reads for the following 15 turns. If the
model rereads a file whose contents occurred in the excluded blocks, it receives a
negative `[prune-accounting]` message; a full clean window produces a positive
verdict. The feature exposes the otherwise invisible cost of removing active
working-set material.

Version one tracks `read` calls and counts paths that were read or edited in the
excluded blocks. It does not yet account for shell-mediated rereads such as `grep`
or `sed`, nor does it cover `summarize_context`. These limits matter when
interpreting evaluation results.

## Planned work

- Show per-block token use or a trustworthy capacity estimate in `list_context`
  and `/prune`.
- Allow users to request summaries from `/prune`.
- Make curation state branch-scoped after the harness-v2 lane migration.

## Implementation map

| Concern | Location |
| --- | --- |
| Status threshold and insertion | `packages/coding-agent/src/core/agent-session.ts` (`_maybeBuildContextStatusMessage`) |
| Context tools | `packages/coding-agent/src/core/agent-session.ts` (`_createListToolDefinition`, `_createPruneToolDefinition`, `_createSummarizeToolDefinition`) |
| Block grouping and previews | `packages/coding-agent/src/core/prune.ts` |
| Context projection and curation state | `packages/coding-agent/src/core/session-manager.ts` |
| Re-acquisition accounting | `packages/coding-agent/src/core/prune-accounting.ts` |
| `/prune` selector | `packages/coding-agent/src/modes/interactive/components/prune-selector.ts` |
| TUI status rendering | `packages/coding-agent/src/modes/interactive/components/context-status-message.ts` |
