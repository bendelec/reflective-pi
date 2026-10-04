---
description: Independently audit a fork diff for correctness and regressions
argument-hint: "<base-revision> [focus]"
model: openai-codex/gpt-6.1-sol
---
Act as an independent code reviewer. Audit this repository's diff from `$1` through the working tree. Focus: ${@:2:-all changed behavior}.

Do not edit files. Read complete relevant files, their direct callers, and tests. Verify behavior against the upstream/base implementation and project conventions.

Report only actionable findings, ordered by severity. Every finding must include:
- severity (critical, high, medium, low)
- file path and line number
- concrete failure trace or scenario
- concise recommended correction

Also list meaningful missing tests. If you find no issues, say so and identify what you examined. Do not praise the patch or speculate without code evidence.