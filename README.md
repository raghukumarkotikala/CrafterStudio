# Crafter Studio

A desktop design-and-control studio for laser engravers and cutters (Electron).

## Run

```
npm install
npm start
```

## Build

| Command | Output (in `dist/`) | Build on |
|---|---|---|
| `npm run dist` | `CrafterStudio-Setup-<ver>.exe` (installer), `CrafterStudio-Portable-<ver>.exe` | Windows |
| `npm run dist:linux` | `CrafterStudio-<ver>-x86_64.AppImage`, `crafter-studio_<ver>_amd64.deb` | Linux (needs `mksquashfs`, so not plain Windows) |

The workflow in `.github/workflows/build.yml` builds both in GitHub Actions (run it manually, or push a `v*` tag).

Two Linux formats, because they fail differently. The **AppImage** runs from anywhere without installing, but Mint 22, Ubuntu 24.04 and newer no longer ship the FUSE 2 library it needs — those users have to `sudo apt install libfuse2t64` or pass `--appimage-extract-and-run`. The **.deb** has no such dependency and puts the app in the menu, which is the better default on Debian, Ubuntu and Mint.

Build with **Node 22.x** (see `.nvmrc`; CI uses the same line). Electron 44 requires Node 22.12.0 or newer, and Node 22 is the newest LTS line that still bundles npm 10 — Node 24 and later ship npm 11, and electron-builder 26 cannot read the dependency tree it produces. Node 20 bundles npm 10 but is below Electron 44's floor. Installers are not committed: an Electron 44 build is about 113 MB, over GitHub's 100 MB per-file limit, so releases carry the binaries.

## Features

