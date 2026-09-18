# rxpi — reflective-pi

**rxpi** is a proof of concept implementation for autonomous context curation 
implemented within a fork of the well known Pi agent harness project by Mario
Zechner / Earendil Works.

## Reflective context management

### The observation

Having done post-mortem analysis on dozens of long-running software development 
sessions with less than ideal outcome, two patterns clearly emerged:

1. Output quality tended to degrade as the context window filled up. Stale
information kept within the context would result in attention dilution and the
resulting degradation of output was strong enough to be subjectively observable
across a sufficiently large set of example sessions.

2. Harness induced (automatically triggered) compactions could often be identified
as inflection points in the sessions. Sessions would progress well towards the
goal until a specific compaction event, then would start drifting in a wrong direction.
Taking a closer look at the generated summary would sometimes tell the story: The
summary would give a lot of room to local one-off decisions without future impact
but then cut away important findings and strategic decisions in other places.

In interactive sessions, the user can control when to compact, and often steer the
compaction by adjusting the compaction prompt. In long-running unobserved sessions
where the model follows a plan or specification, this is not possible. The
harness will enforce compaction at a pre-defined tigger point (e.g. 60% context 
window), and the agent will get whatever summary the generic compaction prompt
happens to generate.

### The idea

There are, of course, various approaches to fix these issues. In a well set up project, 
hierarchical AGENT.md, project structure, specs, architecture and a working plan 
provide a clear enough picture to an agent to reorient itself at any given time. Many
of the observed failures were just as much proof of insufficient project setup
than of any inherent problem with compaction.

Nevertheless, the way compaction works in most harnesses at the moment is in 
principle backward oriented: compaction summarizes *the work done so far*. 
Long-running agents should be well placed to do better. When they follow a plan,
they know what they will do next. They can select material according to its value to 
the tasks coming up next, and filter out completed investigations, superseded 
output and other material that no longer supports that work.

If given apropriate tools, recent models should have the meta-cognitive ability
to keep their own context focused and foward looking, actively curating it as
a function of quality and value, not of capacity.
 
### The mechanism

The harness provides three core tools to the model:
- `list_context` provides the model with a list of message groups currently in 
the context
- `prune_context` lets the model exclude blocks with no remaining value from 
the context completely
- `summarize_context` lets the model replace valuable blocks with concise summaries

An injection into the system prompt encourages the model to curate its own context,
mentioning the penalty of attention diluation and recommending a forward-looking,
quality based approach to context hygiene over a capacity-pressure based approach.

In addition, treshold-triggered `[context-status]` messages report context window use
to the model and provides mandatory fallback instruction under high pressure.

The TUI includes a "/prune" command for the user that allows manual pruning, but 
also restoration of messages in case valuable material was erroneously removed.

See [Reflective context management](packages/coding-agent/docs/reflective-context.md)
for more details on the reflective context curation mechanism and [Context construction](packages/coding-agent/docs/context-building.md) for the underlying session behavior.

### Evaluation

In addition to using the rxpi PoC during my own work on a C++ based game, I attempted
a more structural approach to evaluating if and how various models pick up
on the concept.

I designed A standard task that I intended to exceed a 128k context window several
times over, and run that same task with several different models, each limited to the
128k context. Once the models were finished, I analyzed if they showed initiative in
managing their context or if they ignored it and the harness fell back on automatic
compaction. If they used the tool, I also evaluated the model's selection of what
context to prune and what to keep, and their reasoning process, if available.

This is an inherently subjective process, but I tried to keep it as objective as possible.
I used AI agents to help me disect and analyze the sessions effectively.

### Result summary

Overall, the results so far are a mixed bag. 

On the plus side, all but the weakest models have proven that they are able to 
competently use the tools provided to curate their own context, and that they are able
to make good decisions on what context to keep and what to prune. I have also
collected a certain amount of anecdotal evidence both during the evaluation (e.g. Qwen
3.8 flash max session) and during work on my game project, that sessions where the model
actively curated their own context and kept it focused did provide, on average, better 
results and less drift than sessions that fell back on automated compaction.

On the negative side, all evaluated projects showed very little initiative to pro-actively
curate their context before capacity pressure caused increasingly urgent warning prompts
to be injected. Many models ignored the provided tools even then, and run into 
harness-enforced compaction unless the user intervened with clear orders to 
interrupt work and curate context now. The models that did best overall (each 
for their respective class) were the models of the Qwen 3.8 family. I evaluated all 
three sizes (27b, flash next and max). Each showed initiative to curate its context 
before capacity pressure at least once, and each showed better consistence than other
models in a similar class. Unfortunatelly, even Qwen 3.8 models did not stick to it in
the long run, but got distracted and eventually run into harness-induced auto-compaction 
in longer sessions.

### Next steps

Several iterative attempts to improve the injected system prompt slices and the tool
hints did, unfortunately, not prove to be sufficient to make models keep the initiative
to curate their own context. It seems that the training of the models, which encourages
a goal-focused approach, is sufficient to override meta-cognitive side-tasks even
for current frontier models (e.g. gpt 5.6 terra).

The next step, for me, is therefore to attempt to fine-tune a LoRA for some of the
evaluated models in an attempt to make it pick up on curating its context at 
reasonable inflection points (when finishing a sub-task, work package, slice, 
bug-fix-detour, etc.). This is not something I have attempted before, so it will
be an adventure in itself.


[PoC findings and next experiments](packages/coding-agent/docs/reflective-context-poc.md)
summarize the current cross-session evidence, decisions, and open questions.
[Evaluation results](packages/evals/reflective-context-results.md) retain the
candidate-by-candidate protocol, session evidence, and grades behind those
findings.



> **Upstream documentation:** The material below is copied verbatim from
> [`earendil-works/pi-mono`](https://github.com/earendil-works/pi-mono). It
> describes upstream Pi, including its npm distribution, rather than rxpi.

---
<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://www.npmjs.com/package/@earendil-works/pi-coding-agent"><img alt="npm" src="https://img.shields.io/npm/v/@earendil-works/pi-coding-agent?style=flat-square" /></a>
</p>

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).

# Pi Agent Harness

This is the home of the Pi agent harness project including our self extensible coding agent.

* **[@earendil-works/pi-coding-agent](packages/coding-agent)**: Interactive coding agent CLI
* **[@earendil-works/pi-agent-core](packages/agent)**: Agent runtime with tool calling and state management
* **[@earendil-works/pi-ai](packages/ai)**: Unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

To learn more about Pi:

* [Visit pi.dev](https://pi.dev), the project website with demos
* [Read the documentation](https://pi.dev/docs/latest), but you can also ask the agent to explain itself

## All Packages

| Package | Description |
|---------|-------------|
| **[@earendil-works/chord](packages/chord)** | Standalone application-composition runtime for services, replicated state, RPC, and plugins |
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
