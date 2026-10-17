// Help topics. Deliberately free of any DOM dependency: src/js/help.js renders
// these in the app, and scripts/build-guide.js renders the same text into
// docs/guide.html, so the manual and the website cannot drift apart.
import { MACHINES, BRANDS, CONTROLLERS } from './profiles.js';

const direct = Object.values(CONTROLLERS).filter(c => c.direct).map(c => c.label.replace(/ \(.*/, '')).join(', ');

export const TOPICS = [
  {
    id: 'start', title: 'Getting started', body: `
<p>Crafter Studio takes a design from drawing or import, through layer settings that decide how each colour is burned, to G-code that your laser runs — or a job streamed straight over USB.</p>
<h4>The window</h4>
<ul>
  <li><b>Top bar</b> — file actions, undo/redo, object operations, alignment, then your machine, Connect, Frame, Preview and Start on the right.</li>
  <li><b>Toolbox</b> (left) — drawing tools. The strip under the top bar shows options for whichever tool is active.</li>
  <li><b>Canvas</b> — the white area is your machine's bed, drawn to scale in millimetres. Rulers run along the top and left.</li>
  <li><b>Sidebar</b> (right) — <b>Layers</b>, <b>Object</b>, <b>Library</b>, <b>AI</b> and <b>Machine</b> tabs.</li>
  <li><b>Bottom</b> — the colour palette for assigning layers, and the status bar.</li>
</ul>
<h4>A first job</h4>
<ol>
  <li>Pick your machine (<i>Machine → Machine Profile &amp; Work Area</i>) so the bed size and origin are right.</li>
  <li>Draw something, or drop an SVG, DXF or image onto the canvas.</li>
  <li>Click a palette colour to put objects on a layer, then set that layer's mode, power and speed in the <b>Layers</b> tab.</li>
  <li>Press <b>Preview</b> to watch the toolpath before anything burns.</li>
  <li><b>Frame</b> traces the outline at low power so you can check placement on the material.</li>
  <li><b>Start</b> runs the job, or <b>Export G-code</b> if you run from SD card.</li>
</ol>
<p class="note warn">Run a material test on scrap first. Power and speed that work on one machine or one sheet of plywood can be wrong on the next.</p>` },

  {
    id: 'machine-setup', title: 'Setting up your machine', body: `
<p><i>Machine → Machine Profile &amp; Work Area</i> (Ctrl+Shift+M). Search ${MACHINES.length} profiles across ${BRANDS.length} brands, or build your own.</p>
<h4>What matters most</h4>
<ul>
  <li><b>Work area</b> — width and height in millimetres. If this is wrong, everything is positioned wrong. Measure your machine rather than trusting the marketing figure.</li>
  <li><b>Machine origin</b> — which corner the machine treats as 0,0. Most diode lasers are bottom-left; many desktop CO₂ machines are top-left. If your output comes out mirrored or flipped, this is usually why.</li>
  <li><b>Firmware</b> — ${direct} can be driven directly over USB. Ruida, Trocen, TopWisdom, EZCAD galvo and cloud machines cannot; Crafter Studio designs at the right size and exports SVG for the maker's software.</li>
  <li><b>Max S value</b> — the number your firmware treats as full laser power. GRBL usually 1000, Marlin 255, Smoothieware 1. Wrong here means power is scaled wrong.</li>
  <li><b>Laser mode</b> — M4 varies power with speed so corners do not over-burn. M3 holds power constant. Prefer M4 unless your firmware lacks it.</li>
</ul>
<h4>Job defaults</h4>
<p>Home on start, return to origin when finished, allow air assist per layer, and the power and speed used by Frame. Custom start and end G-code is appended around every job if you need it.</p>
<p>Profiles are starting points from manufacturer specifications. <b>Save as custom profile</b> keeps your corrected version.</p>` },

  {
    id: 'drawing', title: 'Drawing', body: `
<p>Tools live in the left toolbox; each has options in the strip above the canvas.</p>
<table class="tbl">
<tr><th>Tool</th><th>Key</th><th>Notes</th></tr>
<tr><td>Select &amp; transform</td><td><kbd>V</kbd></td><td>Shift+click adds to the selection. Drag empty space to box-select — dragging right-to-left also catches objects you only touch. Alt+drag duplicates.</td></tr>
<tr><td>Edit nodes</td><td><kbd>N</kbd></td><td>Drag nodes and handles. Double-click a segment to add a node, double-click a node to toggle smooth/corner, Delete removes it.</td></tr>
<tr><td>Rectangle</td><td><kbd>R</kbd></td><td>Corner radius option. Shift = square, Alt = draw from centre.</td></tr>
<tr><td>Ellipse</td><td><kbd>E</kbd></td><td>Shift = circle, Alt = from centre.</td></tr>
<tr><td>Polygon</td><td><kbd>P</kbd></td><td>Set the number of sides.</td></tr>
<tr><td>Star</td><td><kbd>S</kbd></td><td>Points and inner ratio.</td></tr>
<tr><td>Line</td><td><kbd>L</kbd></td><td>Shift constrains to 45°.</td></tr>
<tr><td>Pen (Bézier)</td><td><kbd>B</kbd></td><td>Click for corners, drag for curves. Click the first node to close, Enter or double-click to finish, Backspace removes the last node.</td></tr>
<tr><td>Freehand</td><td><kbd>F</kbd></td><td>Smoothing option. End near the start point to close the shape.</td></tr>
<tr><td>Text</td><td><kbd>T</kbd></td><td>Any installed font, converted to outlines, plus eight single-line engraving fonts. Click existing text to edit it.</td></tr>
<tr><td>Measure</td><td><kbd>M</kbd></td><td>Drag between two points for distance, X/Y difference and angle, shown in the status bar. Shift constrains to 45°. Nothing is added to the design.</td></tr>
<tr><td>Envelope</td><td><kbd>W</kbd></td><td>Distort a text object by dragging the corners and edge midpoints of its box. See below.</td></tr>
<tr><td>Pan</td><td>—</td><td>Or hold Space, or use the middle mouse button, with any tool.</td></tr>
</table>
<h4>Fill style: scan lines or offset</h4>
<p>A Fill layer can be burned two ways.</p>
<p><b>Scan lines</b> sweep back and forth like a printer, spaced by the line interval. This is the usual choice and the faster one for solid areas.</p>
<p><b>Offset</b> follows the outline inward in concentric rings, again spaced by the line interval. The head is always travelling along an edge instead of reversing at the end of every row, which on a diode often marks more evenly, and it leaves a grain that follows the shape rather than running straight across it. Good for lettering and badges; slower on large solid areas.</p>
<p>Rings are measured from the original outline each time rather than from the previous ring, so the spacing cannot drift as they accumulate. The innermost ring stops before it collapses to nothing.</p>

<h4>Fill order</h4>
<p>By default a scan row crosses every shape at that height before moving down — efficient, but the head keeps hopping between objects, and each one is only finished at the very end.</p>
<p><b>Finish each shape before the next</b> fills one object completely, then moves on. In a two-square test this cut trips between the shapes from 30 to 1, burning exactly the same amount of material.</p>
<p>It is not automatically faster. The same test showed rapid travel rising from 43 mm to 130 mm, because every row now needs its own return move instead of sweeping straight through. It is worth using when shapes sit far apart, or when you want each piece finished before the next is started; it costs time when they are close together.</p>

<h4>Tabs: stopping parts falling out</h4>
<p>A part that is fully cut free can drop into the machine, tip up into the beam and scorch, or shift on a later pass and ruin its own edge. <b>Tabs</b> leave small uncut bridges that hold each piece in the sheet until you snap it out by hand.</p>
<p>On a Line layer, set <b>Tabs</b> to the number of bridges per shape and <b>Tab size</b> to how long each one is. Four tabs of 0.5 mm suits small plywood parts; heavier material or bigger pieces want more, or longer. They are spaced evenly around each closed shape, positioned so one never lands on the start point.</p>
<p>Only closed shapes get tabs — an open line has nothing to fall out of. If a shape is so small that the bridges would leave less than half its outline actually cut, it is cut normally instead and the job warns you, rather than producing a part that never comes free.</p>
<p>With several passes, every pass leaves the same bridges in the same places, so a later pass cannot cut through an earlier one's tab.</p>

<h4>Lead in and lead out: keeping the edge clean</h4>
<p>Where the beam first pierces the material it dwells a moment longer than anywhere else, and leaves a mark — a wider notch, a scorch, a blob of melted acrylic. If the cut starts on the outline of your part, that mark is on the finished edge.</p>
<p>A <b>lead</b> moves it off the part. The cut begins out in the waste, travels in to meet the outline, goes round, and on a <b>lead out</b> runs back off into the waste again. The blemish ends up on the offcut.</p>
<p>Set <b>Lead in</b> and <b>Lead out</b> on a Line layer. Two or three millimetres is plenty on thin material; thicker stock and slower cuts want more. Either can be used without the other — a lead in alone is the common case, since the pierce mark is the worse of the two.</p>
<table class="tbl">
<tr><th>Lead shape</th><th>When</th></tr>
<tr><td><b>Straight</b></td><td>Comes in at an angle you set. Simple, short, and fine for most work. The angle is measured from the cut direction; 45° is a good default and 90° comes straight in from the side.</td></tr>
<tr><td><b>Arc</b></td><td>Curves in and meets the outline tangentially, so the head never changes direction abruptly at the join. Kinder to thick material and fast cuts, where a sharp corner at the start can leave its own mark.</td></tr>
</table>
<p><b>Which side the lead goes is worked out for you.</b> On the outline of a part the waste is outside, so the lead swings outward; in a hole the waste is inside, so it swings inward. That is the same nesting rule the kerf offset uses, and it means a lead never cuts into the piece you are keeping.</p>
<p>Leads apply to <b>closed shapes only</b>. An open line has no finished edge to protect, and a lead would simply extend the cut past where you drew it.</p>
<p>They work with tabs: the lead in attaches to the start of the first bridge-to-bridge run and the lead out to the end of the last, so you still get one lead per shape rather than one per run.</p>
<p>Remember the lead needs somewhere to go. A part nested hard against its neighbour has no waste to lead into — leave a few millimetres between parts, or shorten the lead.</p>

<h4>Kerf: making parts actually fit</h4>
<p>The beam removes material either side of the line it follows. Cut a 20 mm disc exactly on its outline and it comes out around 19.8 mm; cut a 20 mm hole and it comes out about 20.2 mm. That is why a peg and its socket drawn the same size do not fit.</p>
<p>Set <b>Kerf</b> on a Line layer to the width your beam removes — typically 0.1–0.3 mm on a diode, more on CO₂, and worth measuring rather than guessing. Crafter Studio then moves the cut path by half that figure: <b>outward on outlines, inward on holes</b>, so the finished edge lands on the line you drew.</p>
<p>Nesting is worked out automatically. A hole inside a part shrinks; a part sitting inside that hole grows again. Open paths are left alone, because "inside" means nothing for a shape that is not closed.</p>
<p>The offset is applied while the job is built, never to your drawing. Change the figure or set it back to zero and the original geometry returns exactly — nothing is baked in.</p>
<p>To measure your kerf: cut a 20 mm square, measure the piece that falls out, and subtract from 20. That difference is the kerf.</p>

<h4>Cleaning up imported paths</h4>
<p>Traced bitmaps and DXF exports often arrive with thousands of nodes, or with contours that look closed but are not — and an open contour will not fill, it only outlines.</p>
<ul>
<li><b>Object → Simplify Paths</b> reduces node count. The tolerance bounds the curve-fitting error rather than the overall shape, so a path can move a little further than the figure you give. The result reports how much the enclosed area changed, and warns if that is more than a couple of percent — undo and lower the tolerance if the part has to fit something.</li>
<li><b>Object → Join Open Paths</b> welds endpoints that sit within a gap tolerance of each other, then closes any contour whose own two ends meet. This is the usual fix for a DXF that will not fill.</li>
<li><b>Object → Close Paths</b> forces the selection closed regardless of gap size, for when you know the contour is meant to be solid.</li>
</ul>

<h4>QR codes and 2D codes</h4>
<p><i>Object → Insert 2D Code</i> generates <b>QR Code</b>, <b>Data Matrix</b>, <b>GS1 Data Matrix</b>, <b>Aztec</b> and <b>Micro QR</b> as real vector geometry — not a pasted image — so they engrave crisply at any size.</p>
<p>The dialog previews the code as you type and reports the <b>module size</b>, which is the figure that decides whether it will scan. Below about 0.35 mm per module a diode spot bridges neighbouring modules and the code stops reading; you are warned when that happens. Either enlarge the code or shorten the content — a shorter URL needs fewer modules, so it reads at a smaller size.</p>
<p>The <b>quiet zone</b> is the blank margin scanners need in order to find the symbol. It is left empty rather than drawn, but it is included in the reported overall size, so leave that much clear space around the code.</p>
<p>Put codes on a <b>Fill</b> layer so the dark modules engrave solid. Dark-on-light contrast matters as much as size: scan a test piece before running a batch.</p>

<h4>Single-line fonts</h4>
<p>The font list begins with eight <b>single line</b> faces. These are engraving fonts: each letter is one open stroke down the middle rather than a closed outline, so the laser traces it once instead of drawing a boundary and filling it. The same word is roughly <b>60% less travel</b>, which means noticeably faster engraving and far less burn-in on wood.</p>
<p>Put them on a <b>Line</b> layer. On a Fill layer there is no enclosed area to fill, so almost nothing comes out.</p>
<p>They cover printable ASCII only. If a character is missing the text is refused with a message naming the problem, rather than quietly dropping letters. For accents or non-Latin scripts use a normal outline font.</p>

<h4>Curving text on an arc</h4>
<p>Open the <b>Text</b> dialog and set <b>Arc</b> to an angle. 0° is straight; the angle is how many degrees of a circle the words span, so a bigger number means a tighter curve.</p>
<ul>
<li><b>Positive</b> bends the text over the top of a circle.</li>
<li><b>Negative</b> bends it under the bottom. Either way it still reads left to right with the letters upright, which is what you want for a badge: the name arched over the top, the year curved under the bottom.</li>
<li><b>Read along the inside</b> puts the lettering on the inner face of the circle instead.</li>
</ul>
<p>Letter spacing along the baseline is preserved as it bends, so words do not crowd or stretch as you change the angle. An arc and an envelope can be combined — the arc is applied first.</p>

<h4>Text on a path</h4>
<p>Draw the curve you want the text to follow, select both the text and that curve, then choose <i>Object → Fit Text to Path</i>. The text flows along the line, leaning with it and standing upright relative to it.</p>
<p><b>Start at</b> moves the text along the guide, so you can centre it or push it past a corner. <b>Side</b> flips it to the other side of the line, reading the other way — the usual choice for the bottom half of a circular badge.</p>
<p>The guide's shape is stored with the text, not a link to the object, so you can delete or move the curve afterwards and the text keeps its form. Changing the wording re-flows it along the same shape. <i>Remove from path</i> puts it back to a straight line.</p>
<p>The guide itself is still an ordinary object and will be cut unless you deal with it: put it on a layer with Output switched off, or delete it once you are happy.</p>
<p>Text longer than its guide piles up at the far end rather than running off into nothing — shorten the text, lengthen the path, or reduce the size.</p>

<h4>Variable text: names, serials and dates</h4>
<p>Engraving fifty name tags by retyping the name fifty times is how mistakes get made. Instead, type the text once with <b>placeholders</b> in it and let Crafter Studio fill them in.</p>
<p>Any text object can contain placeholders — outline fonts and single-line fonts both work, and they can be arced, enveloped or flowed along a path like any other text.</p>
<table class="tbl">
<tr><th>Placeholder</th><th>Becomes</th></tr>
<tr><td><code>{{Name}}</code></td><td>The <b>Name</b> column of the loaded CSV. Any column name works, matched ignoring capitals.</td></tr>
<tr><td><code>{{serial}}</code></td><td>A running number, with its own start, step and zero padding.</td></tr>
<tr><td><code>{{index}}</code> / <code>{{count}}</code></td><td>The current row number and the total — <code>{{index}} of {{count}}</code> gives “3 of 50”.</td></tr>
<tr><td><code>{{date}}</code> / <code>{{time}}</code></td><td>Today as 2026-10-16, and the time as 14:05.</td></tr>
<tr><td><code>{{date:DD/MM/YYYY}}</code></td><td>A date in your own format: <code>YYYY</code>, <code>YY</code>, <code>MM</code>, <code>DD</code>, <code>HH</code>, <code>mm</code>, <code>ss</code>.</td></tr>
</table>
<p>Open <i>Object → Variable Text…</i> to load the data and step through it. <b>Load CSV…</b> takes a spreadsheet export — the first line is the column names, and quoted fields with commas inside them are handled. The dialog lists the columns it found as ready-made placeholders, and previews what each text object currently says.</p>
<p><b>Prev</b> and <b>Next</b> move to another row and immediately rebuild every piece of variable text on the canvas, so what you see is what will burn. Rows wrap around at either end.</p>
<p>The object stays anchored on the edge it is aligned to — left-aligned text keeps its left edge, centred text keeps its centre — so a longer name grows outwards instead of dragging a row of tags out of line.</p>
<p>A placeholder that matches nothing is <b>left on the workpiece as written</b>, braces and all, and the dialog names it. That is deliberate: engraving a blank where a name should be looks like a finished tag, whereas <code>{{Nmae}}</code> burnt into the wood tells you immediately what went wrong.</p>
<p>The usual batch routine: load the CSV, check the preview, run the job, swap the workpiece, press <b>Next</b>, run again. Serial numbers follow the row, so row 1 with a start of 100 and a step of 5 gives 100, 105, 110 — pad to 4 digits for <code>0100</code>.</p>

<h4>Enveloping text</h4>
<p>Pick the <b>Envelope</b> tool (<kbd>W</kbd>) with a text object selected, or <i>Object → Envelope Text</i>. Eight handles appear around the text:</p>
<ul>
<li><b>Round handles at the four corners</b> stretch, skew and throw the text into perspective — pull one end narrower than the other and the lettering recedes.</li>
<li><b>Square handles at the middle of each edge</b> bow that edge, so you can arch a word over a curve or swell it into a banner shape.</li>
</ul>
<p>Moving a corner carries its edge midpoints along, so edges you have not deliberately bowed stay straight.</p>
<p>The distortion is stored with the text rather than baked into the outlines, so you can reopen the Text dialog afterwards, change the wording or the font, and the same shape is re-applied to the new letters. <i>Object → Reset Envelope</i> puts it back to a plain rectangle.</p>
<p>Corners cannot be dragged past each other: an envelope that folded over itself would turn the letters inside out, so the shape simply stops following your cursor at that point.</p>
<p>Rotate by dragging from outside a corner handle; Shift snaps the angle. Arrow keys nudge 1 mm, Shift 10 mm, Alt 0.1 mm. <kbd>%</kbd> toggles snap to grid.</p>` },

  {
    id: 'objects', title: 'Arranging and combining', body: `
<p>The <b>Object</b> tab shows exact position and size for the selection, so you can type dimensions rather than eyeball them. <b>Lock proportions</b> keeps the aspect ratio.</p>
<h4>Path operations</h4>
<ul>
  <li><b>Union</b> (Ctrl+<kbd>+</kbd>) merges shapes, <b>Difference</b> (Ctrl+<kbd>-</kbd>) subtracts the top from the bottom, plus Intersection, Exclusion and Divide.</li>
  <li><b>Offset path</b> grows or shrinks a shape by a distance — useful for cut allowance or a border round lettering.</li>
  <li><b>Combine</b> (Ctrl+K) makes several paths one compound path, so an enclosed shape becomes a hole rather than a separate cut. <b>Break apart</b> reverses it.</li>
  <li><b>Group</b> (Ctrl+G) keeps objects together for moving without merging their geometry.</li>
</ul>
<h4>Arrays and alignment</h4>
<p><b>Grid array</b> repeats the selection in rows and columns with a gap; <b>Circular array</b> spaces copies round a radius and can rotate each one. Alignment and distribution buttons sit in the top bar and the Object tab, and can align to the selection or to the work area.</p>
<p>Stacking order: Home and End send to front and back, PageUp and PageDown move one step.</p>` },

  {
    id: 'import', title: 'Importing files', body: `
<p><i>File → Import</i> (Ctrl+I), or drag a file straight onto the canvas.</p>
<ul>
  <li><b>SVG</b> — read at real size when the file declares units, and colours are matched to the nearest palette layer, so a drawing prepared with separate cut and engrave colours arrives on separate layers.</li>
  <li><b>DXF</b> — lines, polylines with bulges, arcs, circles, ellipses, splines and blocks.</li>
  <li><b>Images</b> — PNG, JPG, BMP, GIF and WebP, for engraving or tracing.</li>
</ul>
<p>If an imported drawing is the wrong size, the file probably had no unit information. Set the size numerically in the Object tab.</p>
<p><i>File → Export SVG</i> writes the design back out at true size — the route for Ruida and other machines Crafter Studio cannot drive directly.</p>` },

  {
    id: 'images', title: 'Images and tracing', body: `
<p>Select an image and the <b>Object</b> tab gains an Image section: brightness, contrast, gamma and invert, plus ten dithering modes.</p>
<ul>
  <li><b>Dithering</b> turns a photograph into dots the laser can reproduce, since a diode laser is mostly on or off. Try Floyd–Steinberg or Jarvis for photographs, and threshold for line art.</li>
  <li><b>Grayscale variable power</b> instead varies power per pixel. It needs a machine that responds smoothly to power changes, but avoids the dotted look.</li>
  <li><b>Trace image</b> (<i>Object → Trace Image</i>) converts an image to vector outlines you can cut, with threshold and smoothing controls. Best on high-contrast artwork, not photographs.</li>
</ul>
<p>Images burn on a layer whose mode is <b>Image</b>. Line interval controls how close the scan lines are: smaller is finer and slower.</p>` },

  {
    id: 'library', title: 'The library', body: `
<p>The <b>Library</b> tab holds built-in laser art — shapes, frames, mandalas, Indian motifs, nature, celebration and festival designs — plus thousands of searchable line and solid icons. Click to insert, or drag onto the canvas.</p>
<p>Line art can come in as centre lines (a single cut following the stroke) or outlined strokes (a closed shape of the stroke's width). Centre lines suit scoring; outlines suit cutting or filling.</p>
<p><b>My Library</b> stores your own SVG, DXF and images, and anything you save from a selection, so parts you reuse are one click away.</p>` },

  {
    id: 'layers', title: 'Layers: how burning is controlled', body: `
<p>This is the part that decides what the laser actually does. Crafter Studio uses 30 colour layers in the style LightBurn users will recognise: an object's colour chooses its layer, and the layer carries the settings.</p>
<p>Assign a layer by selecting objects and clicking a colour in the bottom palette.</p>
<h4>Layer settings</h4>
<table class="tbl">
<tr><th>Setting</th><th>What it does</th></tr>
<tr><td><b>Mode</b></td><td><b>Line</b> follows the outline — cutting and scoring. <b>Fill</b> scans back and forth to clear an area — engraving. <b>Image</b> is for raster pictures.</td></tr>
<tr><td><b>Power</b></td><td>Percentage of your laser's output.</td></tr>
<tr><td><b>Min power</b></td><td>The floor used when power varies with speed (M4) or across greys.</td></tr>
<tr><td><b>Speed</b></td><td>mm/min. Slower burns deeper.</td></tr>
<tr><td><b>Passes</b></td><td>Repeats. Several lighter passes usually cut cleaner than one hot pass.</td></tr>
<tr><td><b>Line interval</b></td><td>Spacing between scan lines in Fill and Image. Smaller is finer and slower.</td></tr>
<tr><td><b>Scan angle</b></td><td>Direction of fill lines. Changing it can hide banding or follow the grain.</td></tr>
<tr><td><b>Bidirectional</b></td><td>Burns in both directions — faster, but slight misalignment shows as ghosting.</td></tr>
<tr><td><b>Overscan</b></td><td>Runs past each end so the head is at full speed before firing, avoiding dark edges.</td></tr>
<tr><td><b>Air assist</b></td><td>Emits M8/M9 for this layer, if your machine profile allows it.</td></tr>
<tr><td><b>Output</b></td><td>Off means the layer is designed but not burned.</td></tr>
<tr><td><b>Show</b></td><td>Hides the layer on screen without changing whether it burns.</td></tr>
</table>
<p>Layer order is run order, top to bottom. Engrave before you cut: once a part is cut free it can shift.</p>
<h4>Per-object overrides</h4>
<p>The <b>Object</b> tab can override power, speed and passes for the selected objects alone, without creating another layer — handy for one deeper cut among many.</p>` },

  {
    id: 'materials', title: 'Material settings', body: `
<p><i>Machine → Material Library</i> lists starting points by laser class — diode by wattage, CO₂, fiber — covering wood, acrylic, leather, paper, slate, glass, metals and 3D-printing filaments. <b>Apply</b> puts a row's settings onto the active layer, and you can save your own as presets.</p>
<p>Rows marked as never-laser materials cannot be applied. PVC and anything chlorinated release chlorine gas, which ruins the machine and is dangerous to breathe.</p>
<h4>Material test generator</h4>
<p><i>Machine → Material Test Generator</i> builds a grid of squares with power increasing across and speed down, each carrying its own settings, optionally labelled. Run it on scrap, look at which square is right, and use those numbers.</p>
<p>This is the fastest way to settings that actually work for your machine and your material, and it is worth doing for every new sheet.</p>` },

  {
    id: 'preview', title: 'Previewing the toolpath', body: `
<p><b>Preview</b> in the top bar (Alt+P) replaces the canvas with the path the head will follow, in run order, including travel moves between cuts. Scrub through it to see the sequence and the estimated job time.</p>
<p>Worth checking before every real job. It catches shapes on the wrong layer, cuts ordered so parts fall out early, an engrave that follows a cut, and fills that are far slower than expected.</p>
<p>Crafter Studio cuts inner shapes before outer ones and orders paths to shorten travel, but it cannot know which parts hold your work together.</p>` },

  {
    id: 'camera', title: 'Camera alignment', body: `
<p>A camera pointed at the bed lets you see the real material behind your design, so a badge can be placed on the offcut that is actually there rather than on a guess. Set it up with <i>Machine → Camera Alignment</i>, and switch it on and off with <kbd>Alt</kbd>+<kbd>C</kbd>.</p>
<div class="note warn"><b>The overlay is a guide, not a measurement.</b> It is as accurate as the points you marked and the lens correction you dialled in, and it cannot see that the material has shifted since the last picture. Frame the job before cutting and judge the position from the frame, not from the photograph.</div>

<h4>Setting it up</h4>
<p>Mount the camera so it can see the whole bed and will not be knocked — the calibration describes one fixed viewpoint, and moving the camera afterwards invalidates it. Then:</p>
<ol>
<li>Pick the camera. The picture appears straight away and keeps moving, so you can aim it.</li>
<li>Drag <b>Straighten</b> until the bed edges look straight. Webcams bow straight lines outwards; this undoes it. A camera that already looks straight stays at 0.</li>
<li>Click the four <b>bed corners</b> in the picture — top-left, top-right, bottom-right, bottom-left, matching the work area on the canvas. Drag any mark to nudge it.</li>
<li><b>Use this camera</b> saves it and turns the overlay on.</li>
</ol>
<p>Mark the corners as precisely as you can: every later position comes from those four clicks, so a corner placed a few pixels out tilts the whole picture. Zoom the window if that helps.</p>

<h4>When the corners are not visible</h4>
<p>On a big machine, or with the camera close in, the bed corners may be out of frame or hidden under the gantry. Switch <b>Points are</b> to <i>At coordinates I type</i>, put four marks on the bed — engrave four small crosses on a scrap sheet, or use the corners of a taped-down template — and type where each one is in millimetres. Any four points will do as long as you know where they are and they do not sit in a line.</p>

<h4>Reading the result</h4>
<p>The picture is laid under your design, inside the work area and under the grid, so the design always stays readable on top of it. <b>Opacity</b> fades it back if it competes with your artwork.</p>
<p><b>Live</b> keeps the picture refreshing twice a second while the overlay is on, which is what you want while sliding material around. Without it the picture is a still, and <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> takes a new one — the lighter option if the camera is a cheap one or the machine is busy.</p>
<p>The overlay is never part of your project. It is not saved into the file, not exported to SVG, and never reaches the G-code — it cannot be selected or burnt by accident.</p>
<p>The camera is only held open while the overlay is on. Turning it off releases it, so another program can use it.</p>

<h4>If it does not line up</h4>
<ul>
<li><b>Four points that cross over</b> are refused outright: the outline joining your marks turns red and the fit is rejected. That is almost always a corner clicked out of order.</li>
<li><b>Straight in the middle, drifting at the edges</b> means the lens correction is wrong. Adjust <b>Straighten</b> and re-mark the corners.</li>
<li><b>Everything shifted</b> usually means the camera moved. Recalibrate; there is no way to recover a viewpoint that has changed.</li>
<li><b>A warning that the camera opened at a different size</b> than it was calibrated at means the marks were rescaled to fit. That is usually right, but check it before relying on it.</li>
<li><b>“The camera is already in use”</b> — close the other program, including a video call, and try again.</li>
</ul>` },

  {
    id: 'rotary', title: 'Rotary axis', body: `
<p>A rotary attachment turns the workpiece instead of moving the bed, so a design wraps around a cylinder — a tumbler, a pen, a ring. Set it up under <b>Machine → Rotary</b>.</p>
<div class="note warn"><b>Not verified against hardware.</b> This output has been checked mathematically but never run on a real rotary. Before cutting anything, frame the job with the laser off and confirm the object turns as far as you expect.</div>
<h4>What the numbers mean</h4>
<p>Height in your design becomes distance <i>around</i> the object. A design <b>188.5 mm</b> tall wraps exactly once around a 60 mm diameter object, because that is its circumference (π × 60). Make the design taller than the circumference and it will wrap over itself.</p>
<table class="tbl">
<tr><th>Setting</th><th>What it is</th></tr>
<tr><td>Object ⌀</td><td>Diameter of the item being engraved, at the point the laser hits it. This is what converts design height into rotation, so measure it rather than guessing.</td></tr>
<tr><td>Output on</td><td><b>Y axis</b> if the rotary is plugged into the Y motor and your controller still thinks in millimetres. <b>A axis</b> if your firmware has a real fourth axis taking degrees — 3-axis GRBL builds ignore A moves entirely.</td></tr>
<tr><td>Per full turn</td><td>Y-axis mode only: how much Y travel produces one complete revolution. Measure it once by jogging, or work it out from the axis steps per mm and steps per revolution.</td></tr>
</table>
<h4>While rotary is on</h4>
<ul>
<li>Homing only seeks X. Homing a rotary axis would drive it into nothing.</li>
<li>Return-to-origin only returns X, for the same reason.</li>
<li>The generated file carries a header recording the diameter, the circumference and the exact conversion used, so you can check what was assumed.</li>
</ul>
<p>The toolpath preview still draws the job flat. It shows what will be engraved, not how it wraps.</p>` },

  {
    id: 'running', title: 'Running a job over USB', body: `
<p>The <b>Machine</b> tab drives the machine directly for ${direct}.</p>
<ol>
  <li><b>Connect</b> and pick the serial port. On Linux you may need to be in the <code>dialout</code> group; on Windows, the CH340 or CP210x driver.</li>
  <li><b>Home</b> if your machine has limit switches, or jog to a corner and <b>Set origin</b> if it does not.</li>
  <li><b>Jog</b> with the arrows at your chosen step size to position the head.</li>
  <li><b>Test fire</b> briefly pulses the laser at low power so you can see exactly where the beam lands.</li>
  <li><b>Frame</b> traces the job's bounding box at low power to confirm placement.</li>
  <li><b>Start</b> (F5) streams the job with live progress. <b>Pause</b> holds position; <b>Stop</b> halts and turns the laser off.</li>
</ol>
<h4>Where the job starts</h4>
<p><b>Absolute</b> uses machine coordinates — the design burns where it sits on the canvas. <b>Current position</b> treats wherever the head is now as the job's anchor, with a nine-point selector choosing which part of the design that anchor is. Current position suits machines without homing.</p>
<p>The console shows everything sent and received, which is the first place to look when a machine misbehaves.</p>
<p class="note warn">Stop is software. It halts the stream and turns the laser off, but it is not a substitute for a hardware emergency stop or for staying with the machine.</p>` },

  {
    id: 'export', title: 'Exporting G-code and job files', body: `
<p><i>File → Export G-code</i> (Ctrl+E) writes <code>.gcode</code>, <code>.nc</code> or <code>.gc</code> for ${direct} — the route if you run from an SD card or another sender.</p>
<p>Output is generated for your profile's firmware and Max S value, inner shapes before outer, paths ordered to shorten travel, with your start and end G-code wrapped around it. The estimated time appears before you save.</p>
<p>For Trocen, TopWisdom, EZCAD galvo and cloud machines, use <i>File → Export SVG</i> and open that in the manufacturer's software or LightBurn. The design keeps its true size and layer colours.</p>

<h4>Ruida job files</h4>
<div class="note warn"><b>Not verified against hardware.</b> Crafter Studio has never been run against a Ruida controller, and no published specification for the format exists — it is written from the community's reverse-engineering notes. Open the file in RDWorks or LightBurn first and look at it. If the file will not open at all, nothing is lost; the danger would be a file that opens and is subtly wrong, which is exactly what looking at it catches.</div>
<p><i>File → Export Ruida .rd</i> writes a job file for the DSP controllers in most larger CO₂ machines — Monport, OMTech, Thunder, Aeon, Boss, Kern and others. Load it from a USB stick, or through RDWorks.</p>
<p>The advantage over exporting SVG is that the job is already planned: your layers arrive with their speed, power range and colour, in run order, with fills already converted to scan lines. An SVG arrives as bare outlines and the settings have to be entered again at the other end.</p>
<p>Before the file is written you are shown what is <i>in</i> it. Those figures are read back out of the finished bytes rather than copied from the plan that produced them, so if the writer were wrong the wrong numbers would appear there. Check the speeds, the power ranges and the extent against what you expect.</p>
<table class="tbl">
<tr><th>Thing to know</th><th>Why</th></tr>
<tr><td>Passes are already expanded</td><td>Three passes means the geometry appears three times in the file and the layer says one pass. Do not also set a repeat count on the machine.</td></tr>
<tr><td>Rotary is the controller's job</td><td>If Crafter Studio's rotary is switched on, the file is still written flat and you are warned. Set the rotary up on the machine instead.</td></tr>
<tr><td>Eight layers on the panel</td><td>More than eight will be in the file but may not all be listed on the controller's display.</td></tr>
<tr><td>Scramble key</td><td>The file is obfuscated with a key, normally 136 (0x88). A few vendors use a different one. If the machine rejects an otherwise good file, this is the setting to try.</td></tr>
</table>
<p>Driving a Ruida machine directly over the network is <b>not</b> supported and is not planned without a machine to test against. A controller runs an uploaded job from its own memory, so unlike a G-code sender there is no stopping it by closing the connection — that is not something to ship on a guess.</p>` },

  {
    id: 'ai', title: 'AI features', body: `
<p>Optional, and off until you add your own API key. The <b>AI</b> tab offers three things.</p>
<ul>
  <li><b>Generate a design</b> — describe a piece and get vector geometry placed on the canvas at the size you asked for.</li>
  <li><b>Change the selection</b> — select objects and describe an edit in plain language. Ctrl+Z restores the original.</li>
  <li><b>Suggest material settings</b> — describe a material and get power, speed and passes for your machine's actual wattage, which you can apply to a layer or save as a preset.</li>
</ul>
<p>Generated work is coloured so it lands on the right layers automatically: black engraves, blue cuts, red scores.</p>
<h4>Providers</h4>
<p>Anthropic, any OpenAI-compatible endpoint, or <b>Local (Ollama)</b>, which runs entirely on your machine, needs no key and sends nothing anywhere. Crafter Studio reads your installed Ollama models and lists them.</p>
<p>Keys are encrypted with the system keyring where one is available, kept outside your project files, and sent only to the provider you chose.</p>
<p class="note warn">AI output is a starting point, not a verified design. Check the geometry and test the settings on scrap — a wrong power suggestion can start a fire.</p>` },

  {
    id: 'safety', title: 'Safety', body: `
<p class="note warn">A laser cutter can blind you and can start a fire that spreads in seconds. None of this is optional.</p>
<ul>
  <li><b>Eye protection</b> rated for your laser's wavelength, worn by everyone in the room. Diode and CO₂ need different glasses. The tinted lid of an enclosure is not enough on its own.</li>
  <li><b>Never leave a running machine.</b> Most laser fires start during a normal job and take under a minute to become serious.</li>
  <li><b>A fire extinguisher within reach</b>, and ideally a damp cloth for small flare-ups.</li>
  <li><b>Extraction.</b> Burning anything produces smoke and fine particles. Vent outside or filter properly; an open window is not extraction.</li>
  <li><b>Never cut PVC, vinyl or anything chlorinated.</b> It releases chlorine gas, which corrodes the machine and harms you. If you are unsure what a plastic is, do not cut it.</li>
  <li><b>Watch for flare-ups</b> on thin wood, paper, cardboard and acrylic offcuts, and clear debris from the bed between jobs.</li>
  <li><b>Test on scrap first.</b> Every machine, lens, sheet and batch differs.</li>
</ul>
<p>Settings in the material library and anything the AI suggests are starting points, not verified values. You are responsible for what your machine does.</p>` },

  {
    id: 'trouble', title: 'Troubleshooting', body: `
<table class="tbl">
<tr><th>Problem</th><th>Where to look</th></tr>
<tr><td>Output mirrored or rotated</td><td>Machine origin corner in the machine profile.</td></tr>
<tr><td>Everything the wrong size</td><td>Work area dimensions, or an imported file with no unit information.</td></tr>
<tr><td>Cannot connect</td><td>Cable and power, the CH340/CP210x driver on Windows, membership of <code>dialout</code> on Linux, and that no other program holds the port.</td></tr>
<tr><td>Connects, then drops</td><td>Often a soft reset rebooting an ESP32 board. Check the console for a restart banner.</td></tr>
<tr><td>Laser fires but does not mark</td><td>Power too low, speed too high, or focus. Run a material test.</td></tr>
<tr><td>Cuts do not go through</td><td>More passes before more power. Check focus and that the material is flat.</td></tr>
<tr><td>Engraving looks banded</td><td>Turn off bidirectional, or enable overscan.</td></tr>
<tr><td>Job runs off the bed</td><td>Frame first. Check job origin — Absolute versus Current position — and the anchor point.</td></tr>
<tr><td>Nothing burns on a layer</td><td>Output is off for that layer, or the objects sit on a different layer than you think.</td></tr>
<tr><td>Settings look reset</td><td>A second copy of Crafter Studio was open. It now focuses the existing window instead.</td></tr>
</table>
<p>Still stuck? <i>Help → Report a Problem</i> fills in your version and machine automatically.</p>` }
];
