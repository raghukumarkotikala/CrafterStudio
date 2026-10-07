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
<tr><td>Text</td><td><kbd>T</kbd></td><td>Any installed font, converted to outlines. Click existing text to edit it.</td></tr>
<tr><td>Pan</td><td>—</td><td>Or hold Space, or use the middle mouse button, with any tool.</td></tr>
</table>
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
    id: 'export', title: 'Exporting G-code', body: `
<p><i>File → Export G-code</i> (Ctrl+E) writes <code>.gcode</code>, <code>.nc</code> or <code>.gc</code> for ${direct} — the route if you run from an SD card or another sender.</p>
<p>Output is generated for your profile's firmware and Max S value, inner shapes before outer, paths ordered to shorten travel, with your start and end G-code wrapped around it. The estimated time appears before you save.</p>
<p>For Ruida, Trocen, TopWisdom, EZCAD galvo and cloud machines, use <i>File → Export SVG</i> and open that in the manufacturer's software or LightBurn. The design keeps its true size and layer colours.</p>` },

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
