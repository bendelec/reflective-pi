<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://www.npmjs.com/package/@earendil-works/pi-coding-agent"><img alt="npm" src="https://img.shields.io/npm/v/@earendil-works/pi-coding-agent?style=flat-square" /></a>
</p>

# rxpi — reflective-pi

**rxpi** is a focused fork of the Pi agent harness project, including our self extensible coding agent.

## Reflective context management

### Idea:

This fork is intended as a proof of concept for the idea that modern models should be intelligent enough
to be trusted with curating their own context effectively. Traditionally, compaction (summary) is 
backward-looking, not forward-looking. It summarizes the work that was done in the past; it doesn't 
select context based on what work is planned next and what value each piece of context has for that future work.

In interactive sessions, you can often provide additional hints to the compaction prompt
(e.g., /compact keep the research of the pathfinding architecture). But for long-running 
agentic tasks where an agent follows its own plan and the harness causes auto-compaction when context 
pressure reaches a certain point, there is currently little forward-looking optimization. Yet, 
these long-running tasks actually possess the best prerequisites for proactive management: because 
the model follows a structured plan, it knows exactly what work it will do next and precisely which 
parts of its past context remain relevant to that future work.

This PoC attempts to improve this situation by giving the agentic model itself the tools needed to curate 
its own context. Crucially, the injected system prompt encourages the model to manage its environment 
based on value rather than capacity or pressure first. Since a clean context usually results in significantly 
better output quality, it is highly worthwhile to prune context blocks that no longer hold future worth, 
even if immediate capacity pressure is minimal.

We implement two mechanisms to enable this:

* "context-status" messages are injected into the chat at certain points (at least once every 10% of context 
  used, and more frequently in certain high-pressure situations) to allow the model to track the context situation.
* Agent-facing `list_context`, `prune_context`, and `summarize_context` tools let the model inspect, exclude, and summarize stale context blocks.

We also added a /prune TUI command for the user to control context (and to restore blocks the agent model 
erroneously deleted).

### Evaluation Plan

The roadmap is to use this PoC internally for a few weeks across a variety of models with differing competencies. 
This testing window will allow us to evaluate and gather data on which types of models actually benefit from the 
concept, if any.

You can find additional details on the implementation
in [Reflective context management](packages/coding-agent/docs/reflective-context.md).
Current observations are tracked in [Reflective context evaluation results](packages/evals/reflective-context-results.md).

### Future work

Adding manual summary requests to `/prune`. Blocks can now be replaced by concise summaries through the
agent-facing `summarize_context` tool, but the selector currently supports only displaying and restoring them.

Tracking context use for each message during the session and storing it with the session tree, so that the list_context
tool can preview the correct number of tokens gained by pruning each block (better decision making input for the model)

Making the pruning branch-scoped in pi's tree. Current implementation of the tree in pi doesn't have branch labels/tags
but there seems to be some upstream work ongoing on a new session format with explicit branch labels, and my current
plan is to wait for this to arrive. Until then, pruning is session-global, not branch scoped

---

* **[@earendil-works/pi-coding-agent](packages/coding-agent)**: Interactive coding agent CLI
* **[@earendil-works/pi-agent-core](packages/agent)**: Agent runtime with tool calling and state management
* **[@earendil-works/pi-ai](packages/ai)**: Unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

To learn more about Pi:

* [Visit pi.dev](https://pi.dev), the project website with demos
* [Read the documentation](https://pi.dev/docs/latest), but you can also ask the agent to explain itself

## All Packages

| Package | Description |
|---------|-------------|
| **[@earendil-works/pi-telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |

For Slack/chat automation and workflows see [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat).

## Permissions & Containerization

Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it.

If you need stronger boundaries, containerize or sandbox Pi. See [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) for three patterns:

- **Gondolin extension**: keep `pi` and provider auth on the host while routing built-in tools and `!` commands into a local Linux micro-VM.
- **Plain Docker**: run the whole `pi` process in a local container for simple isolation.
- **OpenShell**: run the whole `pi` process in a policy-controlled sandbox.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).  Longer term plans for Pi can also be found in [RFCs](https://rfc.earendil.com/keyword/pi/).

## Development

```bash
npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
npm run build         # Refresh model data, then build all packages
npm run build:offline # Rebuild using existing model data without network access
npm run check         # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (can be run from any directory)
```

## Building standalone binaries from release source

GitHub releases include a versioned source archive covered by the release's `SHA256SUMS` file. Extract it and run the same build script used for the official standalone binaries:

```bash
VERSION="<release-version>"
tar -xzf "pi-${VERSION}-source.tar.gz"
cd "pi-${VERSION}"
./scripts/build-binaries.sh --offline-model-data --platform linux-x64 --out "$PWD/out"
```

The source archive includes the generated provider model data used for the release. `--offline-model-data` builds with that snapshot instead of refreshing it from live provider catalogs. The script still installs dependencies, builds the monorepo, compiles the Bun executable, and stages its runtime assets. Package maintainers who provide dependencies separately can pass `--skip-install --skip-deps`.

## Supply-chain hardening

We treat npm dependency changes as reviewed code changes.

- Direct external dependencies are pinned to exact versions. Internal workspace packages remain version-ranged.
- `.npmrc` sets `save-exact=true` and `min-release-age=2` to avoid same-day dependency releases during npm resolution.
- `package-lock.json` is the dependency ground truth. Pre-commit blocks accidental lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1` is set.
- `npm run check` verifies pinned direct deps, native TypeScript import compatibility, and the generated coding-agent shrinkwrap.
- The published CLI package includes `packages/coding-agent/npm-shrinkwrap.json`, generated from the root lockfile, to pin transitive deps for npm users.
- Release smoke tests use `npm run release:local` to build, pack, and create isolated npm and Bun installs outside the repo before tagging a release.
- Local release installs, documented npm installs, and `pi update --self` use `--ignore-scripts` where supported.
- CI installs with `npm ci --ignore-scripts`, and a scheduled GitHub workflow runs `npm audit --omit=dev` plus `npm audit signatures --omit=dev`.
- Shrinkwrap generation has an explicit allowlist for dependency lifecycle scripts; new lifecycle-script deps fail checks until reviewed.

## Share your OSS coding agent sessions

If you use Pi or other coding agents for open source work, please share your sessions.

Public OSS session data helps improve coding agents with real-world tasks, tool use, failures, and fixes instead of toy benchmarks.

For the full explanation, see [this post on X](https://x.com/badlogicgames/status/2037811643774652911).

To publish sessions, use [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf). Read its README.md for setup instructions. All you need is a Hugging Face account, the Hugging Face CLI, and `pi-share-hf`.

You can also watch [this video](https://x.com/badlogicgames/status/2041151967695634619), where I show how I publish my `pi-mono` sessions.

I regularly publish my own `pi-mono` work sessions here:

- [badlogicgames/pi-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)

## License

MIT

<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>
