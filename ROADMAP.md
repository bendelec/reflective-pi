# Reflective-pi roadmap

This is the fork's own roadmap, not an inherited upstream Pi roadmap. The first
reflective-context evaluation phase is complete; evidence and model grades live in
[the phase-one evaluation archive](evaluations/reflective-context/phase-1/README.md).
The next implementation target is described below.

## Identity

- This is a fork of `earendil-works/pi-mono` whose binary is named `rxpi`.
- Source metadata retains the inherited npm package name
  `@earendil-works/pi-coding-agent`, but rxpi is **not published to npm**. The
  fork does not control that npm identity and is distributed through GitHub
  releases.
- `APP_NAME` remains `pi`, preserving `PI_*` environment variables and the shared
  `.pi/` directory. `BINARY_NAME` is `rxpi` and controls user-facing display and
  process title.

## Implemented

### Model-led context curation

- **Context-status messages** report context use between eligible turns. The
  derived hygiene threshold tracks automatic compaction: ten percentage points
  below its line, clamped to 50–80%.
- **One-action curation tools** separate read-only `list_context` from mutating
  `prune_context` and `summarize_context`. A missing mutation payload fails
  explicitly rather than looking like a successful no-op.
- **Proactive-hygiene guidance** instructs the model to curate for future value at
  work-package boundaries, not only under capacity pressure.
- **Block summaries** are implemented. `summarize_context` can use the active
  model or an optional `reflectiveContext.summarizationModel`.
- **Recent-action protection** prevents agent tools from pruning or summarizing
  the shorter trailing span of 8 visible blocks or approximately 8192 tokens,
  rounded to whole atomic blocks. Listings retain IDs and mark protected blocks;
  mutations process eligible IDs and report protected skips without a tool error.
  Human `/prune` remains an override.
- **Post-prune accounting feedback** was tested and then removed: re-reading
  replaceable files is not itself a curation failure.

### Durable and user-controlled state

- **Append-only markers** implement `included`, `excluded`, and `summarized`
  curation states without deleting session history.
- **Atomic blocks** keep a tool call and its results together.
- **`/prune`** lets users inspect, exclude, and restore atomic blocks. It can show
  and restore summaries, but cannot yet request one.
- **Context refresh after a curation turn** ensures that the next request and the
  compaction check use the pruned context rather than a stale pre-prune estimate.
- **Branch-scoped curation** uses path-local `context_edit` and cancellation entries.
  Descendants inherit changes; siblings are unaffected. Legacy `prune` markers remain
  a session-global baseline and are read for compatibility; existing files are not
  automatically rewritten.
- **Fork and clone handling** preserves path-local curation and the legacy global
  baseline for retained targets. `/fork` and `/clone` extract a selected path;
  CLI `--fork` copies the full session tree.

### Supporting fixes

- Compaction does not send excluded entries to its summary model.
- Context-status messages count toward compaction estimation.
- The `rxpi` binary name is used consistently by self-update, transcript analysis,
  release artifacts, and related tests.
- Bun applies the configured provider HTTP timeout.

## Next phases (planned order)

1. **Replace automatic compaction with hard, harness-led cleanup.** At the
   automatic capacity boundary, pause the working model's task, supply a fresh
   block inventory without requiring `list_context`, and require a bounded series
   of keep/prune/summarize decisions before resuming. Reserve room to perform the
   cleanup; if it cannot finish safely or fit the context, stop and request user
   intervention. Do not fall back to automatic summary compaction. Keep manual
   `/compact` unchanged. This is planned work, not an implemented feature.
2. **Investigate training initiative.** If the forced process works, use its
   decision points and reviewed session examples to explore adapting a capable,
   affordable smaller model (potentially with a LoRA) to curate at natural work
   boundaries without being forced. Hold out entire tasks and sessions for
   evaluation; method and model are not yet selected.
3. **Explore a monitoring model.** Test a separate, cheaper model that follows the
   working session, notices finished work packages and other process risks, and
   can request a pause or prepare candidate summaries. This is a larger harness
   design, not an implementation commitment for the current Pi fork.

These are sequential research priorities, not a promise to pursue all three if
an earlier phase changes the evidence.

### Other deferred product work

- Attribute usable per-block capacity more reliably in `list_context` and
  `/prune`; server-reported context use cannot simply be divided among blocks.
- Let users request summaries from `/prune`, not only inspect and restore them.
- Explore structured, selectable summaries for cases where manual `/compact` is
  used; do not reintroduce automatic summarization as a fallback.

Bash-aware re-acquisition counts and further wording-only hint experiments are
not current priorities: rereading replaceable files is not a demonstrated loss,
and more hints have not made initiative reliable.

## Current limitations and decisions

- Curation changes are append-only. New writes use standard `context_edit` entries
  for exclusion or replacement, and a fork-only `context_edit_cancel` for restoration.
  `PruneState` remains a three-state presentation model; legacy `prune` entries are
  read as a session-global baseline, while new operations are branch-local by
  `id`/`parentId` ancestry. Cancellation restores raw originals rather than falling
  back to the legacy baseline. Compaction retention still bounds what restoration
  can recover.
- Upstream v0.87.1 accepts unknown entry types but ignores cancellation entries;
  replacement support is also narrower than rxpi's. Session compatibility is
  therefore soft, not full behavioral compatibility.
- Per-turn context-status insertion is intentionally out of scope. Threshold-based
  messages provide awareness without adding noise or forcing terminal responses
  into extra turns.

## References

- [Reflective context management](packages/coding-agent/docs/reflective-context.md)
  — user and agent behavior.
- [Context construction](packages/coding-agent/docs/context-building.md) — tree,
  projection, compaction, and curation state.
- [Context curation internals](packages/coding-agent/docs/prune.md) — atomic
  blocks, previews, selector, and accounting.
