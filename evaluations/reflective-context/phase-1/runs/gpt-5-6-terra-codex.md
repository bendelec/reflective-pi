# GPT-5.6 Terra — OpenAI Codex API subscription

**Final curation grade: 5/10.**

This run used `gpt-5.6-terra` at the `high` reasoning level with a 131,072-token
context window and 32,768-token output limit. It was launched through a standalone
binary built before the current harness revision, so it retained the legacy
post-prune accounting feedback. The API exposed only short reasoning summaries and
encrypted continuation data, not raw reasoning content. Its 39,578 reported
reasoning tokens therefore did not create the same visible context pressure as
runs that retain their thinking output.

The session made four `list_context`/`prune_context` cycles, used no
`summarize_context` call or subagent, and never reached automatic compaction. In
the initial round, it curated without a warning at 40.0% use: it excluded 21 stale
orientation, build, and development blocks while retaining the initial task and
requirements. A second cleanup removed four failed-build and status blocks.

The first repair showed the central failure. The model did not curate again until
the harness injected its urgent hygiene instruction at 80.5% use. Listing context
then increased use to 82.9%, leaving little room before compaction. Its resulting
88-block prune reduced use to 22.2%, but included the initial task prompt and the
original requirements and public-API reads. Those are hard-to-reconstruct task
state, not ordinary replaceable file output. The trace contains no explicit model
response to either legacy accounting message.

During the final repair, the model again acted without a warning at 60.5% use. It
listed context and excluded 32 older repair-history blocks, reducing use from
79,278 to 44,242 tokens. This demonstrates that the model could make timely,
forward-looking selections, but it could not restore the discarded initial task
prompt. It did reread the requirements and API documents from disk after the
first-repair prune.

The separate [VWmini evaluation](https://github.com/bendelec/local-agent-cpp-eval/blob/main/evaluations/gpt56-terra-openai-codex-run-01.md)
reports 81/82 conformance and a 40/100 safety-capped C++ score. Those results are
not inputs to the curation grade.

The 5/10 grade recognizes repeated pre-pressure initiative and avoidance of
automatic compaction. It cannot score higher because the late, broad first-repair
prune removed the initial task and authoritative contract—the material a
forward-looking working set most needs to retain.
