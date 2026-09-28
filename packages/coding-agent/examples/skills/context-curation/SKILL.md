---
name: context-curation
description: Curate rxpi context after completed work slices, including small ones; before changing tasks; or after a mistaken prune. Decide what to keep, summarize, or exclude for upcoming work.
---

# Context curation

At each work-slice boundary, ask what the next step needs. Do this even when
capacity is ample, but do not interrupt unfinished tool work. Record durable
results in project files when appropriate; a session summary is no substitute
for a verified artifact.

Use `list_context` to find atomic blocks and their IDs. Previews are reminders,
not evidence that an uncertain block is safe to remove. A tool call and its
results form one block and must be judged together.

- **Keep** exact wording, detail, or evidence needed for the active task:
  applicable user requirements and corrections, unresolved findings, and the
  recent result the next step relies on. Prefer to retain user messages, but
  do not keep *all* of them: a superseded request can be summarized or excluded
  when no applicable constraint would be lost.
- **Summarize** when information may matter later but a shorter factual account
  will serve just as well. Preserve decisions, outcomes, uncertainty, paths,
  and open questions. Do not promote unverified claims to facts. High
  reconstruction cost matters only when the information has plausible future
  use.
- **Exclude** a block with no likely forward value, or information safely and
  cheaply available elsewhere. Routine file reads and completed tool output
  often qualify after their findings are captured. A read of an earlier file
  version may instead be irreplaceable evidence; tool type alone is not a
  deletion rule.

Examples:

- A resolved bug-fixing detour unrelated to the current task left logs, file
  reads, and exploratory commands. Once the fix and its outcome are recorded,
  exclude those tool blocks. Summarize the root cause only if it may recur.
- A module is implemented and its tests are verified before work starts on the
  next module. Keep interface decisions and unfinished integration work; exclude
  obsolete reads and implementation tool traffic. Summarize a lengthy result
  if the next module needs its conclusions, not its full transcript.

Use `summarize_context` for a shorter replacement and `prune_context` to
exclude blocks. Do not remove the only copy of a needed result. Check that the
next action remains clear; if not, consult the relevant plan or source. Verify
consequential claims that may be stale, but do not reread unchanged files after
every prune. Curation changes the model's context, not session history; the
user can restore mistakes with `/prune`.

## Learn from mistakes

If a curation decision causes a concrete mistake, recover what was lost and
update **your project's copy** of this skill if project rules permit. Record a
short dated lesson: what went wrong, evidence of the cause, and a narrow rule
change. Consolidate repeated lessons; do not add speculative rules or edit
this shared example silently.

### Project lessons

Add verified, project-specific lessons here in your local copy.
