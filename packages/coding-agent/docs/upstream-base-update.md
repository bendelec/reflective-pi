# Upstream base update — decision record

Status: agreed direction, not yet executed. Scope: **`reflective-context` (phase 1) only**.
Phase-2 cleanup work is deliberately out of scope until phase 1 is merged, stable and pushed.

## Decision

Merge the fork's base forward to upstream tag **`v0.87.1`** (`f07218c4d`, 2026-09-22) on
`reflective-context`, then cherry-pick selected later fixes on top. Do not merge to
`v0.99.x`, `v1.0.x`, or `upstream/main`.

Measured state at the time of this record (2026-10-03):

- fork base: `9841914c7` (2026-09-05, v0.85.1 era)
- drift: 431 commits behind `upstream/main`, 74 ahead
- `b485fa312` (render-cost fix) is already in the fork as `8dd6f6de1`; do not re-pick it
- dry-run conflicts, `git merge-tree --write-tree reflective-context v0.87.1`: **25**

## Why v0.87.1

It is the last release before upstream's October restructure, and the only candidate that
stops before everything we do not want while still containing the one thing we do.

What it brings, in plain terms:

1. **Canonical `context_edit` entries and `buildSessionProjection`** (`466db0fec`). A standard
   way to record that an earlier entry's *model-visible* content is replaced or omitted, where
   each projected entry keeps a reference to its source entry. This is the same idea as our
   curation states — exclude a block, or replace it with a summary — expressed in upstream's
   vocabulary. Adopting it is what lets **upstream pi honour our curation** when it loads an
   rxpi session, instead of ignoring fork-specific prune markers and overflowing its context.
   This is the main reason to merge at all.
2. **Three weeks of fixes**: 33 `fix(ai)`, 50 `fix(coding-agent)`, 6 `fix(tui)`, 4 `fix(agent)`.
3. **`UsageEntry` and prompt-cache warming** (`c596d09d9`). See decisions below. Note that
   cache-miss diagnostics (`core/cache-stats.ts`, `3f9aa5d10`) are **already in our base** —
   verified: the file exists on `reflective-context` and the commit is an ancestor of it — so
   they are not a merge benefit. The merge does bring upstream's newer `cache-stats.ts`, which
   is aware of warmer entries; it is not in the conflict list, so it merges cleanly.
4. **`packages/durable`**: inert at this tag. See decisions below.
5. Docs refresh for sessions, settings, rpc, packages and index.

What stopping here excludes: the virtual-model rework (`540e174c7`), codemode/MCP
(`8562bcf66`, plus `@earendil-works/pi-codemode` and `quickjs-wasi` as direct dependencies),
image-model infrastructure removal (`a328aa89a`), the client/server port to pi-durable
(`48dd1e2f0`), shrinkwrap removal (`581e7ba78`), and the `tui/box.ts` + `markdown.ts` changes
that would otherwise conflict with the render-cost fix we already took.

## Decisions to apply during the merge

**`UsageEntry` — what it is and is not.** A session-file ledger line for a model call that
produced no assistant message: `{ type: "usage", kind, provider, model, usage, note? }`. At
this tag the only writer is the cache warmer; the only readers are the cost-total helpers
(`usage-totals.ts`, `getUsageCostBreakdown`) so session accounting stays honest.

It is **not** per-block token attribution and does not replace that roadmap item. The raw
material for that item already exists without it: every assistant message carries `usage`, and
`calculateContextTokens(usage) = input + cacheRead + cacheWrite` is the server-reported context
size for that turn, so per-response growth is derivable today. What remains missing is
attributing that growth to individual blocks.

- **D1 — cache warming off by default in this fork.** Warming replays the last prompt with
  `maxTokens: 1` at ~90% of the provider's prompt-cache TTL. That is a real, billable provider
  request; for local inference it is meaningless. It is mode-gated and extension-overridable,
  so default it off and keep the mechanism available. Its `cacheRetention: "none"` guard must
  survive the merge unchanged.
- **D2 — verify cache-miss tracking after the merge.** It is already ours and read-only. The
  merged version recognizes warmer entries, so confirm it reports them and that nothing in the
  fork's own session entries is misread as cache usage.
- **D3 — keep `packages/durable`, do not delete it.** 27 files, nothing outside the package
  imports it, SQLite comes from Node's built-in `node:sqlite` (no npm or native dependency),
  and it does not reach the CLI, the session format, or the compiled binary. Deleting it would
  conflict on every future merge for no runtime gain. Revisit only if it is ever wired into the
  CLI path.
