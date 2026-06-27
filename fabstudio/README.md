# 🛠️ FabStudio - Digital Fabrication Design Tool

A powerful web-based design application for creating and exporting designs compatible with laser engraving, cutting, 3D printing, CNC machining, and injection moulding.

## Features

### Drawing & Editing Tools
- **Select Tool** - Move, resize, and rotate objects
- **Draw Tool** - Freehand drawing with customizable stroke
- **Pen Tool** - Create smooth paths and curves
- **Shape Tools** - Add rectangles, circles, triangles, and polygons
- **Text Tool** - Add editable text to your designs

### Customization Options
- Adjustable stroke color and width
- Fill color options (solid or transparent)
- Real-time preview on canvas
- Multi-object selection and manipulation

### Export Formats
FabStudio supports all major digital fabrication formats:

1. **SVG** (Scalable Vector Graphics)
   - Perfect for laser cutting and engraving
   - Compatible with LightBurn, LaserGRBL, and other laser software
   - Vector format maintains quality at any scale

2. **DXF** (Drawing Exchange Format)
   - Industry standard for CNC machining
   - Compatible with AutoCAD, Fusion 360, and CAM software
   - Precise vector data for manufacturing

3. **STL** (Stereolithography)
   - Standard format for 3D printing
   - Converts 2D shapes to 3D meshes
   - Compatible with Cura, PrusaSlicer, and other slicers

4. **G-code**
   - Direct machine instructions
   - Ready for CNC routers, laser cutters, and 3D printers
   - Customizable feed rates and spindle speeds

5. **PNG/JPEG**
   - Raster image formats
   - Useful for documentation and previews
   - High-quality exports

6. **ZIP Bundle**
   - Download all formats at once
   - Convenient for sharing and archiving

## Installation

### Prerequisites
- Node.js (v18 or higher)
- npm (v8 or higher)

### Setup

```bash
# Navigate to the project directory
cd fabstudio

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Usage

1. **Open the Application**
   - Run `npm run dev` and open http://localhost:3000 in your browser

2. **Create Your Design**
   - Use the toolbar to select tools and add shapes
   - Draw freehand or use geometric shapes
   - Adjust colors and stroke width as needed

3. **Edit Objects**
   - Select objects to move, resize, or rotate them
   - Delete unwanted objects with the Delete button
   - Clear the entire canvas if starting over

4. **Export Your Design**
   - Click the Export button
   - Choose your desired format(s)
   - Download the file(s) for use in your fabrication software

## Technology Stack

- **React** - UI framework
- **Fabric.js** - Canvas manipulation library
- **Vite** - Build tool and dev server
- **JSZip** - ZIP file generation
- **FileSaver.js** - File download handling

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Tips for Different Manufacturing Methods

### Laser Cutting/Engraving
- Use SVG format for best results
- Ensure all paths are closed for cutting
- Adjust stroke width to control engraving depth
- Use high contrast colors for engraving areas

### CNC Machining
- Export as DXF for CAD/CAM software compatibility
- Keep designs within machine work area
- Consider tool diameter when designing sharp corners
- Use appropriate feed rates in G-code

### 3D Printing
- STL files work best with most slicers
- Designs are exported as flat surfaces (can be extruded in slicer)
- Consider wall thickness for structural integrity
- Check manifold geometry before printing

### Injection Moulding
- Use DXF or SVG for mold design
- Include draft angles in your CAD software
- Consider material shrinkage
- Design for manufacturability (DFM) principles

## License

ISC

## Support

For issues and feature requests, please create an issue in the repository.

---

**FabStudio** - Empowering makers, engineers, and designers to create amazing things!
