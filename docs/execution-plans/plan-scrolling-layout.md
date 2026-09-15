# Plan scrolling layout

Status: complete — implemented and verified on 2026-07-21.

## Goal

Match YNAB's desktop budget layout while preserving the existing sub-`lg` page and drawer behavior:

- keep the app page header and Cost to Be Me panel outside the scrolling panes;
- give the plan grid and inspector independent, bounded vertical scrollports;
- keep the grid column header pinned without overlapping its first row;
- prevent document-level horizontal scrolling.

## Live DOM findings

- At a 947px viewport height, Tracky's document was 2,390px tall and the nominally bounded `AppPage`
  was 2,326px tall. Its `flex-1` sizing won over the viewport height inside the shell's intrinsically
  sized flex chain, so the grid and inspector had no overflow range.
- YNAB kept `html` and `body` at the 1,003px viewport height with overflow hidden. Its grid and
  inspector content were sibling scrollports, each 877px high with taller scroll content.
- Tracky's inspector had both an outer `overflow-y-auto` column and an inner Radix scroll viewport,
  while the sticky card was taller than its outer column. This produced competing/clipped scroll areas.

## Implementation

1. Make the desktop `fullHeight` page a non-flexing, viewport-bounded item and account for the inset
   shell's vertical margins.
2. Keep the grid's combined horizontal/vertical overflow on the same element that contains its sticky
   table header.
3. Make the desktop inspector host a bounded flex item and let its existing `ScrollArea` be the only
   inspector scrollport.

## Current Verification Evidence

- Live Chrome comparison against the authenticated YNAB budget page confirmed YNAB's sibling grid
  and inspector scrollports inside a viewport-height document.
- At the tall desktop size, both sides of the grid accepted wheel scrolling, the sticky header stayed
  pinned, the inspector reached its final action, and the document retained zero vertical and
  horizontal scroll range.
- At a 1,920x700 emulated viewport, the same checks passed with a 198px grid scrollport and a 283px
  inspector scrollport.
- At 900px width, the desktop inspector was hidden and the existing page-scrolling drawer path was
  active.
- `pnpm lint`: passed (`tsc` and ESLint, zero warnings).
- `pnpm test`: passed (82 files, 595 tests).
- `pnpm build`: passed (client and SSR production bundles; existing font-resolution and chunk-size
  warnings remain non-fatal).
