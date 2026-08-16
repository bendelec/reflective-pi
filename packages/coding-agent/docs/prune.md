# Prune — context exclusion

Reversible exclusion of specific messages from the LLM context, as a
lighter-weight alternative to legacy compaction.

## Status

- **Data model + `buildContextEntries` filter**: implemented.
- **Atomic grouping + preview**: next.
- **TUI `/prune` command**: planned.
- **Agentic self-curation tool**: planned, after the TUI tool.

## Data model (implemented)

- `PruneState = "included" | "excluded"` (a `"summarized"` state is planned).
- `PruneEntry { type: "prune", targetId, state }` — append-only, latest-wins.
- Resolved into `pruneStateById` in `_buildIndex`, like labels.
- `appendPruneChange(targetId, state)` appends + updates the resolved map.
- `buildContextEntries(..., pruneStateById?)` filters `"excluded"` entries; the
  compaction truncation is still computed on the unfiltered path (a pruned
  compaction entry truncates history but omits its summary).

Prune is currently **GLOBAL** (not branch-scoped). Branch-scoping arrives with
the harness-v2 lane migration (see `ROADMAP.md`).

## Atomic grouping

The mandatory atomic unit is the **tool exchange**: an `assistant` message whose
content contains at least one `toolCall`, plus every immediately-following
`toolResult` message answering those calls. It is atomic in both directions —
pruning the assistant leaves a dangling `toolCallId`, pruning the results leaves
unanswered tool calls.

Everything else is a block of one.

Algorithm (walk the branch linearly):

1. `user` → block `[user]`.
2. `assistant` with tool calls → block `[assistant, ...toolResult]`, absorbing
   every following `toolResult` until the next non-`toolResult` message.
3. `assistant` without tool calls → block `[assistant]`.
4. `toolResult` standalone → never happens (absorbed into step 2).

Positional grouping is sufficient: the agent loop always appends tool results
immediately after their assistant message.

Soft edge cases (note, not enforced in MVP):

- First message must be user/system (Anthropic hard-errors on assistant-first).
- Consecutive user messages (pruning a standalone assistant between two users).

## TUI command

A dedicated `/prune` command (not integrated into `/tree`).

- Linear view of the current branch from the last compaction boundary
  (`buildContextEntries` output).
- Default mode: **included only** (pruning). Toggle to **all** (restoration),
  where pruned items are marked and selectable to restore.
- One command, one selector, two filter states — pruning and restoring are the
  same interaction (toggle prune state), so a second command would duplicate the
  selector for a one-bit filter difference.

The two modes use different entry lists:

- "included" = `buildContextEntries(entries, leafId, byId, pruneStateById)`.
- "all" = `buildContextEntries(entries, leafId, byId)` (no prune map).

## Layout

```
1. user: fix the login bug
2. assistant: read, edit
     read src/login.ts: "export function login(user, pass) {"
     edit src/login.ts: "if (user == null) throw new Error('missing user')"
3. assistant: Fixed the login bug by tightening the null check.
```

- **Preview line** = the block's identity, one line.
- **Indented lines** = individual messages, only for multi-message blocks (tool
  exchanges). A size-1 block *is* its preview line.
- **Blank line** = block separator.

## Preview format

Preview line: `role: <identity>`.

- `user:` + truncated text.
- `assistant:` + truncated text (no tool calls), or the tool names for a tool
  exchange (e.g. `assistant: read, edit`).
- `contextStatus:` / `custom:` / `compaction:` / `branch:` + truncated content.

Indented tool-call line: `toolName args: "first content line"`, where the
content preview source is per-tool:

- **read** → first non-empty line of the **result** (file content).
- **write / edit** → first non-empty line of the **args** (content being written).
- **bash** → first non-empty line of the **result** (output).
- **custom/unknown** → `toolName args`, no content preview.

The read/bash-take-from-result, write/edit-take-from-args split is the key: for
read/bash the identifying content is the output, for write/edit it is the input.

The preview needs the tool call correlated with its result by `toolCallId`.

## Truncation

Everything is single-line, truncated to terminal width minus indent (maximum use
of the line, no fixed short cap). Tool results are clipped aggressively — the
prune list is a table of contents, not a reader.

## Deferred

- **Token count per block** — omitted for now. Interim stopgap: a deliberately
  pessimistic `chars/6` estimate so pruning never overpromises freed context.
  Long-term: server-reported context deltas (see `ROADMAP.md`).
- **"summarized" state** — per-group mini-compaction (summary card replaces the
  messages).
- **Branch-scoping** — `branchId` on prune markers, after harness-v2.
- **Collapse/expand** — always-show (truncated) is fine for the MVP.
