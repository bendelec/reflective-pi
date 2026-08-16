# How pi/rxpi builds the context sent to the model each turn

This documents the context-building path used by the **interactive CLI** (`pi` /
`rxpi`). It is the older of two session implementations; see
[The second tree abstraction](#the-second-tree-abstraction) for the newer one.

## Two layers

The system is split across two packages, and this split is the single most
important thing to internalize:

1. **`packages/agent`** (npm `@earendil-works/pi-agent-core`) — a generic,
   session-agnostic agent loop. It works purely with an in-memory
   `AgentMessage[]` and knows nothing about files, trees, or `.jsonl`.
   - `Agent` class (`packages/agent/src/agent.ts`) owns `state.messages`,
     `state.systemPrompt`, `state.tools`, `state.model`, `state.thinkingLevel`.
   - `runAgentLoop` / `runLoop` (`packages/agent/src/agent-loop.ts`) is the turn
     loop.
   - Types `AgentMessage`, `AgentContext`, `AgentLoopConfig` live in
     `packages/agent/src/types.ts`.

2. **`packages/coding-agent`** — the pi/rxpi app layer. Adds durability (the
   tree + `.jsonl` file), compaction, extensions, and the TUI.
   - `SessionManager` (`packages/coding-agent/src/core/session-manager.ts`) is
     the tree + file.
   - `AgentSession` (`packages/coding-agent/src/core/agent-session.ts`) glues the
     two together: it subscribes to `Agent` events, mirrors each message into the
     tree, and rebuilds the in-memory transcript from the tree at
     load/compaction/navigation.

## The tree data structure

The node type is `SessionEntry` (in `session-manager.ts`). Every entry has:

- `type` — `message`, `thinking_level_change`, `model_change`, `compaction`,
  `branch_summary`, `custom`, `custom_message`, `label`, `prune`, `session_info`
- `id` — unique short hex id
- `parentId` — id of the parent entry (`null` for the root)
- `timestamp`

The `type: "message"` entry (`SessionMessageEntry`) wraps one `AgentMessage`
(role + content). `AgentMessage` roles are `user` / `assistant` / `toolResult`,
plus the coding-agent's custom roles (`bashExecution`, `custom`,
`branchSummary`, `compactionSummary`, `contextStatus`) added via declaration
merging in `messages.ts`.

`SessionManager` holds three things in memory:

- `fileEntries: FileEntry[]` — every entry in append order (plus the header).
- `byId: Map<string, SessionEntry>` — id → entry.
- `leafId: string | null` — the current leaf, i.e. which branch we're on.

The tree is append-only. `appendMessage()` creates an entry with
`parentId = leafId`, pushes it, updates `byId`, advances `leafId`, and writes the
line to the `.jsonl` file. `branch(branchFromId)` just moves `leafId` back to an
earlier entry; the next append forks a new branch. Nothing is ever mutated or
deleted.

## The `.jsonl` file

One JSON object per line. Line 1 is the `session` header (`SessionHeader`: type,
version, id, timestamp, cwd, parentSession). Every later line is a
`SessionEntry`. `loadEntriesFromFile` parses line-by-line; `_buildIndex()`
rebuilds `byId` and sets `leafId` to the last entry.

## Building context from the tree

The single entry point is `SessionManager.buildSessionContext()` →
`{ messages, thinkingLevel, model }`. It composes four functions:

1. `buildSessionPath(entries, leafId, byId)` — walks `leafId` → root following
   `parentId`, then reverses to root→leaf order. This is "which branch we're on."
2. `getSessionContextSettings(path)` — scans the path for the latest
   `thinking_level_change`, `model_change`, and assistant message to recover
   `thinkingLevel` and `model`.
3. `buildContextEntries(entries, leafId, byId, pruneStateById)` — the
   compaction-aware truncation:
   - Take the path.
   - Find the **last** `compaction` entry in the path.
   - If none, return the whole path.
   - If found, return `[compaction, ...entries from firstKeptEntryId up to (but
     not including) the compaction entry, ...entries after the compaction entry]`.
   - Result: the compaction summary entry + the "retained tail" (entries kept at
     compaction time) + everything appended since.
   - Finally, filter out entries whose resolved prune state is `"excluded"`.
     The compaction truncation is computed on the unfiltered path: a pruned
     `compaction` entry still truncates history, its summary is merely omitted
     from the result.
4. `sessionEntryToContextMessages(entry)` — projects each entry to zero or more
   `AgentMessage`s:
   - `message` → `[message]`
   - `custom_message` → `[custom message]`
   - `branch_summary` → `[branch summary message]`
   - `compaction` → `[compaction summary message]`
   - `prune` (and other bookkeeping entries) → `[]` — a `prune` entry is a
     marker on a target message, not itself a context message.

Step 3 flat-mapped through step 4 gives the final `messages: AgentMessage[]`.

## Per-turn: what actually goes to the server

Key correction to a common mental model: **the context is not rebuilt from the
tree every turn.**

`buildSessionContext()` runs only at boundaries — session load/resume, after
compaction, and on tree navigation. It produces the `AgentMessage[]` list and
stores it in `agent.state.messages` (e.g. `sdk.ts`:
`agent.state.messages = existingSession.messages`; and after compaction /
`navigateTree` in `agent-session.ts`:
`this.agent.state.messages = sessionContext.messages`).

