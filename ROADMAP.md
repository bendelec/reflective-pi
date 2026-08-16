# Fork Roadmap — reflective-pi (`rxpi`)

Living summary of this fork's state: what's done, what's pending, and where
we're headed. Update as work lands.

## Identity

- Fork of `earendil-works/pi-mono`. Binary renamed `pi` → `rxpi`.
- npm package name unchanged (`@earendil-works/pi-coding-agent`).
- `APP_NAME` stays `"pi"` (drives `PI_*` env vars and the shared `.pi/` dir);
  `BINARY_NAME` is `"rxpi"` (display/process title). See
  `packages/coding-agent/src/config.ts`.

## Completed

- **Context-status messages** — auto-injected context-window usage notes between
  turns (persisted, rendered, sent to the model). Commit `b4c857f50`.
- **Binary rename** `pi` → `rxpi` (same commit).
- **Prune MVP (data structure + `buildContextEntries`)** — `PruneEntry` +
  `PruneState` enum, resolved map, `appendPruneChange`, and the
  `buildContextEntries`/`buildSessionContext` filter. Not yet committed.

## Known gaps (prune follow-ups)

- **`createBranchedSession` (fork/clone)** does not yet filter-and-recreate
  prune entries the way it does labels. Forking a pruned session carries prune
  entries whose `targetId` may dangle. Mirror the label handling.
- **Compaction token estimate** — `compaction.ts` calls the free
  `buildSessionContext(pathEntries)` without a prune map, so compaction
  thresholds don't account for pruned entries. Thread the prune map through
  `compact()`.

## Future work

- **Prune UI/tool** — TUI tree view + agentic self-curation tool to add/remove
  prune markers (atomic groups selected together).
- **Per-group token accounting** — attribute exact token counts to prune groups
  from the server-reported context delta per assistant response, not content
  heuristics (chars/4). Enables smarter prune decisions (group token cost shown
  in the prune UI) and accurate compaction thresholds. Needs care around cache
  accounting, compaction baseline resets, and tokenizer/model-family drift.
  harness-v2's usage ledger (usage rows keyed to entries) already models this,
  so it likely lands naturally on the harness-v2 migration.
- **"summarized" prune state** — per-group mini-compaction: a cheap model
  summarizes a group, a summary card replaces the messages in context. The
  `PruneState` enum already anticipates this.
- **Secondary summarization model config** — a smaller/faster/cheaper model for
  summarization, reused by both the "summarized" state and legacy compaction.
- **harness-v2 migration** — switch the session layer to `AgentHarness` lanes
  (`packages/agent/src/harness/`, spec in `packages/agent/docs/harness.md`).
  Once on lanes, make prune markers branch-scoped by adding a `branchId`.

## Design decisions & limitations

- **Prune markers are append-only entries + a resolved map** (the label pattern),
  not mutable fields on message entries. Keeps crash-safe append-only persistence
  and makes the future "summarized" state additive.
- **`PruneState` is an enum, not a bool** — so "summarized" is a new variant, not
  a type migration.
- **Prune is GLOBAL (not branch-scoped) as the MVP** — a temporary limitation,
  documented in `PruneState` and `packages/coding-agent/docs/context-building.md`.
  Branch-scoping arrives with the harness-v2 lane migration.

## Reference

- Context building (tree → `buildSessionContext` → server): `packages/coding-agent/docs/context-building.md`.
- harness-v2 spec: `packages/agent/docs/harness.md`.
