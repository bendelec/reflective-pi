# Context construction in pi and rxpi

This page explains how the interactive CLI turns durable session history into the
message list sent to a model. It describes the current `SessionManager` /
`AgentSession` path used by the interactive CLI, not the newer harness-v2 session
layer.

## The two layers

The context path spans two packages:

1. **`packages/agent`** (`@earendil-works/pi-agent-core`) provides the generic,
   in-memory agent loop. `Agent` owns `state.messages`, the system prompt, tools,
   model, and thinking level. `runAgentLoop` / `runLoop` drives turns.
2. **`packages/coding-agent`** provides durable sessions, compaction, extensions,
   and the TUI. `SessionManager` owns the tree and JSONL file; `AgentSession`
   mirrors messages into that tree and rebuilds the in-memory transcript at
   session boundaries.

The durable tree is the source of truth. `agent.state.messages` is a cached
projection that grows during a live run.

## Durable session tree

A `SessionEntry` has an ID, parent ID, timestamp, and type. Context-relevant
entry types include messages, compactions, branch summaries, and custom messages.
State and bookkeeping types include labels, model and thinking-level changes,
session information, and curation markers (`prune`).

`SessionManager` keeps:

- `fileEntries`: all JSONL entries in append order;
- `byId`: the entry lookup map; and
- `leafId`: the active branch tip.

Appending creates an entry whose parent is the current leaf, persists it, and
advances the leaf. Moving the leaf to an earlier entry and appending again creates
a branch; history is never mutated or deleted.

The JSONL file begins with a `session` header. Each later line is one
`SessionEntry`. Loading rebuilds the lookup map and sets the leaf to the final
entry.

## From tree to model context

`SessionManager.buildSessionContext()` returns:

```ts
{ messages, thinkingLevel, model }
```

It performs four distinct operations.

1. **Select the active path.** `buildSessionPath()` walks from the leaf to the
   root and reverses the result.
2. **Recover session settings.** `getSessionContextSettings()` finds the latest
   model and thinking-level changes on that path.
3. **Apply compaction and curation.** `buildContextEntries()` retains the latest
   compaction summary, its retained tail, and all newer entries. It then resolves
   curation markers: excluded entries are omitted, and summarized originals are
   omitted pending replacement.
4. **Project entries to messages.** `buildSessionContext()` converts entries to
   `AgentMessage` values and inserts a stored summary at the original position of
   every summarized block. State markers themselves never become model messages.

The resulting order after compaction is:

```text
[compaction summary, retained tail, messages after compaction]
```

Curation works on this already-compaction-truncated view. A curation marker does
not alter the tree or JSONL history; it changes only the next context projection.

### Curation state

A latest-wins `PruneEntry` records one of three states for a target entry:

| State | Context behavior |
| --- | --- |
| `included` | Keep the original entry; this is the default. |
| `excluded` | Omit the original entry. |
| `summarized` | Omit the original entry and add its stored replacement summary. |

The target is the first entry in an atomic block. For a tool exchange, the same
state is written for the assistant tool-call entry and every following tool result,
so the exchange is omitted or restored as a unit. See
[Context curation internals](prune.md) for block grouping and persistence details.

Compaction truncation is calculated before curation filtering. Thus an excluded
compaction entry still establishes the historical cut, even though its summary is
not sent to the model.

## Live turns are incremental

A common but incorrect mental model is that the tree is rebuilt before every
request. It is rebuilt only at boundaries: session load or resume, compaction,
and tree navigation.

During a live run:

1. `agent.prompt()` creates a context snapshot from `agent.state.messages` plus
   the system prompt and tools.
2. `runAgentLoop` adds user prompts and begins `runLoop`.
3. Each iteration injects pending steering, follow-up, and context-status
   messages, then streams an assistant response.
4. `transformContext()` gives extensions a chance to modify messages.
5. `convertToLlm()` converts `AgentMessage[]` to the provider wire format. Custom
   roles such as `contextStatus`, compaction summaries, and branch summaries are
   sent as user messages.
6. The assistant response and tool results are appended to the live message list.

A successful `prune_context` or `summarize_context` call rebuilds the relevant
projection during that tool turn, so stale entries are absent from the next model
request. It also resets the context-status baseline because the prior usage figure
measured pre-curation context.

## Persistence and compaction

`Agent` emits events as messages start and end. `AgentSession` subscribes to these
events and persists each completed message to `SessionManager`. Custom messages
use the matching custom-entry path. The in-memory transcript and durable tree thus
remain aligned across a normal live run.

When compaction triggers:

1. rxpi appends a `CompactionEntry` with the summary and `firstKeptEntryId`.
2. `buildSessionContext()` projects the tree again, including the compaction
   summary and retained tail.
3. The resulting messages replace `agent.state.messages`.

Automatic compaction therefore replaces the cached transcript with a projection of
the durable source of truth. It does not remove older entries from the session
file.

## The newer harness-v2 session layer

`packages/agent/src/harness/session/` contains a separate, newer tree and storage
implementation used by `packages/evals`. It has its own `Session`, branches and
lanes, JSONL storage, and compaction path. Its design is specified in
`packages/agent/docs/harness.md`.

The interactive CLI continues to use `SessionManager` and `AgentSession`. The
harness-v2 adapter is not yet the interactive CLI's live session path. Similar
function names exist in both systems, so confirm the package before tracing or
changing context behavior.

## Implementation map

| Concern | Location |
| --- | --- |
| Durable tree and JSONL projection | `packages/coding-agent/src/core/session-manager.ts` |
| Active-path traversal | `buildSessionPath()` in `session-manager.ts` |
| Compaction and curation selection | `buildContextEntries()` in `session-manager.ts` |
| Entry-to-message projection | `buildSessionContext()` / `sessionEntryToContextMessages()` in `session-manager.ts` |
| Agent-to-wire conversion | `packages/coding-agent/src/core/messages.ts` (`convertToLlm`) |
| Turn loop | `packages/agent/src/agent-loop.ts` |
| Live transcript | `packages/agent/src/agent.ts` |
| Persistence and context tools | `packages/coding-agent/src/core/agent-session.ts` |
