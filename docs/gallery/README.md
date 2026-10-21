# Gallery data

`docs/gallery.html` is generated from `items.json` by `npm run gallery`.
Do not edit the HTML — it is overwritten.

## Adding a piece

1. Put the image in `files/`. A photograph (`.jpg`/`.png`/`.webp`) for something
   someone has actually cut; an `.svg` for a design people can download and cut
   themselves. Keep photographs under about 300 KB — this repo is served from
   GitHub Pages and every byte is cloned by anyone working on the project.
2. Add an entry to `items.json`:

```json
{
  "id": "unique-slug",
  "title": "Hex coasters",
  "category": "Homeware",
  "by": "Name of the maker",
  "source": "submitted",
  "preview": "files/hex-coasters.jpg",
  "file": "files/hex-coasters.svg",
  "size": "90 × 78 mm",
  "cut": "Line",
  "note": "One sentence on how it was made.",
  "licence": "CC BY 4.0"
}
```

3. `npm run gallery`, then commit both the files and the regenerated page.

`source` is `built-in` for designs that ship inside the app and `submitted`
for anything else. Submitted pieces are credited by name on the card.

The build fails if an entry points at a file that is not there, so a broken
link cannot reach the site.

## Before publishing someone else's work

Get their say-so, in writing, in the thread where they posted it, and record
the licence they are offering it under. If they have not said, ask — do not
assume. Take it down on request, no argument.

## Later

The entry shape is the shape a database row would have. When submissions are
accepted directly, the page can be fed from a feed instead of this file
without the markup changing.
