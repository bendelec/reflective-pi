---
description: Implement one focused fork backlog item with tests
argument-hint: "<task>"
model: venice/deepseek-v4-pro-0813
---
Implement this focused task in the current worktree:

$ARGUMENTS

Rules:
- Work only on files needed for this task. Other agents may have uncommitted changes; preserve them.
- Read complete relevant source and test files before editing.
- Do not use `any`, dynamic imports, or non-erasable TypeScript syntax.
- Add or update focused regression tests for behavior changes, then run those tests.
- Run `npm run check` after TypeScript/code changes and fix all failures caused by your work.
- Do not commit, stage files, modify changelogs, or rewrite unrelated roadmap entries.
- Report changed files, test commands/results, and any remaining concern concisely.