- **D4 — usage totals need no fork-side filtering at this tag.** Phase 1 defines no
  fork-specific `usage` kinds, so upstream's "count every usage entry" behaviour is correct
  here. Any future fork-specific kind must be filtered deliberately; that is tracked with the
  work that introduces it, not here.
- **D5 — representation of curation state (decided).** Verified against
  `v0.87.1` `session-manager.ts`:
  - `context_edit` supports both curation states: `replacement: null` omits the target from
    model context (`:175-180`, `:523`); `replacement: { content }` swaps only its content,
    keeping metadata and the original entry (`:534-538`). Latest edit per target wins, keyed by
    path order (`:551-554`), and `sourceEntry` provenance keeps the original renderable
    (`:556-564`).
  - Omission is honoured for **any** entry type, because the null check precedes the role
    filter (`:523` vs `:526-532`). Replacement is role-filtered to `user`, `assistant`,
    `toolResult`, `custom`, so summarizing a fork-specific `contextStatus` block is fork-only.
  - The write path rejects non-editable roles (`:1372-1378`); extending that list for
    `contextStatus` is a maintained fork divergence.
  - There is **no revert value**: `replacement` is `{ content } | null` only. An extra
    fork field cannot create one, because upstream would still read `null` as "omit" — the
    opposite of restore.
  - Fork-only entry types are inert upstream: `parseSessionEntries` performs no type
    validation (`:355-370`), unknown types yield no messages (`:432`), and only literal
    `context_edit` entries enter the edit map (`:552-553`).

  **Decided:** `context_edit` is the single representation of exclude and summarize, and
  restore is a fork-only cancel marker that our projection applies (the latest marker cancels
  earlier edits for that target; a later edit re-applies) and that upstream ignores.
  Consequence: after a restore, upstream's view keeps the block omitted — a strict subset of
  what we intend, so safe. Rejected alternative: keeping our `prune` entries as a parallel
  representation of exclude/summarize, which duplicates state and can drift. Fallback if
  fork-only entry types are unwanted: restore by re-writing the original content into a new
  `context_edit`, accepting payload duplication. Not recommended: dropping user-facing restore
  entirely, since `/prune` undo is what makes aggressive model-driven curation acceptable.
  Atomicity remains ours either way — `targetId` is a single entry, so a block exclusion emits
  one edit per entry and tool-call/tool-result grouping stays valid by our own checking.

## Conflict inventory (25) and resolution order

Mechanical first — take upstream, re-apply fork wording where needed:

- `packages/coding-agent/CHANGELOG.md` (keep ours; repo rule: no changelog work off `main`)
- `packages/coding-agent/README.md`, `packages/evals/README.md`
- `packages/coding-agent/docs/{index,packages,sessions,settings}.md`
- `pi-test.sh`, `scripts/local-release.mjs`
- `packages/ai/src/image-models.generated.ts` (regenerate rather than merge; never hand-edit)

Semantic, in this order — each is where fork behaviour and upstream behaviour genuinely meet:

1. `packages/coding-agent/src/core/session-manager.ts` — prune entries, context rebuilding,
   `getEntryCount`, versus upstream projection and `context_edit`.
2. `packages/coding-agent/src/core/agent-session.ts` — the three curation tools and their
   context-status hooks versus upstream's projection consumers.
3. `packages/coding-agent/src/core/compaction/compaction.ts` — block summarization sharing
   `completeSummarization` with upstream compaction.
4. `packages/coding-agent/src/core/messages.ts`, `src/core/system-prompt.ts`.
5. `src/modes/interactive/components/footer.ts` (memo already taken), `interactive-mode.ts`,
   `src/cli.ts`, `packages/agent/src/{agent-loop,agent}.ts`.
6. Tests: `test/agent-session-concurrent.test.ts`,
   `test/suite/agent-session-{compaction,prompt}.test.ts`, and the three
   `test/suite/regressions/{2860,3592,8537}-*.test.ts`.

## Execution plan

Bounded slices, each verified before the next. Work on an integration branch cut from
`reflective-context`; keep `backup/reflective-context-pre-base-update` at the pre-merge commit.

1. Merge `v0.87.1`, resolve the mechanical group, leave semantic conflicts marked.
2. Resolve `session-manager.ts`, then `agent-session.ts`, then `compaction.ts`; keep the
   curation tools behaviourally identical (list/prune/summarize, restore via `/prune`).
