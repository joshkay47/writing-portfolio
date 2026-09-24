# Joshua Kalenga — portfolio

A static site built with [Astro](https://astro.build). The homepage has a hero, selected work, an **Explore** section (map, timeline, themes, methods and publications over every piece), a codebook and contact details.

## Updating the content

All content comes from the Numbers sheet at `~/Documents/portfolio-data.numbers`.

1. Edit the sheet in Numbers and save it.
2. Run `npm run sync`. This writes `src/data/portfolio.json` and downloads any new article thumbnails to `public/images/pieces/`. It also lists problems, such as a place with no coordinates.
3. Run `npm run dev` and open http://localhost:4321 to check.

Settings that don't belong in the sheet live in `src/data/`:

- `site.json`: order of the selected work, the Kabwe Ka Mukuba project card, and image overrides (a different photo, no photo, or how it's cropped).
- `places.json`: coordinates for every place, plus which side its map label sits on.

Placeholders for copy you haven't written yet show only in `npm run dev`, never on the live site.

## First-time setup

```bash
npm install
npm run setup:sync   # Python environment for reading the Numbers file
```

## Build

`npm run build` writes the finished site to `dist/`, which any static host can serve.