During a live run, `agent.state.messages` is the live transcript that grows
incrementally. Each turn:

1. `agent.prompt()` → `runPromptMessages()` → `createContextSnapshot()` copies
   `state.messages` (+ systemPrompt + tools) into an `AgentContext`.
2. `runAgentLoop(prompts, context, config, ...)` appends the new prompt(s) to
   `context.messages`.
3. `runLoop` (agent-loop.ts) iterates: inject pending messages (steering +
   context-status), then `streamAssistantResponse`.
4. `streamAssistantResponse`:
   - `config.transformContext(messages)` — optional extension hook
     (`runner.emitContext`).
   - `config.convertToLlm(messages)` — `AgentMessage[]` → `Message[]` (the wire
     format). This is `convertToLlm` in `messages.ts`, wrapped with
     image-blocking in `sdk.ts`. It passes `user` / `assistant` / `toolResult`
     through unchanged and converts the custom roles (`bashExecution`, `custom`,
     `branchSummary`, `compactionSummary`, `contextStatus`) into `user` messages.
   - Build `Context { systemPrompt, messages, tools }`.
   - `streamFunction(model, llmContext, ...)` → sends to the server.
5. Assistant responds → tool calls execute → tool results appended to
   `currentContext.messages` → `prepareNextTurn` (may trigger compaction) →
   `shouldStopAfterTurn` → `getSteeringMessages` + `getContextStatusMessages`
   collected for the next iteration.

## Persistence back to the tree

The `Agent` emits events (`message_start`, `message_end`, …).
`AgentSession._handleAgentEvent` subscribes and, on `message_end`, calls
`sessionManager.appendMessage(event.message)` (or `appendCustomMessageEntry` for
custom messages). So every message that enters the in-memory transcript is
mirrored into the tree and the `.jsonl` file as a new entry.

## Compaction closes the loop

When compaction triggers (`_checkCompaction` / `compact`):

1. `appendCompaction(summary, firstKeptEntryId, tokensBefore, ...)` appends a
   `compaction` entry to the tree.
2. `buildSessionContext()` rebuilds the message list from the tree (now honoring
   the new compaction entry).
3. `agent.state.messages = sessionContext.messages` replaces the in-memory
   transcript with the compacted version.

So: the tree is the durable source of truth; `buildSessionContext()` is the
function that turns "current branch, since last compaction" into the message
list; and `agent.state.messages` is a cached projection of it that grows during a
live run and is rebuilt at boundaries.

## Compaction-aware truncation in detail

`buildContextEntries` walks the root→leaf path and, when a `compaction` entry is
present, keeps only:

- the compaction entry itself (projects to a compaction summary message),
- the entries from `firstKeptEntryId` up to (but not including) the compaction
  entry — the "retained tail" that was kept at compaction time,
- everything after the compaction entry.

Everything before `firstKeptEntryId` is summarized away and omitted from context.
The final message order is therefore:
`[compactionSummary, ...retainedTail, ...post-compaction messages]`.

## The second tree abstraction

There is a **separate, newer** tree implementation in
`packages/agent/src/harness/session/` (`Session`, `SessionTree`, `Entry`,
`findEntriesOnBranch`, `lane` / `branch`, jsonl storage) with its own compaction
in `packages/agent/src/harness/compaction/`.

This is the storage layer of `AgentHarness` ("harness-v2"), a durable runtime
with crash recovery, atomic transactions, lanes, registers, and a usage ledger.
It is specified in `packages/agent/docs/harness.md`.

Status: in-progress migration. It is actively being built and is used by
`packages/evals`; there is a coding-agent adapter at
`packages/coding-agent/src/server/create-harness.ts`, but that adapter is only
referenced by its own test — not yet wired into the interactive CLI or a live
server. The interactive CLI (`pi` / `rxpi`) still runs on the older
`SessionManager` + `AgentSession` path documented above.

It is easy to confuse the two, because both define a `buildSessionContext` and a
`sessionEntryToContextMessages`:

- `packages/agent/src/harness/session/context.ts` — the newer harness-v2 one.
- `packages/coding-agent/src/core/session-manager.ts` — the one the running app
  uses.

## Key functions and where they live

| Concern | File |
| --- | --- |
| Tree node type (`SessionEntry`) | `packages/coding-agent/src/core/session-manager.ts` |
| Tree + file (`SessionManager`) | `packages/coding-agent/src/core/session-manager.ts` |
| Leaf→root path walk (`buildSessionPath`) | `packages/coding-agent/src/core/session-manager.ts` |
| Compaction-aware truncation (`buildContextEntries`) | `packages/coding-agent/src/core/session-manager.ts` |
| Entry → messages (`sessionEntryToContextMessages`) | `packages/coding-agent/src/core/session-manager.ts` |
| Full context (`buildSessionContext`) | `packages/coding-agent/src/core/session-manager.ts` |
| `AgentMessage[]` → wire `Message[]` (`convertToLlm`) | `packages/coding-agent/src/core/messages.ts` |
| Turn loop (`runLoop`, `streamAssistantResponse`) | `packages/agent/src/agent-loop.ts` |
| In-memory transcript (`Agent`, `state.messages`) | `packages/agent/src/agent.ts` |
| Wiring + persistence (`AgentSession`) | `packages/coding-agent/src/core/agent-session.ts` |
| Initial restore from tree | `packages/coding-agent/src/core/sdk.ts` |
