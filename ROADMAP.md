# Reflective-pi roadmap

This is the implementation status and follow-up roadmap for the reflective-context
proof of concept. Evaluation evidence and model grades live in
[the evaluation report](packages/evals/reflective-context-results.md).

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
  derived hygiene threshold tracks automatic compaction: five percentage points
  below its line, clamped to 50–80%.
- **One-action curation tools** separate read-only `list_context` from mutating
  `prune_context` and `summarize_context`. A missing mutation payload fails
  explicitly rather than looking like a successful no-op.
- **Proactive-hygiene guidance** instructs the model to curate for future value at
  work-package boundaries, not only under capacity pressure.
- **Block summaries** are implemented. `summarize_context` can use the active
  model or an optional `reflectiveContext.summarizationModel`.
- **Post-prune accounting** reports whether files represented in excluded blocks
  are reread during the following 15 turns.

### Durable and user-controlled state

- **Append-only markers** implement `included`, `excluded`, and `summarized`
  curation states without deleting session history.
- **Atomic blocks** keep a tool call and its results together.
- **`/prune`** lets users inspect, exclude, and restore atomic blocks. It can show
  and restore summaries, but cannot yet request one.
- **Context refresh after a curation turn** ensures that the next request and the
  compaction check use the pruned context rather than a stale pre-prune estimate.
- **Fork and clone handling** preserves resolved global curation state for retained
  entries, including state inherited from sibling branches.

### Supporting fixes

- Compaction does not send excluded entries to its summary model.
- Context-status messages count toward compaction estimation.
- The `rxpi` binary name is used consistently by self-update, transcript analysis,
  release artifacts, and related tests.
- Bun applies the configured provider HTTP timeout.

## Follow-up work

### Product and implementation

1. **Per-block token accounting.** Attribute server-reported context use to blocks
   instead of estimating from characters. Surface that information in
   `list_context` and `/prune` so models and users can weigh relevance against
   actual recovered capacity. Cache accounting, compaction baseline resets, and
   tokenizer differences require care. Harness-v2's usage ledger already models
   the relevant data.
2. **Manual summary requests in `/prune`.** The selector should be able to request
   a summary, not only display and restore agent-created ones.
3. **Branch-scoped curation.** Curation markers are session-global until the
   harness-v2 lane migration can attach an explicit branch identity.

### Evaluation-led design questions

The current results motivate, but do not yet commit the project to, further work on:

- status messages timed to work-package boundaries rather than only capacity
  thresholds;
- post-compaction contexts made of topical, selectable summaries instead of a
  single monolithic project-history summary;
- more salient placement and wording for curation feedback; and
- bash-aware re-acquisition accounting and accounting for summarized blocks.

These are hypotheses to evaluate across further sessions, not settled design
requirements.

## Current limitations and decisions

- Curation markers are append-only and latest-wins, following the durable label
  pattern. This keeps persistence crash-safe and makes restoration additive.
- `PruneState` is a three-state value rather than a Boolean so exclusion and
  summary replacement share one reversible mechanism.
- Curation is **session-global** in the MVP. Navigating to another branch does not
  make prior exclusions branch-local.
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
- [Harness-v2 specification](packages/agent/docs/harness.md).
