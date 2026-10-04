---
description: Resolve merge conflicts in docs, changelogs and scripts
argument-hint: "<files and rules>"
model: qwen-token-plan/qwen3.8-flash
---
Resolve the merge conflicts described below in the current worktree.

$ARGUMENTS

Rules:
- Edit only the files you were given. Other workers may hold the rest; preserve their changes.
- Never run `git add`, `commit`, `checkout`, `restore`, `merge`, `reset` or `stash`: the index is shared.
- Keep both sides' intent: upstream content as the base, fork-specific sections re-inserted where they still apply.
- Adapt fork wording to upstream's new names instead of keeping stale text, and report every such adaptation.
- Leave no conflict markers; verify with a search before reporting.
- Do not build, run npm, or run tests unless the task explicitly asks.
- Report per file: which side won each hunk and why, plus anything ambiguous. No diffs.
