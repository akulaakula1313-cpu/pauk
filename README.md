# SANI GROUP — ПАУК v8

Production-ready single-folder build for Render/Node.js.

## Render
Build Command: `npm install`
Start Command: `npm start`

## Local
`node server.js` then open `http://localhost:3000`.

## Important fixes in v8
- No assets folder: all files are in the root.
- Favicon included, so `/favicon.ico` 404 is eliminated by the SVG favicon link.
- No giant logo watermark over the board.
- Face cards use a clean isolated `.card-face`; no brown overlay layer is allowed.
- Page load never opens Pause automatically unless a saved game exists. Saved games reopen paused intentionally.
- 1/2/4 suit decks always contain exactly 104 cards.
- Hint is visible with gold source, green target and arrow.
- Repeating the exact same hint 3 times switches the hint to a new-deal recommendation instead of cycling forever.
- Pointer drag uses pointerId and safe cancellation.
- Undo history is not capped at 60.
