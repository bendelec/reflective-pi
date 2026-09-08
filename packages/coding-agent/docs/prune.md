# Context curation internals

This is the implementation reference for the context-curation feature. For the
agent and user workflow, see [Reflective context management](reflective-context.md).

## Data model

Curation is reversible because it is represented by append-only markers, not by
mutating or deleting messages.

```ts
PruneState = "included" | "excluded" | "summarized"
PruneEntry { type: "prune", targetId, state, summary? }
```

`PruneEntry` follows the label pattern: session loading resolves the latest marker
for each target. `included` is the default and restores the original block.
`excluded` omits it from model context. `summarized` omits it and inserts the
replacement summary stored on the block's first entry.

`buildContextEntries()` applies compaction truncation on the unfiltered branch
path, then removes excluded and summarized original entries. `buildSessionContext()`
adds a stored summary at the original block position. A pruned compaction entry
still defines the compaction boundary even though its summary is omitted.

Prune state is currently **global to the session**, not scoped to a branch. The
planned harness-v2 lane migration is the point at which markers can gain a
branch identity.

## Atomic blocks

The smallest removable unit is a context block. A normal context-contributing
entry forms a block of one. A tool exchange is atomic:

```text
assistant tool-call message
immediately following tool-result messages
```

Tool results refer to tool-call IDs, so separating either side would produce an
invalid conversation. `groupPruneBlocks()` walks the active context linearly and
absorbs every immediately following tool result into its assistant tool-call block.
Bookkeeping entries, including prune markers, do not form blocks because they do
not contribute messages to the model context.

## Agent tools

`AgentSession` always registers three tools:

| Tool | Contract |
| --- | --- |
| `list_context` | No arguments; lists block IDs and previews; never changes context. |
| `prune_context` | Requires a non-empty `ids` array; excludes matching blocks. |
| `summarize_context` | Requires a non-empty `ids` array; summarizes each matching block independently, then replaces it. |

The mutating tools use a deliberately guided contract. Missing, empty, or wholly
unknown IDs fail and point to `list_context`; partial matches succeed while
reporting unknown IDs. This avoids the old dual-mode `prune_context` behavior in
which a bare call looked like a successful no-op.

The agent can only remove or summarize context. `/prune` is the restoration path.

## `/prune` selector

The selector obtains its source from `buildContextEntriesAll()`: the
compaction-truncated branch without curation filtering. It can therefore show
excluded and summarized blocks as well as included ones.

- The default view contains included blocks only.
- `Ctrl+A` switches to the show-all view.
- `Space` stages an include/exclude change.
- `Enter` writes every staged change as an `appendPruneChange()` call.
- `Escape` or `Ctrl+C` discards staged changes.

The selector restores excluded or summarized blocks by writing `included`. It does
not yet request new summaries.

## Previews

Each block has one single-line identity preview. Multi-message tool-exchange
blocks add indented detail lines. Width determines truncation; the selector is a
table of contents, not a reader.

The preview takes the following form:

```text
user: fix the login bug

assistant: read, edit
  read src/login.ts: "export function login(user, pass) {"
  edit src/login.ts: "if (user == null) throw new Error('missing user')"

assistant: Fixed the login bug by tightening the null check.
```

For tool details, `read` and `bash` identify their result; `write` and `edit`
identify their input. Other tools show their name only. This distinction preserves
the most useful identity signal without displaying full tool output.

## Deferred work

- Attribute reliable token use to each block and expose it in the selector and
  agent listing.
- Allow `/prune` to create summaries.
- Add branch-scoped curation state with harness-v2 lanes.
