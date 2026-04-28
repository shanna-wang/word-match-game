# Word Match Game

A static website where you can build and play shareable word-group matching puzzles.

## Features

- Puzzle builder with:
  - X groups and Y items per group form generator
  - Optional JSON paste mode
- Shareable puzzle URLs with no backend (puzzle stored in URL hash)
- Play mode with:
  - Giant free-scrolling grid
  - Two-click matching logic
  - Merge-into-second selection behavior
  - Mistake tracking
  - Matched / remaining counters
  - Deselect all button
  - Truncated labels + full tooltip
  - Random pastel highlight when a group is fully complete

## Run locally

Because this is a static site, you can use either option:

1. Open `index.html` directly in your browser.
2. Or run any static server (optional), for example:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

## How sharing works

- In builder mode, click **Generate share link**.
- The puzzle is encoded into the URL hash (the `#...` part).
- Share that full URL with a friend.
- Anyone with the link can open and play that specific puzzle.

The hash is not sent to a server, so no backend storage is needed.

## JSON format

Use this in **Paste JSON instead**:

```json
{
  "title": "Animals",
  "groups": {
    "Cats": ["lion", "tiger", "cheetah", "puma"],
    "Dogs": ["wolf", "fox", "husky", "beagle"]
  }
}
```

Rules:

- At least 2 groups
- At least 2 items per group
- No duplicate item names across groups

## Hosting options

### Netlify Drop

1. Open [Netlify Drop](https://app.netlify.com/drop)
2. Drag the whole project folder in
3. Use the generated URL

### GitHub Pages

1. Push this folder to a GitHub repository
2. In repo settings, enable **Pages** from the default branch root
3. Use the Pages URL for sharing
