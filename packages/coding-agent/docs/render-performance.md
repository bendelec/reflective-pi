# Streaming render CPU investigation

## Problem and scope

After the footer/TUI render-cost cherry-pick (`8dd6f6de1`), the user still observed
7–15% of one CPU core during tool activity and approximately 30% while visible
reasoning or answer text streamed. This work targets rendering, not memory,
providers, session persistence or context curation.

A live eight-second sample of vectorwalker measured 14.98% process CPU, including
10.86% on the main thread and 2.37% on the allocator scavenger. Its exact streaming
phase was not captured, so this is not a visible-text-streaming baseline.

## Upstream check

Checked `earendil-works/pi-mono` changes after `v0.87.1` on 2026-10-04. No matching
streamed-component/incremental Markdown CPU fix was found. The earlier render-cost
fix is already present. Later upstream memory changes `54c19a25` and `e792ba13` were
not adopted: neither addresses these CPU paths, and one uses V8-specific string
flattening. The installed fork uses Bun.

## Behavior and changes

Previously, each assistant delta created fresh Markdown components for all its
text/thinking blocks. Each frame parsed and laid out the growing text again and
normalized every transcript line, including unchanged history.

The changes are deliberately separate:

- Assistant messages retain their text/thinking Markdown components while their
  streaming, padding and transformer configuration remains compatible. Changed
  text updates the retained component. Explicit invalidation drops this cache,
  including hidden thinking components that are not mounted in the render tree.
- TUI line normalization reuses results by exact raw string value across frames.
  The cache retains only current-frame non-image values; the previous lookup stays
  intact while the next frame is processed. This avoids eviction thrashing on
  long distinct transcripts. Invalidation, render reset and stop clear it. Image
  sequences still follow the existing byte-preserving path.
- Append-only Markdown retains completed top-level tokens and rendered lines,
  reparsing the last block and its predecessor. Width/next-token spacing are part
  of the rendered-block cache key. Explicit invalidation refreshes styling;
  same-text `setText()` retains its force-invalidation behavior.

The mutable tail must also begin before any ambiguous reference-label or dollar
block opener, even one merged into an earlier paragraph. Reference labels can
initially be parsed as setext headings or tables, so those tokens are not frozen
either. Such an opener can absorb
arbitrarily many later paragraphs. Newly discovered reference definitions trigger
full lexing, since they can resolve earlier links. HTML lexer state, existing
reference definitions, edits, and sources not exactly covered by token raw strings
use conservative full-lex fallbacks. Transforms run before deciding whether the
normalized source is append-only.

## Reproduction

No builds or provider credentials are needed. From the repository root:

```sh
bun scripts/benchmark-streaming-render.mjs
bun scripts/benchmark-streaming-render.mjs --static
bun scripts/benchmark-streaming-render.mjs --distinct
```

The replay uses a 120-column, 40-row discarded-output terminal, 300 previous
assistant messages, and an initially 20,000-character response. It schedules 150
frames over six seconds, adding eight characters per frame: a target of 200
characters/second and 25 frames/second. `--static` requests the same frames without
text updates. `--distinct` varies historical prose to avoid relying on repeated
line values. Source/dist Markdown mixing is checked explicitly.

For the baseline, run the same script in a temporary archive of `581407b43` with
unchanged dependency versions. No branch switch or worktree reset is required.

Single-run source comparisons on this machine (percent of one core, summed over
process threads):

| Replay | `581407b43` | Patched |
| --- | ---: | ---: |
| Streaming, repeated historical prose | 33.13% | 12.58% |
| Unchanged redraws, repeated historical prose | 13.82% | 7.98% |
| Streaming, distinct historical prose | 49.03% | 22.17% |

These are synthetic examples, not promised live CPU figures. JIT, garbage
collection, CPU clock and concurrent system activity affect them. The discarded
terminal excludes HTTP, footer, extensions and PTY parsing, so the high baseline
cost can be reproduced in rendering alone.

## Correctness coverage and remaining costs

Differential tests compare streamed Markdown against a fresh full parse/render at
every character, at chunk boundaries, and over deterministic mixed fragment
streams. They include late/multiline definitions, delayed math recognition,
fences, tables, lists, HTML, transforms, width/style invalidation and completed
code-highlighting reuse. Component tests cover streaming transitions, thinking
visibility, hidden-cache invalidation, padding and transformers. TUI tests cover
line reuse/removal/reordering, resets, images and resize behavior.

This is not full virtualization or a streaming parser within each Markdown block.
A very long unfinished paragraph, list or code fence can still require substantial
reprocessing. Root tree traversal, transcript concatenation, cursor/image checks
and screen diff remain proportional to mounted history. Live deployment/smoke
measurements are still required; the performance changes have not been installed.
