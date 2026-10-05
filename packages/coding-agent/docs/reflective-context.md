# Reflective context management

`rxpi` gives the coding agent awareness of, and limited control over, the
context it sends to the model. The feature is a proof of concept: instead of
waiting for automatic compaction to summarize a full transcript, the model can
maintain a focused working set while it still knows which work comes next.

This page describes the user-visible behavior. For implementation decisions,
phase-one evidence, and next experiments, see [Reflective-context PoC
status](reflective-context-poc.md). For the session-tree projection that makes
it work, see [Context construction](context-building.md). For the lower-level
block and selector implementation, see [Prune implementation](prune.md).

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

The hygiene threshold is ten percentage points below the automatic-compaction
line, clamped to 50–80%. It therefore remains below the compaction line when
`compaction.reserveTokens` changes. With the default compaction settings it is
77.2%; a reserve that moves automatic compaction to 75% moves the hygiene
threshold to 65%.

At or above the hygiene threshold, the status message instructs the model to list
context blocks before continuing substantive work. It should retain or summarize
decisions and other hard-to-reconstruct state, then prune closed or replaceable
material. This is a last-resort fallback for models that have not curated at
natural boundaries.

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
It ends with an explicit reminder that listing is read-only. Protected recent
blocks remain visible with their real IDs and `[protected: recent]`; select IDs
without that marker for automatic curation.

### Preserve recent actions and results

The agent tools protect the shorter trailing span of **8 visible atomic blocks**
or **approximately 8192 tokens**, rounded to whole blocks. A tool exchange that
crosses the token boundary is protected in full, including a newest block larger
than the token target. This protects recent assistant work and tool results from
an over-aggressive cleanup; it is not a permanent pin for user instructions.

A request containing protected IDs still processes any eligible IDs and reports
which recent blocks it kept. If all matches are protected, the tool returns a
normal explanation—not an error—and encourages a fresh `list_context` selection
of older unprotected blocks. If none are eligible, it says so explicitly. The
protection itself does not require compaction. Eligibility is checked against the
current branch at execution, not frozen when the listing was produced.

Human-operated `/prune` remains an override of this automatic safety guard.

### Exclude blocks that are no longer useful

`prune_context` accepts a non-empty array of block IDs:

```json
{ "ids": ["id1", "id2"] }
```

It excludes each eligible matching block from the next model context. A tool exchange—an
assistant tool-call message and its immediately following results—is always one
block, so a tool call cannot be left without its result or vice versa.

A bare call, an empty array, or a selection with no matching ID fails with an error
that directs the model to `list_context`. If some IDs match and some do not, rxpi
excludes eligible matching blocks and reports unknown and protected IDs. The interface deliberately
keeps one verb per tool: a failed mutation cannot look like a successful list or
prune operation.

Exclusion does not delete session history. It changes only the context built for
later model requests.

### Summarize blocks whose result still matters

`summarize_context` also accepts a non-empty ID array. It sends every selected
eligible atomic block independently to a summary model, then replaces the original block
at its original chronological position with the resulting summary. If any summary
request fails, no selected block is changed. Protected IDs are skipped before
summary requests. If every match is protected, no summary-model/auth lookup occurs.
Protection is checked again before persisting summaries so a block newly protected
while a request was in flight keeps its original content. If a human/SDK edit
changes the source during the request, the stale generated summary is discarded.
Token estimates and summaries use the current projected content. Previously
summarized blocks retain their existing non-selectable behavior, but their visible
replacements still count toward the protected suffix.

For a tool-call block, the summary replaces the assistant tool-call entry and the
following result entries are omitted, preserving an atomic summarized state. The
summary retains the original message role. By default, rxpi uses the active agent
model. A faster or less expensive model can be configured for block summaries only:

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

New curation actions are stored as append-only standard `context_edit` entries.
An exclusion uses `replacement: null`; a summary uses `replacement: { content }`.
Summary edits may carry fork-only `curation: "summary"` metadata so the UI and
curation state can identify summaries. The head summary begins with
`[Summary of previously summarized context block]\n`. The original transcript
entry remains unchanged. `/prune` restoration appends a separate
`context_edit_cancel` entry rather than rewriting the original or encoding restore
as a replacement value. Legacy `prune` entries are still read as a session-global
baseline, but rxpi no longer writes them.

New edits and cancels are scoped by their `id`/`parentId` ancestry. Descendants
inherit the operation and siblings are unaffected; a cancel affects earlier edits
for that target on its path. Existing legacy baseline state remains global until
an active-path edit or cancel supersedes it. A cancel restores the raw original,
not the legacy baseline. Compaction retention is applied to the original branch
first, so restoration cannot recover entries outside the retained range. No
existing file is automatically rewritten.

This is not full behavioral compatibility with upstream pi. Upstream v0.87.1
accepts unknown entry types, but ignores `context_edit_cancel`; its projection
therefore may continue to omit an entry restored in rxpi. It also supports
replacements for a narrower role set than rxpi: replacements of fork-specific
roles such as `contextStatus`, compaction summaries, branch summaries, or bash
messages may be ignored upstream. In particular, do not assume unknown `contextStatus`
messages are safe to send through every upstream model API. Null exclusions have
broader upstream projection support than these fork-specific behaviors.

## `/prune`: user review and recovery

`/prune` opens a selector over the same atomic blocks used by the agent tools.

- `Space` stages an include/exclude change for the selected block.
- `Enter` commits all staged changes atomically.
- `Escape` or `Ctrl+C` discards staged changes.
- `Ctrl+A` switches between included-only and show-all views.

The show-all view marks excluded blocks as `[pruned]` and summarized blocks as
`[summarized]`. Selecting either and restoring it returns the raw original block
by appending cancellation entries. The selector can inspect and restore summaries,
but cannot create one; use `summarize_context` for that.

## Planned work

- Show per-block token use or a trustworthy capacity estimate in `list_context`
  and `/prune`.
- Allow users to request summaries from `/prune`.
- CPU and rendering performance remains open; the footer cherry-pick survived the
  base-update merge, while summarize-leakage hotfix `87588a654` was separate from
  the migration.

## Implementation map

| Concern | Location |
| --- | --- |
| Status threshold and insertion | `packages/coding-agent/src/core/agent-session.ts` (`_maybeBuildContextStatusMessage`) |
| Context tools | `packages/coding-agent/src/core/agent-session.ts` (`_createListToolDefinition`, `_createPruneToolDefinition`, `_createSummarizeToolDefinition`) |
| Block grouping and previews | `packages/coding-agent/src/core/prune.ts` |
| Context projection and curation state | `packages/coding-agent/src/core/session-manager.ts` |
| `/prune` selector | `packages/coding-agent/src/modes/interactive/components/prune-selector.ts` |
| TUI status rendering | `packages/coding-agent/src/modes/interactive/components/context-status-message.ts` |
