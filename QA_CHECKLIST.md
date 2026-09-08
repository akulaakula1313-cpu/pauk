# SANI GROUP Spider Ultimate v7 — QA checklist

- 104 cards in every mode: 1 suit = 8 copies, 2 suits = 4 copies each, 4 suits = 2 copies each.
- Initial tableau = 6,6,6,6,5,5,5,5,5,5 = 54 cards; reserve = 50.
- Fisher-Yates shuffle.
- Valid single-card and same-suit descending-stack moves.
- Empty column accepts single card or valid stack.
- Invalid drag does not mutate logical state.
- Reserve deals exactly 10 cards and is blocked if any column is empty.
- Reserve has exactly 5 deals.
- Completed K-A same-suit sequence auto-removes and flips the card beneath.
- Undo is not capped at 60 and costs 1 point while restoring the prior board state.
- Timer pauses on pause, tab hide, and window blur.
- Local save restores board, reserve, score, moves, timer and Undo history.
- Drag is single-pointer locked; pointercancel/Esc cleans up.
- Hint prioritizes same-suit assembly and visible uncover/empty-column opportunities.
- **Anti-loop hint:** if a move/state repeats 3 times, Hint stops recommending the same move and recommends the next reserve deal when available.
- All graphics are in the project root; no `assets/` subfolder.
- Face cards use clean generated court artwork without the previous black overlay artifact.
