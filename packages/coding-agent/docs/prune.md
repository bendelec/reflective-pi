# Context curation internals

This is the implementation reference for the context-curation feature. For the
agent and user workflow, see [Reflective context management](reflective-context.md).

## Data model

Curation is reversible because it is represented by append-only session entries,
not by mutating or deleting messages.

```ts
type PruneState = "included" | "excluded" | "summarized"
ContextEditEntry { type: "context_edit", targetId, replacement, curation? }
ContextEditCancelEntry { type: "context_edit_cancel", targetId }
```

New curation writes use the standard `context_edit` entry: `replacement: null`
excludes a target, while `replacement: { content }` replaces its model-visible
content. Summary edits may include the fork-only metadata `curation: "summary"`.
This metadata marks summarized state, including summaries whose text happens to
match original content; it is not needed to project the replacement itself. The
projected message retains the original role for ordinary messages and custom entries.
Bash and explicit system-message summaries use a custom summary message instead;
compaction-summary replacement preserves its system checkpoint. Summary text for
the head entry begins
with `[Summary of previously summarized context block]\n`. Tool-call blocks are
atomic, so summarizing one writes a replacement on the head and excludes its tool
result tail entries; the omitted tails may be marked `curation: "summary"` as
well.

Restoration writes a separate fork-only `context_edit_cancel` entry containing
`targetId`, its own `id`, `parentId`, and `timestamp`. It cancels earlier edits for
the target on the active ancestry; a later edit can apply again. This is not a
replacement enum value. Upstream v0.87.1 accepts unknown entry types but does not
project or act on this cancel entry, so upstream may continue to omit a restored
target. This is soft compatibility, not full behavioral compatibility.

New edits and cancels are branch-local: an operation applies only if its entry is
on the active `id`/`parentId` ancestry. Descendants inherit it and sibling
branches are unaffected. Existing legacy `prune` entries are still read as a
session-global, latest-wins baseline; active-path edits and cancels override that
baseline. Cancel restores the raw original, not a legacy baseline state. There is
no automatic rewrite of existing session files.

`SessionManager.appendContextChange(targetId, state, summary?)` writes one new
operation; `appendContextChanges(...)` validates a complete batch before writing
any markers. `PruneState` (`included`, `excluded`, `summarized`) remains the
presentation model used by tools and `/prune`; the legacy `PruneEntry` reader
exists to load old session files, not as the new writer. `/fork` and `/clone`
extract the selected path and carry its legacy baseline; CLI `--fork` copies the
full entry tree unchanged.

The context projection resolves legacy baseline and active-path operations into
one effective map/projection. It does not layer a prune filter over a separately
built canonical projection. Compaction retention is applied to the original
branch first. Restoring a target cannot recover entries already outside that
retained range.

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
Bookkeeping entries, including curation edits and cancels, do not form blocks
because they do not contribute messages to model context.

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

The agent can only exclude or summarize context. `/prune` is the restoration path.

## `/prune` selector

The selector obtains its source from `buildContextEntriesAll()`: the
compaction-truncated branch without curation filtering. It can therefore show
excluded and summarized blocks as well as included ones.

- The default view contains included blocks only.
- `Ctrl+A` switches to the show-all view.
- `Space` stages an include/exclude change.
- `Enter` persists staged changes through prevalidated curation batches.
- `Escape` or `Ctrl+C` discards staged changes.

The selector restores excluded or summarized blocks by writing `included`, which
persists a cancel operation. It does not yet request new summaries.

## Previews

Each block has one single-line identity preview. Multi-message tool-exchange
blocks add indented detail lines. Width determines truncation; the selector is a
table of contents, not a reader.

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
