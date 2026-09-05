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
  `buildContextEntries`/`buildSessionContext` filter. Shipped.
- **`prune_context` tool** — TUI tree view + agentic self-curation tool to
  add/remove prune markers. Context-status message now uses updated context
  after pruning (fixed agent-loop to pass updated context to
  `getContextStatusMessages`).
- **Context snapshot refresh** — `prepareNextTurnWithContext` now refreshes
  `context.messages` from `agent.state.messages` after each tool call, ensuring
  pruned entries are excluded from the next server request.
- **`createBranchedSession` prune filtering** — fork/clone filters and recreates
  prune entries like labels, including resolved global state from sibling
  branches.
- **Agentic curation tools, one verb each** — `list_context` (read-only
  listing), `prune_context` (strict mutation, fails loudly on missing ids),
  `summarize_context` (block summarization, optional secondary model via
  `reflectiveContext.summarizationModel`). Commits `58a6f47a1`, `2a673a649`.
- **Proactive context hygiene reinforcement** — strengthened system prompt
  treating context hygiene as a quality requirement, plus the mandatory
  fallback instruction at the hygiene threshold. Commit `e4076d0dc`.
- **Derived hygiene threshold** — the `[context-status]` hygiene tier tracks
  the automatic-compaction line (five points below, clamped to [50%, 80%])
  instead of a fixed 80%, so hygiene nudges always precede compaction.
  Commit `367978486`.
- **Bun fetch HTTP timeout fix** — the configured provider timeout is now
  actually applied under Bun. Commit `855638b23`.

## Audit backlog (resolved locally)

Audit findings retained for release verification. Binary release CI remains the
integration check for item 1.

1. ~~**P1: Align release artifact names with `rxpi`.** `scripts/build-binaries.sh`
   ~~emits `rxpi-*` archives, while `.github/workflows/build-binaries.yml` still
   ~~validates and uploads `pi-*`; release CI currently fails at its asset
   checks.~~ **Fixed locally; release CI remains the integration check.**
2. ~~**P1: Never send pruned content to compaction.** `prepareCompaction()` uses
   ~~the prune map for `tokensBefore`, but builds `messagesToSummarize` and
   ~~`turnPrefixMessages` from unfiltered entries. An excluded message is therefore
   ~~sent to the summarization model. Update cut-point/token logic and summary
   ~~inputs consistently; add a regression test.~~ **Fixed with a regression
   test.**
3. ~~**P1: Preserve global prune state when forking a sibling branch.**
   ~~`createBranchedSession()` reconstructs markers only when their original
   ~~`prune` entry is on the selected path. A marker created on another branch is
   ~~absent from the clone, restoring the excluded target. Recreate resolved prune
   ~~states for every target retained in the cloned path; add a sibling-branch
   ~~regression test.~~ **Fixed with a sibling-branch regression test.**
4. ~~**P2: Recognize `rxpi update rxpi` as self-update.** The help text documents
   ~~it, but the parser accepts only `self` and `pi`; `rxpi` is treated as an
   ~~extension source. Add parser coverage.~~ **Fixed with parser coverage.**
5. ~~**P2: Count `contextStatus` messages during compaction estimation.** They are
   ~~persisted and sent to the model, but `estimateTokens()` returns zero for them,
   ~~underestimating context usage and delaying compaction.~~ **Fixed with token
   estimation and cut-point regression tests.**
6. ~~**P2: Repair resume-command test expectations.**
   ~~`test/format-resume-command.test.ts` still expects `APP_NAME` (`pi`) instead
   ~~of the user-facing `BINARY_NAME` (`rxpi`); four assertions fail.~~ **Fixed.**
7. ~~**P2: Update prune documentation.** `docs/prune.md` says the selector and
   ~~agentic tool are planned, and `docs/context-building.md` omits `prune` from
   ~~`SessionEntry` types.~~ **Fixed.**
8. ~~**P2: Rename the transcript-analysis subagent command.**
   ~~`scripts/session-transcripts.ts --analyze` hardcodes `spawn("pi", ...)`, so
   ~~it fails for an `rxpi`-only installation.~~ **Fixed.**

## Future work

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
