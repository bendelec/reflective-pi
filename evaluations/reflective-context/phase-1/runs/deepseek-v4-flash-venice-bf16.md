# DeepSeek V4 Flash — Venice-hosted, unquantized BF16

**Final curation grade: 3/10.** This is the inverse profile of the local
Dwarfstar IQ2 DeepSeek V4 Flash run.

This model showed the strongest autonomous intent among the evaluated models and
the weakest execution. It made 18 self-initiated `prune_context` calls without user direction.
One early, reasoned exclusion of 42 stale requirement reads and exploration blocks
worked. One call used a hallucinated ID. The remaining fourteen calls passed
`{"ids": []}`; the pre-split interface answered each with the success-shaped
no-op `Pruned 0 block(s).` The model perceived pressure and repeatedly attempted
action, but the interface provided no clear failure signal.

The session contains nine compaction entries, six of which are genuine
force-compactions. The final three entries (19:09, 19:22, and 19:34; `tokensBefore`
124582 → 124176 → 115128) are a retry cascade caused by the known compaction
reservation defect. Given the observed generation and tool-traffic rates, they
cannot represent three separate context refills and are not counted as three
failures.

No subagents were used, unlike Qwen 3.8 Flash's eight delegated sessions and the
local Dwarfstar IQ2 DeepSeek V4 Flash run's four verification passes. The session
produced 968k output tokens, the largest total before Qwen 3.8 Max, and least
effective curation.
Its reconsideration rate was among the most stable—0.30 markers per 1k output
tokens, equal to Qwen3.8 27B and well below the local Dwarfstar IQ2 DeepSeek V4
Flash run's 1.35—so stable reasoning did not translate into effective curation.

The 3/10 grade recognizes genuine autonomous intent and one competent large
prune, but the harness still had to compact roughly six times after those attempts.
