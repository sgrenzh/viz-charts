# 001 — Make chart motion responsive and accurate

- **Status**: DONE
- **Commit**: e6abd07
- **Severity**: HIGH
- **Category**: Purpose, performance, accessibility

## Findings

`src/horizon-transition.ts:78` runs 450–550 ms geometry morphs; `src/charts.ts:1089` installs final hit data before those morphs finish. `src/charts.css:79` moves tooltips with 320 ms layout transitions. `src/charts.ts:611` reels headline digits on frequent interactions, and `src/charts.css:127` animates donut legend layout. `src/charts.css:162` delays retry feedback with a clip-path wipe and `:168` continuously repaints loading text.

## Goals and checks by chart

| Chart | Target | Verification |
| --- | --- | --- |
| Column, stacked column, range column | Time-range changes and tooltip positions update immediately; marks and hit data agree. | Update twice rapidly, inspect final marks and keyboard tooltip; no running chart animations. |
| Line, line + column | Range, marker, tooltip and headline update immediately, including keyboard navigation. | Update twice rapidly and navigate with arrows; displayed value matches selected mark; no digit reel. |
| Heatmap | Date cells and tooltips update immediately, without geometry tweening. | Update twice rapidly and inspect date tooltip; no running chart animations. |
| Strip, segmented strip | Hover, keyboard and touch inspection and selection respond immediately. | Select or inspect two items and verify values, selected state and no animated tooltip. |
| Donut | Ring, centre and legend selection update together without moving legend layout. | Select two items with keyboard and pointer; check centre, ring and legend agree. |
| Loading and error | Retain one loading cue, static under reduced motion; retry shows loading immediately. | Check spinner and skeleton, reduced motion, and retry state announcement. |

## Implementation

Remove the horizon SVG tween and digit reels, preserving the public `update(config, { timeHorizon })` signature. Remove tooltip position and donut layout/selection transitions. Retain the skeleton sweep and spinner as loading indicators, remove the redundant text shimmer and delayed retry wipe. Remove the 650 ms card reveal that repeats while scrolling. Preserve reduced-motion handling and existing accessibility announcements. No new dependencies.

## Verification

Run `npm run build` and `npm test` for chart layout and data at narrow and wide widths. Exercise each chart family in a browser using the matrix above, including rapid repeat actions, keyboard and reduced-motion. Inspect at slowed playback for visual/interaction alignment and confirm no unwanted movement. Mark DONE only when all checks pass; document any unavailable checks.

Start Vite with `npm run dev -- --host 127.0.0.1 --strictPort` and GeckoDriver with `geckodriver --port 4444`. Run `node tests/chart-motion.browser.mjs`.

The build and layout tests passed. Headless Firefox passed all 14 gallery presets with both default and reduced motion. The suite checks rendered geometry against the latest range, compares consecutive browser frames for late motion, and exercises keyboard, pointer and simulated touch. It also verifies the dashed hover guide with dots and the x-axis hidden. Physical touch and other browsers were outside this run.

The gallery checks open each preset, change its date range or sort order where available, close it, and close it again while its opening motion is running. The final run returned SUCCESS for every preset in both motion modes after fixing a stale closing state on immediate reopen.