3. Apply D1–D5. Confirm the warmer's default and that `cacheRetention: "none"` still blocks it.
4. Resolve remaining source, then tests. `npm run check` and `./test.sh` must pass.
5. Add the missing tests below.
6. Build and deploy the binary; smoke test on a real long session: curation tools, `/session`
   totals, footer stats, resume, and one forced-cleanup-free normal turn.
7. Merge phase 1 into phase 2 afterwards, as separate work, and re-verify cleanup there.

## Tests to add

- `session-manager`: projection provenance preserved across `context_edit`, prune summaries,
  compaction and `UsageEntry`; usage and control entries never enter model context.
- `context_edit` targeting user, assistant and custom-message entries (current upstream
  coverage concentrates on tool results).
- Post-merge regression for `agent-session.ts` and `compaction.ts` covering the projection
  resolution from step 2.
- Cache warmer: no warming request and no `usage` entry when the triggering request used
  `cacheRetention: "none"`; warmer disabled by default in fork settings.

## Cherry-pick candidates after the merge

Isolated fixes that land after `v0.87.1` and are worth taking individually:

- `69f0be6f0` Bedrock stale-thinking replay handling
- `3874b3e98` retry "Selected model is at capacity" errors
- `8930b9ec0` ignore empty Mistral deltas
- `c01f687e5` apply model sampling parameters to direct calls (relevant to per-prompt sampling)
- `667fc3dd3` correct Vercel one-hour cache-write pricing
- `eeac84ca9` fail ChatGPT OAuth when the callback port is occupied
- `9b3c19da5` ignore empty `--models` entries
- `c10bfb0d7`, `28eaccb8e` current Cloudflare and Together model IDs
- `ff72faba2` first-message session-file persistence — hand-port after step 2, do not pick
  blindly: it edits `session-manager.ts`

## Out of scope here

MCP/codemode adoption (needs a decision on `quickjs-wasi` and on stateless Streamable HTTP,
which upstream does not implement yet), the virtual-model rework (the fork already has its own
divergent implementation to diff against), durable client/server, and all phase-2 cleanup
interaction — including how fork-specific `usage` kinds must be filtered once they exist.

## Merge progress (in progress, 2026-10-03)

Branch `integration/upstream-v0.87.1`, merge of `v0.87.1` started with `--no-ff --no-commit`.
Backup branch: `backup/reflective-context-pre-base-update` (at `d7f4ce20f`). Recover with
`git merge --abort` or by resetting to the backup.

Done:
- All 25 conflicts resolved and staged; no markers remain. `npm install --ignore-scripts` exit 0.
- `session-manager.ts`: adopted upstream projection; added exported `applyPruneState(projection,
  pruneStateById?, pruneSummaryById?)`; the `buildSessionProjection()` method and the free
  `buildSessionContext(...)` are prune-aware, so callers must not filter twice. Kept the fork's
  `let contextEntries` shape in `buildContextEntries` (upstream's early returns would have
  skipped the trailing prune filter) plus upstream's system-message filtering. Kept fork
  `replacementByDroppedId` in `createBranchedSession` (upstream's `replacementByLabelId` does
  not exist post-merge).
- `compaction.ts`: upstream projection flow won (`estimateProjectedContextTokens`,
  `findProjectedCutPoint`, projected message collection); the projection is now prune-aware via
  `applyPruneState`; both compaction message helpers kept because the fork's raw-entry
  `findCutPoint` path still uses its own.
- `agent-session.ts`: resolved by a delegated worker; upstream projection consumers, routed
  model, cache-warmer wiring and the injected initial system message adopted; fork curation
  tools, prune APIs, context-status hook and block summarization re-applied. Needs review.
- `scripts/coding-agent-consumer.mjs`: `manifest.bin.pi` replaced with all declared bin targets
  (this fork declares only `bin.rxpi`).
- Docs group resolved: upstream content kept, fork sections re-inserted; fork CHANGELOG
  `[Unreleased]` heading restored (the auto-merge had folded fork entries into upstream's
  immutable 0.87.1 section).

Outcome (2026-10-03):

- All 25 conflicts resolved. `npm run check` passes every stage except `tsgo`; `biome`,
  `check:browser-smoke`, shrinkwrap and install-lock validation are clean.
