import React, { useState, useRef, useEffect } from 'react';
import * as fabric from 'fabric';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

const App = () => {
  const canvasRef = useRef(null);
  const [fabCanvas, setFabCanvas] = useState(null);
  const [selectedTool, setSelectedTool] = useState('select');
  const [strokeColor, setStrokeColor] = useState('#00ff00');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fillColor, setFillColor] = useState('transparent');
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedObjects, setSelectedObjects] = useState([]);

  useEffect(() => {
    if (canvasRef.current && !fabCanvas) {
      const canvas = new fabric.Canvas(canvasRef.current, {
        width: canvasSize.width,
        height: canvasSize.height,
        backgroundColor: '#1a1a2e',
        selection: true,
        preserveObjectStacking: true,
      });

      canvas.on('selection:created', handleSelection);
      canvas.on('selection:updated', handleSelection);
      canvas.on('selection:cleared', () => setSelectedObjects([]));
      canvas.on('mouse:down', handleMouseDown);
      canvas.on('mouse:move', handleMouseMove);
      canvas.on('mouse:up', handleMouseUp);

      setFabCanvas(canvas);
    }

    return () => {
      if (fabCanvas) {
        fabCanvas.dispose();
      }
    };
  }, []);

  const handleSelection = (e) => {
    if (e.selected) {
      setSelectedObjects(e.selected);
    }
  };

  const handleMouseDown = (e) => {
    if (selectedTool === 'draw' || selectedTool === 'pen') {
      setIsDrawing(true);
      const pointer = fabCanvas.getPointer(e.e);
      setLastPoint(pointer);

      if (selectedTool === 'pen') {
        const path = new fabric.Path(`M ${pointer.x} ${pointer.y} L ${pointer.x} ${pointer.y}`, {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          fill: '',
          selectable: false,
        });
        fabCanvas.add(path);
        fabCanvas.setActiveObject(path);
      }
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;

    const pointer = fabCanvas.getPointer(e.e);

    if (selectedTool === 'pen' && lastPoint) {
      const activeObj = fabCanvas.getActiveObject();
      if (activeObj && activeObj.type === 'path') {
        activeObj.path.push(['L', pointer.x, pointer.y]);
        activeObj.setCoords();
        setLastPoint(pointer);
        fabCanvas.renderAll();
      }
    } else if (selectedTool === 'draw') {
      if (lastPoint) {
        const line = new fabric.Line([lastPoint.x, lastPoint.y, pointer.x, pointer.y], {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          selectable: false,
        });
        fabCanvas.add(line);
        setLastPoint(pointer);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    setLastPoint(null);
  };

  const addShape = (type) => {
    let shape;
    const center = fabCanvas.getCenter();

    switch (type) {
      case 'rectangle':
        shape = new fabric.Rect({
          left: center.left - 50,
          top: center.top - 50,
          width: 100,
          height: 100,
          fill: fillColor === 'transparent' ? '' : fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        });
        break;
      case 'circle':
        shape = new fabric.Circle({
          left: center.left - 50,
          top: center.top - 50,
          radius: 50,
          fill: fillColor === 'transparent' ? '' : fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        });
        break;
      case 'triangle':
        shape = new fabric.Triangle({
          left: center.left - 50,
          top: center.top - 50,
          width: 100,
          height: 100,
          fill: fillColor === 'transparent' ? '' : fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        });
        break;
      case 'polygon':
        shape = new fabric.Polygon([
          { x: 50, y: 0 },
          { x: 100, y: 75 },
          { x: 100, y: 100 },
          { x: 50, y: 75 },
          { x: 0, y: 100 },
          { x: 0, y: 75 },
        ], {
          left: center.left - 50,
          top: center.top - 50,
          fill: fillColor === 'transparent' ? '' : fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        });
        break;
      default:
        return;
    }

    if (shape) {
      fabCanvas.add(shape);
      fabCanvas.setActiveObject(shape);
      fabCanvas.renderAll();
    }

    setSelectedTool('select');
  };

  const addText = () => {
    const center = fabCanvas.getCenter();
    const text = new fabric.IText('Text', {
      left: center.left - 50,
      top: center.top - 50,
      fontFamily: 'Arial',
      fill: strokeColor,
      fontSize: 24,
    });
    fabCanvas.add(text);
    fabCanvas.setActiveObject(text);
    setSelectedTool('select');
  };

  const deleteSelected = () => {
    const activeObjects = fabCanvas.getActiveObjects();
    if (activeObjects.length > 0) {
      fabCanvas.discardActiveObject();
      activeObjects.forEach((obj) => {
        fabCanvas.remove(obj);
      });
      fabCanvas.renderAll();
      setSelectedObjects([]);
    }
  };

  const clearCanvas = () => {
    if (window.confirm('Are you sure you want to clear the entire canvas?')) {
      fabCanvas.clear();
      fabCanvas.setBackgroundColor('#1a1a2e', fabCanvas.renderAll.bind(fabCanvas));
      setSelectedObjects([]);
    }
  };

  const exportToSVG = () => {
    const svgData = fabCanvas.toSVG();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    saveAs(blob, 'design.svg');
  };

  const exportToDXF = () => {
    const objects = fabCanvas.getObjects();
    let dxfContent = '0\nSECTION\n2\nENTITIES\n';

    objects.forEach((obj) => {
      if (obj.type === 'line') {
        dxfContent += `0\nLINE\n8\n0\n10\n${obj.x1}\n20\n${obj.y1}\n30\n0\n11\n${obj.x2}\n21\n${obj.y2}\n31\n0\n`;
      } else if (obj.type === 'circle') {
        dxfContent += `0\nCIRCLE\n8\n0\n10\n${obj.left + obj.radius}\n20\n${obj.top + obj.radius}\n30\n0\n40\n${obj.radius}\n`;
      } else if (obj.type === 'rect') {
        const x = obj.left;
        const y = obj.top;
        const w = obj.width;
        const h = obj.height;
        dxfContent += `0\nLINE\n8\n0\n10\n${x}\n20\n${y}\n30\n0\n11\n${x + w}\n21\n${y}\n31\n0\n`;
        dxfContent += `0\nLINE\n8\n0\n10\n${x + w}\n20\n${y}\n30\n0\n11\n${x + w}\n21\n${y + h}\n31\n0\n`;
        dxfContent += `0\nLINE\n8\n0\n10\n${x + w}\n20\n${y + h}\n30\n0\n11\n${x}\n21\n${y + h}\n31\n0\n`;
        dxfContent += `0\nLINE\n8\n0\n10\n${x}\n20\n${y + h}\n30\n0\n11\n${x}\n21\n${y}\n31\n0\n`;
      }
    });

    dxfContent += '0\nENDSEC\n0\nEOF\n';

    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    saveAs(blob, 'design.dxf');
  };

  const exportToSTL = () => {
    const objects = fabCanvas.getObjects();
    let stlContent = 'solid design\n';

    objects.forEach((obj) => {
      if (obj.type === 'rect') {
        const x = obj.left || 0;
        const y = obj.top || 0;
        const w = obj.width || 100;
        const h = obj.height || 100;
        const z = 0;
        
        stlContent += generateSTLFacet(x, y, z, x + w, y, z, x + w, y + h, z);
        stlContent += generateSTLFacet(x, y, z, x + w, y + h, z, x, y + h, z);
      } else if (obj.type === 'circle') {
        const cx = obj.left + obj.radius;
        const cy = obj.top + obj.radius;
        const r = obj.radius;
        const segments = 32;

        for (let i = 0; i < segments; i++) {
          const angle1 = (i * 2 * Math.PI) / segments;
          const angle2 = ((i + 1) * 2 * Math.PI) / segments;

          const x1 = cx + r * Math.cos(angle1);
          const y1 = cy + r * Math.sin(angle1);
          const x2 = cx + r * Math.cos(angle2);
          const y2 = cy + r * Math.sin(angle2);

          stlContent += generateSTLFacet(cx, cy, 0, x1, y1, 0, x2, y2, 0);
        }
      }
    });

    stlContent += 'endsolid design\n';

    const blob = new Blob([stlContent], { type: 'model/stl' });
    saveAs(blob, 'design.stl');
  };

  const generateSTLFacet = (x1, y1, z1, x2, y2, z2, x3, y3, z3) => {
    let facet = 'facet normal 0 0 1\nouter loop\n';
    facet += `vertex ${x1} ${y1} ${z1}\n`;
    facet += `vertex ${x2} ${y2} ${z2}\n`;
    facet += `vertex ${x3} ${y3} ${z3}\n`;
    facet += 'endloop\nendfacet\n';
    return facet;
  };

  const exportToGCODE = () => {
    const objects = fabCanvas.getObjects();
    let gcode = '; FabStudio G-code Export\n; Generated for CNC/Laser/3D Printing\nG21 ; Set units to millimeters\nG90 ; Absolute positioning\nM3 S1000 ; Start spindle/laser\n\n';

    objects.forEach((obj) => {
      if (obj.type === 'line') {
        gcode += `G0 X${obj.x1.toFixed(2)} Y${obj.y1.toFixed(2)}\n`;
        gcode += `G1 X${obj.x2.toFixed(2)} Y${obj.y2.toFixed(2)} F1000\n`;
      } else if (obj.type === 'circle') {
        const cx = obj.left + obj.radius;
        const cy = obj.top + obj.radius;
        const r = obj.radius;
        gcode += `G0 X${(cx + r).toFixed(2)} Y${cy.toFixed(2)}\n`;
        gcode += `G2 I${(-r).toFixed(2)} J0 F1000\n`;
      } else if (obj.type === 'rect') {
        const x = obj.left;
        const y = obj.top;
        const w = obj.width;
        const h = obj.height;
        gcode += `G0 X${x.toFixed(2)} Y${y.toFixed(2)}\n`;
        gcode += `G1 X${(x + w).toFixed(2)} Y${y.toFixed(2)} F1000\n`;
        gcode += `G1 X${(x + w).toFixed(2)} Y${(y + h).toFixed(2)}\n`;
        gcode += `G1 X${x.toFixed(2)} Y${(y + h).toFixed(2)}\n`;
        gcode += `G1 X${x.toFixed(2)} Y${y.toFixed(2)}\n`;
      }
    });

    gcode += '\nM5 ; Stop spindle/laser\nM30 ; End program';

    const blob = new Blob([gcode], { type: 'text/plain' });
    saveAs(blob, 'design.gcode');
  };

  const exportAllFormats = async () => {
    const zip = new JSZip();

    zip.file('design.svg', fabCanvas.toSVG());

    const objects = fabCanvas.getObjects();
    let dxfContent = '0\nSECTION\n2\nENTITIES\n';
    objects.forEach((obj) => {
      if (obj.type === 'line') {
        dxfContent += `0\nLINE\n8\n0\n10\n${obj.x1}\n20\n${obj.y1}\n30\n0\n11\n${obj.x2}\n21\n${obj.y2}\n31\n0\n`;
      } else if (obj.type === 'circle') {
        dxfContent += `0\nCIRCLE\n8\n0\n10\n${obj.left + obj.radius}\n20\n${obj.top + obj.radius}\n30\n0\n40\n${obj.radius}\n`;
      } else if (obj.type === 'rect') {
        const x = obj.left;
        const y = obj.top;
        const w = obj.width;
        const h = obj.height;
        dxfContent += `0\nLINE\n8\n0\n10\n${x}\n20\n${y}\n30\n0\n11\n${x + w}\n21\n${y}\n31\n0\n`;
        dxfContent += `0\nLINE\n8\n0\n10\n${x + w}\n20\n${y}\n30\n0\n11\n${x + w}\n21\n${y + h}\n31\n0\n`;
        dxfContent += `0\nLINE\n8\n0\n10\n${x + w}\n20\n${y + h}\n30\n0\n11\n${x}\n21\n${y + h}\n31\n0\n`;
        dxfContent += `0\nLINE\n8\n0\n10\n${x}\n20\n${y + h}\n30\n0\n11\n${x}\n21\n${y}\n31\n0\n`;
      }
    });
    dxfContent += '0\nENDSEC\n0\nEOF\n';
    zip.file('design.dxf', dxfContent);

    let stlContent = 'solid design\n';
    objects.forEach((obj) => {
      if (obj.type === 'rect') {
        const x = obj.left || 0;
        const y = obj.top || 0;
        const w = obj.width || 100;
        const h = obj.height || 100;
        stlContent += generateSTLFacet(x, y, 0, x + w, y, 0, x + w, y + h, 0);
        stlContent += generateSTLFacet(x, y, 0, x + w, y + h, 0, x, y + h, 0);
      } else if (obj.type === 'circle') {
        const cx = obj.left + obj.radius;
        const cy = obj.top + obj.radius;
        const r = obj.radius;
        const segments = 32;
        for (let i = 0; i < segments; i++) {
          const angle1 = (i * 2 * Math.PI) / segments;
          const angle2 = ((i + 1) * 2 * Math.PI) / segments;
          const x1 = cx + r * Math.cos(angle1);
          const y1 = cy + r * Math.sin(angle1);
          const x2 = cx + r * Math.cos(angle2);
          const y2 = cy + r * Math.sin(angle2);
          stlContent += generateSTLFacet(cx, cy, 0, x1, y1, 0, x2, y2, 0);
        }
      }
    });
    stlContent += 'endsolid design\n';
    zip.file('design.stl', stlContent);

    let gcode = '; FabStudio G-code Export\nG21\nG90\nM3 S1000\n\n';
    objects.forEach((obj) => {
      if (obj.type === 'line') {
        gcode += `G0 X${obj.x1.toFixed(2)} Y${obj.y1.toFixed(2)}\nG1 X${obj.x2.toFixed(2)} Y${obj.y2.toFixed(2)} F1000\n`;
      } else if (obj.type === 'circle') {
        const cx = obj.left + obj.radius;
        const cy = obj.top + obj.radius;
        const r = obj.radius;
        gcode += `G0 X${(cx + r).toFixed(2)} Y${cy.toFixed(2)}\nG2 I${(-r).toFixed(2)} J0 F1000\n`;
      } else if (obj.type === 'rect') {
        const x = obj.left;
        const y = obj.top;
        const w = obj.width;
        const h = obj.height;
        gcode += `G0 X${x.toFixed(2)} Y${y.toFixed(2)}\nG1 X${(x + w).toFixed(2)} Y${y.toFixed(2)} F1000\nG1 X${(x + w).toFixed(2)} Y${(y + h).toFixed(2)}\nG1 X${x.toFixed(2)} Y${(y + h).toFixed(2)}\nG1 X${x.toFixed(2)} Y${y.toFixed(2)}\n`;
      }
    });
    gcode += '\nM5\nM30';
    zip.file('design.gcode', gcode);

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'fabstudio_design_pack.zip');
  };

  const ToolButton = ({ tool, icon, label }) => (
    <button
      className={`tool-btn ${selectedTool === tool ? 'active' : ''}`}
      onClick={() => setSelectedTool(tool)}
      title={label}
    >
      <span>{icon}</span>
      <small>{label}</small>
    </button>
  );

  return (
    <div className="app">
      <header className="header">
        <h1>🛠️ FabStudio</h1>
        <p>Digital Fabrication Design Tool</p>
      </header>

      <div className="toolbar">
        <div className="tool-group">
          <ToolButton tool="select" icon="↖️" label="Select" />
          <ToolButton tool="draw" icon="✏️" label="Draw" />
          <ToolButton tool="pen" icon="🖊️" label="Pen" />
        </div>

        <div className="tool-group">
          <button className="shape-btn" onClick={() => addShape('rectangle')} title="Rectangle">
            ⬜
          </button>
          <button className="shape-btn" onClick={() => addShape('circle')} title="Circle">
            ⭕
          </button>
          <button className="shape-btn" onClick={() => addShape('triangle')} title="Triangle">
            🔺
          </button>
          <button className="shape-btn" onClick={() => addShape('polygon')} title="Polygon">
            ⬡
          </button>
          <button className="shape-btn" onClick={addText} title="Add Text">
            📝
          </button>
        </div>

        <div className="tool-group">
          <label className="color-picker">
            Stroke:
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
            />
          </label>
          <label className="color-picker">
            Fill:
            <input
              type="color"
              value={fillColor === 'transparent' ? '#ffffff' : fillColor}
              onChange={(e) => setFillColor(e.target.value)}
            />
            <button
              className={`fill-toggle ${fillColor === 'transparent' ? 'active' : ''}`}
              onClick={() => setFillColor(fillColor === 'transparent' ? strokeColor : 'transparent')}
            >
              Ø
            </button>
          </label>
          <label className="stroke-width">
            Width:
            <input
              type="range"
              min="1"
              max="20"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
            />
            <span>{strokeWidth}px</span>
          </label>
        </div>

        <div className="tool-group">
          <button className="action-btn delete" onClick={deleteSelected} title="Delete Selected">
            🗑️ Delete
          </button>
          <button className="action-btn clear" onClick={clearCanvas} title="Clear All">
            🧹 Clear
          </button>
        </div>

        <div className="tool-group export-group">
          <button className="export-btn" onClick={() => setShowExportModal(true)}>
            📤 Export
          </button>
        </div>
      </div>

      <div className="canvas-container">
        <canvas ref={canvasRef} />
      </div>

      <div className="info-panel">
        <h3>Supported Formats:</h3>
        <ul>
          <li><strong>SVG</strong> - Vector graphics for laser cutting & engraving</li>
          <li><strong>DXF</strong> - CAD format for CNC machining</li>
          <li><strong>STL</strong> - 3D printing standard format</li>
          <li><strong>G-code</strong> - Direct machine instructions</li>
          <li><strong>PNG/JPEG</strong> - Raster images</li>
          <li><strong>ZIP</strong> - All formats bundled together</li>
        </ul>
      </div>

      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Export Design</h2>
            <p>Choose your export format:</p>
            
            <div className="export-options">
              <button className="export-option" onClick={() => { exportToSVG(); setShowExportModal(false); }}>
                <span>📄</span>
                <strong>SVG</strong>
                <small>Laser Cutting, Engraving</small>
              </button>
              
              <button className="export-option" onClick={() => { exportToDXF(); setShowExportModal(false); }}>
                <span>📐</span>
                <strong>DXF</strong>
                <small>CNC Machining, CAD</small>
              </button>
              
              <button className="export-option" onClick={() => { exportToSTL(); setShowExportModal(false); }}>
                <span>🔺</span>
                <strong>STL</strong>
                <small>3D Printing</small>
              </button>
              
              <button className="export-option" onClick={() => { exportToGCODE(); setShowExportModal(false); }}>
                <span>⚙️</span>
                <strong>G-code</strong>
                <small>CNC, Laser, 3D Printer</small>
              </button>
              
              <button className="export-option" onClick={() => { 
                fabCanvas.lowerObject(fabCanvas.backgroundImage);
                const dataURL = fabCanvas.toDataURL({ format: 'png', quality: 1 });
                saveAs(dataURL, 'design.png');
                setShowExportModal(false); 
              }}>
                <span>🖼️</span>
                <strong>PNG</strong>
                <small>Raster Image</small>
              </button>
              
              <button className="export-option" onClick={() => { 
                fabCanvas.lowerObject(fabCanvas.backgroundImage);
                const dataURL = fabCanvas.toDataURL({ format: 'jpeg', quality: 0.95 });
                saveAs(dataURL, 'design.jpg');
                setShowExportModal(false); 
              }}>
                <span>📷</span>
                <strong>JPEG</strong>
                <small>Raster Image</small>
              </button>
              
              <button className="export-option all" onClick={() => { exportAllFormats(); setShowExportModal(false); }}>
                <span>📦</span>
                <strong>ALL FORMATS</strong>
                <small>Download ZIP with everything</small>
              </button>
            </div>
            
            <button className="close-btn" onClick={() => setShowExportModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <footer className="footer">
        <p>FabStudio v1.0 | For Laser Engraving • Cutting • 3D Printing • CNC Machining • Injection Moulding</p>
      </footer>
    </div>
  );
};

export default App;