- **Design:** select/transform (move, scale, rotate), node editing, rectangle (with corner radius), ellipse, polygon, star, line, Bézier pen, freehand pencil, and text using any installed font (converted to outlines).
- **Text shaping:** bend text around an **arc** (the baseline keeps its true length, so a 100 mm word stays 100 mm of engraving), distort it with an **8-handle envelope** — four corners for stretch, skew and perspective, four edge midpoints to bow the edges — flow it along **any curve you draw** (*Object → Fit Text to Path*, with a start offset and a side to read from — the guide's shape is stored with the text, so the curve can be moved or deleted afterwards), or set it in **single-line (Hershey) fonts** that engrave down the centre of each stroke in one pass instead of outlining and filling. That is roughly 60% less laser travel on the same word, and a thinner, cleaner mark on metal and anodised aluminium. Arc and envelope are stored with the text, so changing the wording re-applies the shape.
- **2D codes:** generate **QR**, **Data Matrix**, **GS1 Data Matrix**, **Aztec** and **Micro QR** as real vector geometry rather than a pasted bitmap, with a live preview. Dark modules are merged into runs — a 29×29 QR becomes 218 rectangles instead of 434 — and the dialog reports module size in millimetres, warning below 0.35 mm where a diode spot bridges neighbouring modules and the code stops scanning.
- **Path operations:** union, difference, intersection, exclusion, divide, offset, combine, break apart, group, align and distribute, flip, grid and circular arrays, undo/redo.
- **Measure and clean up:** an **M** tool drags a measuring line and reports distance, X/Y difference and angle in the status bar without adding anything to the drawing. **Simplify Paths** cuts the node count on traced bitmaps and DXF imports and reports how much the enclosed area moved, so you can tell whether a part will still fit; **Join Open Paths** welds endpoints within a tolerance and closes any contour whose own ends meet, which is the usual fix for a DXF that will not fill.
- **Variable text:** put placeholders in any text object and let the data fill them in — `{{Name}}` from a CSV column (quoted fields with commas are handled, column names matched ignoring capitals), `{{serial}}` as a running number with its own start, step and zero padding, plus `{{index}}`, `{{count}}`, `{{date}}`, `{{time}}` and `{{date:DD/MM/YYYY}}`. *Object → Variable Text* steps through the rows and rebuilds every piece of variable text on the canvas as it goes; objects re-anchor on the edge they are aligned to, so a longer name grows outwards instead of dragging a row of tags out of line. An unresolved placeholder is engraved **as written** rather than blank — a gap where a name should be looks like a finished tag, whereas `{{Nmae}}` in the wood tells you what went wrong. Works with outline fonts and single-line fonts, and with arced, enveloped and path-following text.
- **Import:** SVG (unit-aware, colours mapped to layers), DXF (lines, polylines with bulges, arcs, circles, ellipses, splines, blocks), and PNG/JPG/BMP/GIF/WebP. Drag and drop works.
- **Library tab (drag & drop art):** 215 built-in laser art pieces — basic shapes, frames & borders, mandalas, Indian motifs (lotus, paisley, diya, rangoli, kolam, peacock feather, kalash), nature, celebration, badges, 29 cartoon characters, 28 smileys, 16 birthday designs, 32 festival designs (Diwali, Holi, Rakhi, Makar Sankranti, Ganesh Chaturthi, Janmashtami, Eid, Christmas, Halloween, Easter, New Year) and 100 mm patterns. The characters are Crafter Studio's own designs — no licensed or branded characters are shipped; add your own artwork through My Library. It also has 5,148 line icons and 1,054 solid icons ([Tabler](https://tabler.io/icons), MIT) and 7,188 [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache-2.0), all searchable. Click to insert or drag onto the canvas. Line art can come in as centre lines or outlined strokes. **My Library** stores your own SVG/DXF/images and saved selections. Icon bundles are generated by `npm run library`; licences are in `src/library/`.
- **Images:** brightness, contrast, gamma, invert and 10 dithering modes (including grayscale variable power), plus trace-to-vector.
- **Layers:** 30 colour layers in LightBurn style. Each layer has a mode (Line, Fill or Image), power, speed, passes, line interval, scan angle, bidirectional scanning, overscan and air assist. Individual objects can override power and speed.
- **Cut quality:** a per-layer **kerf** figure moves the cut by half the width the beam removes — outward on outlines, inward on holes, with nesting worked out automatically so a hole inside a part shrinks and a part inside that hole grows again — so a 20 mm disc comes out 20 mm instead of 19.8. **Tabs** leave small uncut bridges that hold each piece in the sheet until you snap it out; they are spaced evenly around each closed shape, never land on the start point, and stay in the same places on every pass. A shape too small to tab safely is cut normally and the job warns, rather than producing a part that never comes free. Both are applied while the job is built, never to your drawing.
- **Fill style:** scan lines, or **offset** fill that follows the outline inward in concentric rings — the head stays on an edge instead of reversing at the end of every row, which on a diode often marks more evenly and leaves a grain that follows the shape. Rings are measured from the original outline each time, so the spacing cannot drift as they accumulate. Fill order can also finish each shape before starting the next: on a two-square test that cut trips between shapes from 30 to 1 for exactly the same burnt material, though rapid travel rose from 43 mm to 130 mm, so it pays off when shapes sit apart rather than close together.
- **Machines:** about 380 profiles from 46 brands, plus custom profiles. The work area size and origin corner are fully editable.
- **G-code:** GRBL (M4/M3), grblHAL/FluidNC, Marlin and Smoothieware. Cuts inner shapes before outer ones, orders paths to shorten travel, estimates job time, and can start from the current laser position with a 9-point anchor.
- **Ruida job files:** *File → Export Ruida .rd* writes a planned job for the DSP controllers in most larger CO₂ machines — layers with their speed, power range and colour, in run order, fills already converted to scan lines. 72 of the shipped machine profiles are Ruida machines, which until now had to re-enter every setting in RDWorks. Passes are expanded into the geometry and the layer claims one pass, so do not also set a repeat count on the machine; a rotary job is written flat with a warning, because the controller does its own rotary conversion. *Not verified against hardware — there is no published specification for the format, and this has never been run against a Ruida controller. The export dialog reads the finished bytes back and reports what the file actually says, so a mistake shows up before the file reaches a machine. Open it in RDWorks or LightBurn and look at the geometry first. Driving a Ruida machine directly is not supported.*
- **Camera alignment:** point a camera at the bed and the picture is drawn behind your design, so material can be placed on the offcut that is actually there. Lens bowing is undone with a one-parameter radial correction you drag until the bed edges look straight; the viewing angle is undone by a projective transform built from four marked points whose bed coordinates are known — the bed corners, or any four points you can measure and type in. Four points that cross over are refused outright. The picture is locked in the background layer, never saved into a file, exported or burnt, and the camera is held open only while the overlay is on. *A guide, not a measurement — frame the job before cutting.*
- **Rotary axis:** vertical travel becomes rotation of the workpiece, so a design wraps around a tumbler, pen or ring — a drawing 188.5 mm tall wraps exactly once around a 60 mm object. Output as degrees on a real A axis, or as scaled travel for a rotary plugged into the Y motor on a controller that still thinks in millimetres. Homing and return-to-origin drop the Y axis while it is active, and the file records the diameter, circumference and conversion used. *Verified mathematically, not yet against hardware — frame with the laser off before cutting.*
- **Machine control (USB serial):** connect, jog, home, unlock, set origin, frame, test fire, start/pause/stop with streaming progress, and a console.
- **Tools:** material library and material test grid generator. The library covers wood, acrylic, leather, paper, slate, glass and metals per laser class, plus **3D printing filaments** (PLA, PETG, TPU, ABS/ASA, nylon, PC, PP, PVB, wood/carbon-filled and cured resin) for engraving printed parts, with fume warnings and the filaments that must never be lasered.
- **AI (optional, bring your own key):** an **AI** tab in the sidebar and an **AI** menu.
  - *Generate a design* — describe a piece and get laser-ready vector geometry, sized in millimetres and placed straight onto the canvas. Cut lines come back blue, engraved areas black and score lines red, so they land on correctly configured layers automatically.
  - *Change the selection* — select objects and ask for an edit in plain language ("turn this into a stencil", "add a 3 mm border and a hanging hole"). Undo restores the original.
  - *Suggest material settings* — describe a material and get starting-point power/speed/passes for your machine's actual wattage, applied to a layer or saved into the material library in one click.

  Three provider choices under *AI → AI Settings*:
  - **Anthropic (Claude)** — enter a key and model.
  - **OpenAI-compatible** — any base URL: OpenAI, OpenRouter, Groq, Together, LM Studio.
  - **Local (Ollama)** — no key, nothing leaves your machine. Crafter Studio reads your installed models straight from Ollama (`/api/tags`, falling back to `ollama list`) and lists them in a dropdown with parameter count and size; embedding-only models are hidden because they cannot answer a prompt. Point it at a different host to use Ollama on another box. Small models return rough geometry — a 7B-or-larger coder model works best. Nothing is sent anywhere until you add a key and press a button; requests go from your machine straight to the provider you chose. The key is encrypted with the system keyring where one is available and stored outside the project folder, never in the project file. All model output is run through a strict allowlist sanitizer before it touches the canvas. Treat generated designs and settings as a starting point — check the geometry and test on scrap before cutting.

Ruida, Trocen, TopWisdom, M2 Nano, EZCAD galvo and cloud/proprietary machines (Glowforge, xTool P2/M1/F1, LaserPecker …) cannot be driven directly. Crafter Studio designs at their size and exports SVG for the maker's software.

Profile specs are nominal manufacturer figures — verify your machine's work area and origin.

## Documentation

The manual lives in `src/js/help-content.js` and is rendered twice from that single source: in the app under **Help → Help Contents** (F1), and as [crafterstudio.in/guide](https://www.crafterstudio.in/guide.html) via `npm run guide`, which writes `docs/guide.html`. Edit the topics, not the generated page — the release scripts rebuild it.

## Licence

Crafter Studio is released under the [ISC licence](LICENSE) and comes with no warranty. You operate your machine at your own risk: always wear eye protection rated for your laser's wavelength, never leave a running laser unattended, and keep a fire extinguisher nearby.

Bundled third-party work, all redistributed under their own licences:

| Component | Licence |
|---|---|
| [Tabler Icons](https://tabler.io/icons) | MIT — © Paweł Kuna ([text](src/library/LICENSE-tabler.txt)) |
| [Material Design Icons](https://pictogrammers.com/library/mdi/) | Apache-2.0 — Pictogrammers ([text](src/library/LICENSE-mdi.txt)) |
| [Electron](https://electronjs.org), [paper.js](http://paperjs.org), [paperjs-offset](https://github.com/glenzli/paperjs-offset), [opentype.js](https://opentype.js.org), [dxf-parser](https://github.com/gdsestimating/dxf-parser) | MIT |
| [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) | Unlicense (public domain) |

The built-in art pieces, including the cartoon characters, are Crafter Studio's own designs — no licensed or branded characters are shipped. Machine brand and model names are used only to identify compatible hardware; Crafter Studio is not affiliated with or endorsed by any of them.