- `./test.sh`: `packages/agent` 935/935 pass. `packages/coding-agent` 2493 pass with 1 failure
  (`model-resolver`). `packages/ai` has 31 test failures and 42 type errors.
- Every remaining `packages/ai` failure is model-catalog drift, not merge damage.
  `src/providers/data/*.json` is not tracked in git (0 files at our base and at `v0.87.1`), so it
  is hydrated from live provider APIs. Hydrating today satisfies the models `v0.87.1` added
  (`grok-4.7`, `gpt-6-astra`) but not tests pinned to models that have since been renamed or
  removed upstream (`moonshotai/Kimi-K2.6`, `kimi-k2p6`, `glm-5p2`, `deepseek-v4-flash-0731`).
  Verified: a pristine `v0.87.1` worktree with the same hydrated data produces exactly the same
  42 type errors, all in `packages/ai` and none anywhere else.

Source fixes applied during the merge:

- `interactive-mode.ts`: re-added the `APP_NAME` import that conflict resolution dropped.
- `block-summarization.ts`: pass a `normalizeContext(...)` transcript, as `v0.87.1`'s branded
  `TranscriptContext` requires.
- `agent-session.ts`: the resume context-status baseline tested `state.messages.length > 0`,
  which is now always true because `v0.87.1` seeds the system prompt as a leading transcript
  message, so it fired on fresh sessions and persisted a spurious `contextStatus` entry. It now
  requires a non-system message.
- `agent-session.ts`: `_buildBoundaryContext` ignores `contextStatus` notes when computing
  `canContinue`. A leftover note made a terminal context look continuable, so an extension's
  `continue: true` forced an extra assistant turn; upstream's `agent-session-boundaries`
  regression caught it.
- `block-summarization.ts`: the output reserve had a hard 2048-token floor, so block
  summarization could never run on a window below roughly 2.1k tokens. It is now window-relative
  (`max(min(2048, 20%), 10%)`). **This bug predates the merge** — it fails identically at
  `d7f4ce20f`, so phase 1 was pushed with it. Cherry-pick the fix back.
- `settings-manager.ts`: D1 applied, `getCacheWarmingMode()` now defaults to `"off"`;
  `docs/settings.md` and upstream's settings test updated to match.

Test adaptations for fork deviations, each commented in place:

- Leading transcript `system` message: `agent-session-prune`, `agent-loop`.
- Persisted `contextStatus` note: `agent-session-bash-persistence`, and
  `9178-tree-during-compaction` (the leaf is the note, so the assertion checks its `parentId` is
  the navigation target, preserving the regression's intent).
- Extra `context_hygiene` prompt section and the three curation tools: `system-prompt-updates`,
  `builtin-tool-strict-mode`.
- Prompt is ~400 tokens larger: `agent-session-boundaries` token bounds, and
  `agent-session-compaction`'s oversized-tool-result model window (2600 -> 4100) so the scenario
  still produces a threshold cut point instead of a spurious overflow.
- `docs/index.md` links this page so the documentation navigation test passes.

- **D6 — curation tools vs exact-list `setActiveTools` (decided: keep upstream semantics).** The
  fork seeds `list_context`/`prune_context`/`summarize_context` into the initial loadout, but
  `setActiveToolsByName` replaces the list exactly, so any explicit loadout change (TUI `/tools`,
  an extension's `setActiveTools`) silently drops the curation tools. Forcing them back in fixes
  that but breaks upstream's `6162-extension-active-tools-next-turn` and
  `builtin-tool-strict-mode` regressions, which pin exact replacement. Kept upstream semantics and
  adapted the two tests instead: in `builtin-tool-strict-mode` the baseline prompt is now captured
  after the first extension bind, which still tests that re-registering identical tools is a
  no-op. The hole is pre-existing (present at `d7f4ce20f`) and is tracked as a separate phase-1
  question. Note that `createAgentSession` always computes an explicit `initialActiveToolNames`,
  so "seed curation only into default loadouts" is not available: it would strip curation from
  every real session, including the TUI.

Remaining:

1. Commit the merge. `package-lock.json` changed, so the commit needs
   `PI_ALLOW_LOCKFILE_CHANGE=1`.
2. Build, deploy locally, smoke test; then merge phase 1 into phase 2 and re-verify the
   forced-cleanup code against the canonical projection (phase 2 predates it).
3. Cherry-pick the block-summarization reserve fix back to phase 1.
4. Decide the D6 follow-up: whether `/tools` and extension `setActiveTools` should preserve the
   curation tools.
