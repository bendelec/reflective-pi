<p align="center">
  <img alt="rxpi logo" src="https://pi.dev/logo-auto.svg" width="128">
</p>

# rxpi — reflective-pi

**rxpi** is a focused fork of [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono), the Pi coding agent harness. It keeps upstream Pi's minimal, extensible coding agent and adds **reflective context management**: the ability to *see* what is currently in the model's context window and to *curate* it yourself.

> This is a concise MVP fork, not a reimplementation. Everything that is unchanged from upstream — providers, editing tools, sessions, extensions, skills, packages, the TUI — behaves as documented upstream. The differences are isolated to rxpi's identity/distribution and the context-reflection and pruning features described below.

## What this fork changes

### `rxpi` identity and distribution

The CLI binary is renamed from `pi` to `rxpi`:

- `BINARY_NAME` is `"rxpi"` — process title, usage strings, window title.
- `APP_NAME` stays `"pi"` to keep the existing `PI_*` environment variables (e.g. `PI_CODING_AGENT_DIR`) and the shared `~/.pi/agent/` config directory stable, so existing extensions and installs keep working unmodified.
- Standalone binary release archives are named `rxpi-*` (see `scripts/build-binaries.sh` and `.github/workflows/build-binaries.yml`).

This fork **does not publish to npm**. The npm package name is unchanged upstream (`@earendil-works/pi-coding-agent`), which this fork does not republish. Install and run from source — see [Development](#development).

### Context reflection / status

Between turns, rxpi injects a **context-status message** showing current context-window usage, for example:

```
[context-status] window 128,000 · used 45,230 (35.3%)
```

These messages are persisted to the session file, rendered as a highlighted line in the TUI (accent below 70% usage, warning at 70% and above), and sent to the model so it is aware of its own headroom. See `packages/agent/src/agent-loop.ts` and `packages/coding-agent/src/modes/interactive/components/context-status-message.ts`.

### Reversible context pruning

A lighter-weight alternative to upstream's lossy compaction: **prune specific messages out of the model's context, reversibly, without deleting anything from history**.

- Prune markers are append-only `PruneEntry` records (`type: "prune"`, `targetId`, `state`), resolved into a map at load. State is `"included" | "excluded"`; a `"summarized"` state is anticipated but not implemented.
- The mandatory atomic unit is the **tool exchange**: an assistant message with tool calls plus its immediately-following tool results. Pruning an exchange is all-or-nothing so you never leave a dangling `toolCallId` or unanswered tool calls. Every other message is a block of one.
- Pruning is **reversible** — pruned blocks remain in the tree and the JSONL file and can be restored (toggle their state back).
- **Two entry points:**
  - **`/prune`** — a TUI selector: a linear list of atomic blocks with previews, staged toggling (`Space`), and atomic commit on `Enter` (or abort on `Escape`/`Ctrl+C`). `Ctrl+A` toggles between "included only" and "show all" views so pruned blocks can be restored.
  - **`prune_context` tool** — an always-active tool that lets the model curate its own context (agentic curation): with no arguments it lists current blocks; with `{"ids": [...]}` it marks those blocks excluded. Each matched block is pruned atomically.

See the internals in `packages/coding-agent/src/core/prune.ts`, `packages/coding-agent/docs/prune.md`, and `packages/coding-agent/docs/context-building.md`.

## MVP scope and what is intentionally out of scope

This is a concise MVP. The following are deliberately **not** implemented:

- **Per-block token tracking / previews.** Show exact token counts per prune group from server-reported context deltas. The prune UI uses an interim, deliberately pessimistic `chars/6` heuristic so it never overpromises freed context.
- **"summarized" prune state.** Per-group mini-compaction (a cheap summary card replacing the messages), which the `PruneState` enum already anticipates.
- **Branch-scoped pruning.** Prune markers are currently **global**, not branch-scoped. Branch scoping is deferred to the harness-v2 lane migration.
- **harness-v2 migration.** The interactive CLI still runs on the older `SessionManager` + `AgentSession` path, not the newer `AgentHarness` lanes.

Track the latest state in [ROADMAP.md](ROADMAP.md).

## Upstream relationship, credit, and license

rxpi is a fork of [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono) by [Mario Zechner (badlogic)](https://github.com/badlogicgames). Upstream retains all credit for the underlying Pi agent harness, its providers, tools, TUI, and extension system; this fork adds only the identity/distribution and context-reflection/pruning work summarized above.

Licensed under the [MIT License](LICENSE), copyright Mario Zechner. Upstream Pi is available at [pi.dev](https://pi.dev); its documentation lives in [packages/coding-agent/docs/](packages/coding-agent/docs/).

## What Pi is

For background, rxpi is the same agent harness as upstream Pi: a minimal terminal coding harness you adapt to your workflows rather than the other way around. It runs in four modes — interactive, print/JSON, RPC, and SDK — and ships with the `read`, `write`, `edit`, and `bash` tools, plus skills, prompt templates, extensions, themes, and packages. For full usage documentation, see [packages/coding-agent/README.md](packages/coding-agent/README.md).

The monorepo layout is unchanged from upstream:

| Package | Description |
|---------|-------------|
| **[packages/ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, …) |
| **[packages/agent](packages/agent)** | Agent runtime with tool calling and state management |
| **[packages/coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[packages/tui](packages/tui)** | Terminal UI library with differential rendering |
| **[packages/telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |

## Permissions & containerization

Pi (and therefore rxpi) does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it.

If you need stronger boundaries, containerize or sandbox it. See [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) for three patterns: a Gondolin extension (keep auth on the host while routing tools and `!` commands into a Linux micro-VM), plain Docker, or OpenShell.

## Development

Install and run from source:

```bash
npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
npm run build         # Refresh model data, then build all packages
npm run build:offline # Rebuild using existing model data without network access
npm run check         # Lint, format, and type check
./test.sh             # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh          # Run rxpi from sources (can be run from any directory)
```

## Building standalone binaries from source

`scripts/build-binaries.sh` compiles the `rxpi` Bun binary for each platform and stages its runtime assets, producing versioned `rxpi-*` archives:

```bash
./scripts/build-binaries.sh --offline-model-data --platform linux-x64 --out "$PWD/out"
```

The generated provider model data is refreshed live unless `--offline-model-data` is passed to build from the existing snapshot. Package maintainers who provide dependencies separately can pass `--skip-install --skip-deps`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## License

MIT

<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>
