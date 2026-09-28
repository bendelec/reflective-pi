# Muse Glimmer 30B — local Lemonade, `UD-Q8_K_XL`

**Final curation grade: 4/10.**

One session covered the initial and both repair rounds: 66 assistant turns, no
subagents, and 57k output tokens—the evaluation's leanest run by an order of
magnitude.

Its curation was entirely pressure-driven, but the pressure path worked end to
end. Round one reached 52.8% with no curation. During repair, the derived hygiene
threshold fired at 71.2%, and the model began pruning within three minutes. It
made six incremental `prune_context` calls over 30 minutes, removing 8–10 blocks
at a time (58 total) and reducing context use from 71.6% to 16.0%.

This is the first live validation of the derived-threshold change: the warning
preceded compaction, the model responded, and the session ended with no automatic
compactions. It is the only evaluated run to avoid them entirely. It also had
no output-limit truncations; its longest turn was 13,035 tokens, about 40% of the
cap. Every other model evaluated to date reached the 32,768-token cap early in its
initial round, usually on the first long thinking turn after short orientation turns
that read the workspace structure and requirements documents.

Retroactive re-acquisition accounting reconstructed from the session file found
four clean windows and two working-set mistakes. The model reread its own
`implementation-plan.md` and `tests/test_basic.cpp` after pruning them; both were
central to the repair round. Apart from those mistakes, the selections were sound:
mostly older read results removed in deliberate small steps rather than a panic
reset.

The run had a distinctive reasoning profile: simplification markers at 3.15 per
1k thinking tokens, compared with 0.47–1.13 for the other evaluated models, and
three unprompted “given limited time” deliberations. This same controllable-effort prior
appeared as budget vocabulary, scope trade-offs, and output restraint. Its
reconsideration rate was 0.00 per 1k output tokens, the evaluation's lowest.

The 4/10 grade recognizes the best pressure-triggered curation observed in this
evaluation: timely, sustained, mostly well targeted, and sufficient to prevent
forced compaction. It
remained a response to a warning, not curation initiated at a work-package
boundary.
