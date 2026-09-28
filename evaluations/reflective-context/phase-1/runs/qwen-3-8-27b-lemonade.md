# Qwen3.8 27B — local Lemonade, `UD-Q8-L-XL`

**Final curation grade: 5/10.**

At 70.9% context use, without user intervention, the model chose to curate before
starting its next work package. It listed blocks, identified stale exploration and
build output, and selected blocks deliberately.

Its first three selection calls used a nested `ids` object instead of the required
array. It persisted with that malformed shape even after the user supplied the
correct syntax. This was a real tool-use weakness, but the then-untyped schema
said only that `ids` accepted `Any`, despite the tool requiring an array of
strings. The contract was therefore avoidably ambiguous. After interruption and
resume, the model successfully selected 62 blocks, then made two further
deliberate selections of 43 and 67 blocks.

The model explicitly kept material that might remain valuable and removed content
that could be reread from disk. That trade-off need not match a human's exact
selection to count as competent forward-looking curation. The initial syntax
failures are consequently not a material score deduction: the exposed contract
was ambiguous, and the corrected contract was used successfully.

The trigger was still capacity pressure. The model did not consider curation until
70.9% use. A higher score requires treating context hygiene as an independent
quality goal at plan milestones, topic changes, and other natural boundaries, not
only as a response to imminent capacity loss.

The behavior also did not last. After its third cleanup, the model allowed six
automatic compactions. At 88.5%, it chose to write a comprehensive completion
report rather than curate and immediately triggered compaction. At 95%, it called
`prune_context` after compaction had already reduced the context, credited the
listing call with the reduction, and made no selection.

One compaction attempt failed at 124,600 recorded tokens because the compaction
prompt and system instructions exceeded Qwen3.8 27B's 131,072-token input limit.
The user temporarily selected a larger-context model to perform the compaction.
This was an inherited harness-reserve failure, not a Qwen3.8 27B failure.

The 5/10 grade reflects substantial autonomous, deliberate pruning early in the
task but no durable hygiene practice through the difficult second half. This
session used the original prompt; the stronger quality-driven policy and the
above-80% fallback instruction were introduced later.
