// Machine profile database.
// Work areas and power ratings are the manufacturers' nominal figures (mm / optical watts).
// Always verify against your own machine — variants and revisions differ.

export const CONTROLLERS = {
  grbl: { label: 'GRBL 1.1 (laser mode, M4 dynamic)', direct: true, gcode: true, sMax: 1000, baud: 115200 },
  'grbl-m3': { label: 'GRBL (constant power, M3)', direct: true, gcode: true, sMax: 1000, baud: 115200 },
  grblhal: { label: 'grblHAL / FluidNC', direct: true, gcode: true, sMax: 1000, baud: 115200 },
  marlin: { label: 'Marlin (laser inline, M3 I)', direct: true, gcode: true, sMax: 255, baud: 115200 },
  smoothie: { label: 'Smoothieware (S 0–1)', direct: true, gcode: true, sMax: 1, baud: 115200 },
  ruida: { label: 'Ruida DSP (export SVG/DXF for RDWorks/LightBurn)', direct: false, gcode: false, sMax: 1000, baud: 115200 },
  trocen: { label: 'Trocen / AWC (export only)', direct: false, gcode: false, sMax: 1000, baud: 115200 },
  topwisdom: { label: 'TopWisdom (export only)', direct: false, gcode: false, sMax: 1000, baud: 115200 },
  m2nano: { label: 'Lihuiyu M2 Nano (K40 stock, export only)', direct: false, gcode: false, sMax: 1000, baud: 115200 },
  ezcad: { label: 'JCZ / EZCAD galvo (export only)', direct: false, gcode: false, sMax: 1000, baud: 115200 },
  proprietary: { label: 'Proprietary / cloud (export only)', direct: false, gcode: false, sMax: 1000, baud: 115200 }
};

export const LASER_TYPES = {
  diode: 'Diode (blue 450nm)',
  ir: 'Infrared diode (1064nm)',
  co2: 'CO₂',
  fiber: 'Fiber (MOPA/Q-switch)',
  uv: 'UV',
  hybrid: 'Multi-laser'
};

// Compact form: [model, width, height, opticalWatts, extra?]
function brand(name, defaults, rows) {
  return rows.map(r => {
    const [model, w, h, power, extra] = r;
    return {
      brand: name,
      model,
      workW: w,
      workH: h,
      power,
      type: 'diode',
      controller: 'grbl',
      origin: 'bl',
      maxSpeed: 10000,
      rapid: 6000,
      ...defaults,
      ...(extra || {})
    };
  });
}

const P = { controller: 'proprietary' };
const RUIDA_CO2 = { type: 'co2', controller: 'ruida', origin: 'tr', maxSpeed: 24000, rapid: 24000 };
const GALVO = { type: 'fiber', controller: 'ezcad', origin: 'tl', maxSpeed: 420000, rapid: 420000 };

const DB = [
  // ---------------- xTool ----------------
  ...brand('xTool', { maxSpeed: 24000, rapid: 24000 }, [
    ['D1 5W', 432, 406, 5],
    ['D1 10W', 432, 406, 10],
    ['D1 Pro 5W', 432, 406, 5],
    ['D1 Pro 10W', 432, 406, 10],
    ['D1 Pro 20W', 432, 406, 20],
    ['D1 Pro 40W', 432, 406, 40],
    ['D1 Pro 2.0 (extended 936×432)', 936, 432, 20],
    ['S1 10W', 498, 319, 10, { origin: 'tl' }],
    ['S1 20W', 498, 319, 20, { origin: 'tl' }],
    ['S1 40W', 498, 319, 40, { origin: 'tl' }],
    ['M1 5W', 385, 300, 5, P],
    ['M1 10W', 385, 300, 10, P],
    ['M1 Ultra 20W', 300, 300, 20, P],
    ['F1 (2W IR + 10W diode)', 115, 115, 10, { ...P, type: 'hybrid' }],
    ['F1 Lite', 100, 100, 10, { ...P, type: 'hybrid' }],
    ['F1 Ultra (20W fiber + 20W diode)', 200, 200, 20, { ...P, type: 'hybrid' }],
    ['F2 Ultra (60W MOPA + 40W diode)', 220, 220, 60, { ...P, type: 'hybrid' }],
    ['P2 55W CO₂', 600, 308, 55, { ...P, type: 'co2' }],
    ['P2S 55W CO₂', 600, 308, 55, { ...P, type: 'co2' }],
    ['P3 80W CO₂', 1000, 700, 80, { ...P, type: 'co2' }],
    ['MetalFab (fiber welder/cutter)', 600, 400, 1200, { ...P, type: 'fiber' }]
  ]),

  // ---------------- Ortur ----------------
  ...brand('Ortur', {}, [
    ['Laser Master 2 (15W)', 400, 430, 5.5],
    ['Laser Master 2 Pro S2 SF', 400, 430, 5.5],
    ['Laser Master 2 Pro S2 LF', 400, 430, 10],
    ['Laser Master 3 (LE 10W)', 400, 380, 10],
    ['Laser Master 3 (20W)', 400, 380, 20],
    ['Laser Master 3 Max', 800, 400, 20],
    ['Laser Master H10 (10W)', 400, 400, 10],
    ['Laser Master H20 (20W)', 400, 400, 20],
    ['Aufero Laser 1 (LU2-2)', 180, 180, 1.6],
    ['Aufero Laser 1 (LU2-4 LF)', 390, 390, 5],
    ['Aufero Laser 2 (LU2-4 LF)', 390, 390, 5],
    ['Aufero Laser 2 (LU2-10A)', 390, 390, 10],
    ['Ortur Laser Engraver 1.5', 180, 180, 1.6]
  ]),

  // ---------------- Atomstack ----------------
  ...brand('Atomstack', {}, [
    ['A5 20W', 410, 400, 5],
    ['A5 Pro', 410, 400, 5.5],
    ['A5 Pro+', 410, 400, 5.5],
    ['A5 M40', 410, 400, 5.5],
    ['A6 Pro', 410, 400, 6],
    ['A10 Pro', 410, 400, 10],
    ['A12 Ultra', 400, 400, 12],
    ['A20 Pro', 400, 400, 20],
    ['A24 Ultra', 850, 400, 24],
    ['A30 Pro', 400, 400, 33],
    ['A40 Pro', 400, 400, 40],
    ['A48 Pro', 850, 400, 48],
    ['A70 Max', 850, 400, 70],
    ['X7 Pro', 410, 400, 5.5],
    ['X12 Pro', 400, 400, 12],
    ['X20 Pro', 400, 400, 20],
    ['X24 Pro', 400, 400, 24],
    ['X30 Pro', 400, 400, 33],
    ['X40 Pro', 400, 400, 40],
    ['X70 Max', 400, 400, 70],
    ['S10 Pro', 410, 400, 10],
    ['S20 Pro', 400, 400, 20],
    ['S30 Pro', 400, 400, 33],
    ['S40 Pro', 400, 400, 40],
    ['P7 M30 (portable)', 180, 180, 5.5],
    ['P9 M50 (portable)', 180, 180, 10],
    ['Maker M4 (fiber/IR)', 80, 80, 2, { type: 'ir' }],
    ['Hurricane 20W CO₂', 380, 280, 20, { type: 'co2' }]
  ]),

  // ---------------- Sculpfun ----------------
  ...brand('Sculpfun', {}, [
    ['S6', 410, 420, 5.5],
    ['S6 Pro', 410, 420, 5.5],
    ['S9', 410, 420, 5.5],
    ['S10', 410, 400, 10],
    ['S30 5W', 410, 400, 5],
    ['S30 Pro 10W', 410, 400, 10],
    ['S30 Pro Max 20W', 410, 400, 20],
    ['S30 Ultra 11W', 600, 600, 11],
    ['S30 Ultra 22W', 600, 600, 22],
    ['S30 Ultra 33W', 600, 600, 33],
    ['S30 Pro Max + Extension', 935, 905, 20],
    ['SF-A9 40W', 400, 400, 40],
    ['iCube 3W', 130, 130, 3],
    ['iCube 5W', 130, 130, 5],
    ['iCube 10W', 130, 130, 10],
    ['iCube Ultra 12W', 130, 130, 12]
  ]),

  // ---------------- Creality ----------------
  ...brand('Creality', {}, [
    ['CR-Laser Falcon 5W', 400, 415, 5],
    ['CR-Laser Falcon 10W', 400, 415, 10],
    ['Falcon2 12W', 400, 415, 12],
    ['Falcon2 22W', 400, 415, 22],
    ['Falcon2 40W', 400, 415, 40],
    ['Falcon2 Pro 22W', 400, 415, 22],
    ['Falcon2 Pro 40W', 400, 415, 40],
    ['Falcon A1 10W', 381, 305, 10, P],
    ['Falcon A1 Pro 20W', 381, 305, 20, P],
    ['Falcon T1 (10W diode + 1.5W IR)', 400, 400, 10, { ...P, type: 'hybrid' }],
    ['CR-Laser Falcon 1.6W', 400, 415, 1.6],
    // Grbl_ESP32 (ESP32-S2 native USB). Reports negative machine coordinates, so default to
    // starting jobs at the current laser position.
    ['CV-01 (1.6W)', 170, 200, 1.6, { jobOrigin: 'current', maxSpeed: 10000, rapid: 10000 }],
    ['CV-01 Pro (1.6W)', 170, 200, 1.6, { jobOrigin: 'current', maxSpeed: 10000, rapid: 10000 }]
  ]),

  // ---------------- TwoTrees ----------------
  ...brand('TwoTrees', {}, [
    ['TTS-55', 300, 300, 5.5],
    ['TTS-10 Pro', 300, 300, 10],
    ['TTS-20 Pro', 300, 300, 20],
    ['TTS-25', 300, 300, 25],
    ['TS2 10W', 450, 450, 10],
    ['TS2 20W', 450, 450, 20],
    ['TS3', 450, 450, 20],
    ['Totem S', 400, 400, 5.5],
    ['Blu-5', 1000, 400, 5.5]
  ]),

  // ---------------- NEJE ----------------
  ...brand('NEJE', {}, [
    ['Master 2S', 170, 170, 5],
    ['Master 2S Plus', 255, 440, 7.5],
    ['Master 2S Max', 460, 810, 10],
    ['NEJE 3', 170, 170, 10],
    ['NEJE 3 Plus', 255, 440, 20],
    ['NEJE 3 Max', 460, 810, 20],
    ['NEJE 4 Max', 460, 810, 40],
    ['DK-8-KZ', 80, 80, 1.5]
  ]),

  // ---------------- LONGER ----------------
  ...brand('LONGER', {}, [
    ['Ray5 5W', 400, 400, 5],
    ['Ray5 10W', 400, 400, 10],
    ['Ray5 20W', 400, 400, 20],
    ['Ray5 130W', 450, 440, 20],
    ['B1 20W', 400, 400, 20],
    ['B1 30W', 400, 400, 30],
    ['B1 40W', 400, 400, 40],
    ['Nano Pro', 100, 100, 12]
  ]),

  // ---------------- Comgrow ----------------
  ...brand('Comgrow', {}, [
    ['Z1 10W', 400, 410, 10],
    ['Z1 20W', 400, 410, 20],
    ['Z1 Pro 20W', 400, 410, 20],
    ['T500', 400, 400, 5]
  ]),

  // ---------------- SainSmart / Genmitsu ----------------
  ...brand('SainSmart', {}, [
    ['Jinsoku LC-40', 400, 400, 10],
    ['Jinsoku LE5040', 500, 400, 5],
    ['Genmitsu L8', 410, 400, 10],
    ['Genmitsu 3018-PRO + laser', 300, 180, 5.5],
    ['Genmitsu 3020-PRO Max + laser', 300, 200, 5.5],
    ['Genmitsu 4030 Proverxl + laser', 400, 300, 10],
    ['Genmitsu 4040-PRO + laser', 400, 400, 10],
    ['Genmitsu PROVerXL 6050 + laser', 600, 500, 10]
  ]),

  // ---------------- Elegoo ----------------
  ...brand('Elegoo', {}, [
    ['PhecdaLaser 10W', 400, 400, 10],
    ['PhecdaLaser 20W', 400, 400, 20]
  ]),

  // ---------------- Algolaser ----------------
  ...brand('Algolaser', {}, [
    ['Alpha 10W', 410, 405, 10],
    ['Alpha 22W', 410, 405, 22],
    ['Delta 22W', 400, 400, 22],
    ['DIY Kit 10W', 1000, 1000, 10]
  ]),

  // ---------------- ACMER ----------------
  ...brand('ACMER', {}, [
    ['P1 10W', 400, 410, 10],
    ['P1 S 20W', 400, 410, 20],
    ['P2 10W', 400, 400, 10],
    ['P2 20W', 400, 400, 20],
    ['P2 33W', 400, 400, 33],
    ['S1 (portable 2.5W)', 130, 130, 2.5],
    ['OMNI X 20W', 400, 400, 20]
  ]),

  // ---------------- ATEZR ----------------
  ...brand('ATEZR', {}, [
    ['L1 10W', 410, 400, 10],
    ['P20', 410, 400, 20],
    ['Hawk S20', 400, 400, 20],
    ['HX30', 400, 400, 30]
  ]),

  // ---------------- Wainlux ----------------
  ...brand('Wainlux', {}, [
    ['K6', 80, 80, 3, P],
    ['K8', 100, 100, 5, P],
    ['JL1', 300, 300, 5],
    ['JL3', 400, 400, 10],
    ['JL7', 400, 400, 10],
    ['L7 Pro', 500, 500, 10]
  ]),

  // ---------------- Snapmaker (Marlin) ----------------
  ...brand('Snapmaker', { controller: 'marlin', maxSpeed: 6000, rapid: 6000 }, [
    ['2.0 A150 (1.6W module)', 160, 160, 1.6],
    ['2.0 A250 (1.6W module)', 230, 250, 1.6],
    ['2.0 A350 (1.6W module)', 320, 350, 1.6],
    ['2.0 A350 (10W module)', 320, 350, 10],
    ['Artisan (10W / 40W module)', 400, 400, 10],
    ['Ray 20W', 600, 400, 20],
    ['Ray 40W', 600, 400, 40]
  ]),

  // ---------------- LaserPecker ----------------
  ...brand('LaserPecker', P, [
    ['LP1', 100, 100, 1.2],
    ['LP1 Pro', 100, 100, 1.6],
    ['LP2', 100, 75, 5],
    ['LP3 (CO₂ 10W galvo)', 110, 110, 10, { type: 'co2' }],
    ['LP4 (diode + IR)', 100, 100, 10, { type: 'hybrid' }],
    ['LP5 (fiber + diode)', 100, 100, 20, { type: 'hybrid' }],
    ['LX1 (diode, large)', 400, 360, 20],
    ['LX2 (CO₂)', 500, 400, 50, { type: 'co2' }]
  ]),

  // ---------------- Glowforge / Flux / cloud boxes ----------------
  ...brand('Glowforge', { ...P, type: 'co2' }, [
    ['Basic', 495, 279, 40],
    ['Plus', 495, 279, 40],
    ['Pro', 495, 279, 45],
    ['Aura', 305, 305, 6, { type: 'diode' }],
    ['Spark', 305, 305, 6, { type: 'diode' }]
  ]),
  ...brand('FLUX', { ...P, type: 'co2' }, [
    ['beamo 30W', 300, 210, 30],
    ['Beambox 40W', 400, 375, 40],
    ['Beambox Pro 50W', 600, 375, 50],
    ['HEXA 60W', 730, 410, 60],
    ['Ador (diode 10W/20W)', 430, 300, 20, { type: 'diode' }],
    ['beamo II', 360, 240, 40]
  ]),
  ...brand('WeCreat', { ...P }, [
    ['Vision 20W', 500, 300, 20],
    ['Vision 40W', 500, 300, 40],
    ['Eyes', 300, 300, 10],
    ['Ultra 20W', 650, 400, 20]
  ]),
  ...brand('Makeblock', { ...P, type: 'co2' }, [
    ['Laserbox Basic', 380, 280, 40],
    ['Laserbox Pro', 500, 300, 40]
  ]),
  ...brand('Mr Beam', { ...P }, [
    ['Mr Beam II (5W)', 500, 390, 5],
    ['Mr Beam II dreamcut [x] (10W)', 500, 390, 10]
  ]),
  ...brand('Darkly Labs', { ...P }, [
    ['Emblaser 2', 500, 300, 5],
    ['Emblaser Core', 500, 300, 5]
  ]),
  ...brand('Dremel', { ...P, type: 'co2' }, [['LC40 Digilab', 508, 305, 40]]),
  ...brand('Bambu Lab', { ...P }, [
    ['H2D Laser module 10W', 310, 270, 10],
    ['H2D Laser module 40W', 310, 250, 40],
    ['H2S Laser module', 340, 320, 10]
  ]),
  ...brand('Gweike', { ...P, type: 'co2' }, [
    ['Cloud 50W', 509, 305, 50],
    ['Cloud Pro 50W', 509, 305, 50],
    ['Cloud Pro II 55W', 600, 400, 55],
    ['G2 fiber', 150, 150, 30, { type: 'fiber' }],
    ['G6 fiber', 200, 200, 50, { type: 'fiber' }]
  ]),
  ...brand('Monport', { ...RUIDA_CO2 }, [
    ['K40 (40W, M2 Nano)', 300, 200, 40, { controller: 'm2nano' }],
    ['40W Pro (Ruida)', 300, 200, 40],
    ['Onyx 55W', 508, 305, 55, P],
    ['GA 60W (24×16in)', 600, 400, 60],
    ['GA 80W (28×20in)', 700, 500, 80],
    ['GA 100W (36×24in)', 900, 600, 100],
    ['GA 130W (51×35in)', 1300, 900, 130],
    ['GA 150W (55×39in)', 1400, 1000, 150],
    ['GI 30W fiber (110 lens)', 110, 110, 30, GALVO],
    ['GI 50W fiber (175 lens)', 175, 175, 50, GALVO],
    ['GM 60W MOPA (200 lens)', 200, 200, 60, GALVO],
    ['GM 100W MOPA (300 lens)', 300, 300, 100, GALVO]
  ]),

  // ---------------- OMTech ----------------
  ...brand('OMTech', { ...RUIDA_CO2 }, [
    ['K40 (40W 12×8in)', 300, 200, 40, { controller: 'm2nano' }],
    ['K40+ (Ruida)', 300, 200, 40],
    ['Polar 50W', 500, 300, 50, P],
    ['Polar 350 55W', 508, 305, 55, P],
    ['50W 20×12in', 500, 300, 50],
    ['55W 20×12in (Pronto 45)', 500, 300, 55],
    ['60W 16×24in', 600, 400, 60],
    ['60W 20×28in (Pronto 55)', 700, 500, 60],
    ['80W 20×28in', 700, 500, 80],
    ['100W 24×40in (Pronto 75)', 1000, 600, 100],
    ['100W 36×24in', 900, 600, 100],
    ['130W 35×51in', 1300, 900, 130],
    ['150W 40×63in', 1600, 1000, 150],
    ['180W 40×63in', 1600, 1000, 180],
    ['Galvo 20W fiber (110 lens)', 110, 110, 20, GALVO],
    ['Galvo 30W fiber (175 lens)', 175, 175, 30, GALVO],
    ['Galvo 50W fiber (200 lens)', 200, 200, 50, GALVO],
    ['Galvo 60W MOPA', 200, 200, 60, GALVO],
    ['Galvo 60W CO₂ (galvo)', 300, 300, 60, { ...GALVO, type: 'co2' }]
  ]),

  // ---------------- Thunder Laser ----------------
  ...brand('Thunder Laser', { ...RUIDA_CO2 }, [
    ['Bolt 30W', 510, 305, 30],
    ['Bolt Plus 30W', 520, 340, 30],
    ['Bolt Pro 40W', 510, 305, 40],
    ['Aurora 8', 600, 500, 60],
    ['Aurora Lite 30W', 500, 300, 30],
    ['Nova 24 (60–80W)', 600, 400, 80],
    ['Nova 35 (80–100W)', 900, 600, 100],
    ['Nova 51 (100–130W)', 1300, 900, 130],
    ['Nova 63 (100–150W)', 1600, 1000, 150],
    ['Nova Plus 24', 610, 460, 80],
    ['Nova Plus 35', 900, 600, 100],
    ['Nova Plus 51', 1300, 900, 130],
    ['Titan 1390', 1300, 900, 150],
    ['Odin 30W fiber galvo', 150, 150, 30, GALVO]
  ]),

  // ---------------- Aeon Laser ----------------
  ...brand('Aeon Laser', { ...RUIDA_CO2 }, [
    ['Mira 5', 500, 300, 40],
    ['Mira 7', 700, 450, 60],
    ['Mira 9', 900, 600, 80],
    ['Mira 7S / 9S', 900, 600, 100],
    ['Nova 7', 700, 500, 80],
    ['Nova 10', 1000, 700, 100],
    ['Nova 14', 1400, 1000, 130],
    ['Nova 16', 1600, 1000, 150],
    ['Redline MIRA / NOVA HD', 900, 600, 100],
    ['Nova Super 16', 1600, 1000, 150]
  ]),

  // ---------------- Epilog ----------------
  ...brand('Epilog', { ...P, type: 'co2', origin: 'tl' }, [
    ['Zing 16', 406, 305, 40],
    ['Zing 24', 610, 305, 60],
    ['Fusion Maker 12', 610, 305, 40],
    ['Fusion Maker 24', 610, 610, 60],
    ['Fusion Edge 12', 610, 305, 60],
    ['Fusion Edge 24', 914, 610, 80],
    ['Fusion Edge 36', 914, 610, 80],
    ['Fusion Pro 24', 610, 610, 80],
    ['Fusion Pro 32', 813, 508, 120],
    ['Fusion Pro 36', 914, 610, 120],
    ['Fusion Pro 48', 1219, 914, 120],
    ['Fusion Galvo G2', 305, 305, 50, { type: 'fiber' }],
    ['Fusion Galvo G3', 430, 430, 50, { type: 'fiber' }],
    ['Helix 24', 610, 457, 75],
    ['Mini 18/24', 610, 305, 60]
  ]),

  // ---------------- Trotec ----------------
  ...brand('Trotec', { ...P, type: 'co2', origin: 'tl' }, [
    ['Speedy 100', 610, 305, 60],
    ['Speedy 100 flexx', 610, 305, 60],
    ['Speedy 300', 726, 432, 120],
    ['Speedy 360', 813, 508, 120],
    ['Speedy 400', 1000, 610, 120],
    ['Speedy 500', 1245, 710, 200],
    ['Rayjet 50', 457, 305, 50],
    ['Rayjet 300', 726, 432, 60],
    ['SP500', 1245, 710, 200],
    ['SP2000', 3210, 2210, 400],
    ['SpeedMarker 50', 190, 190, 30, { type: 'fiber' }]
  ]),

  // ---------------- Universal Laser Systems ----------------
  ...brand('Universal Laser Systems', { ...P, type: 'co2', origin: 'tl' }, [
    ['VLS2.30', 406, 305, 30],
    ['VLS3.50', 610, 305, 50],
    ['VLS3.60', 610, 305, 60],
    ['VLS4.60', 610, 457, 60],
    ['VLS6.60', 813, 457, 75],
    ['PLS4.75', 610, 457, 75],
    ['PLS6.75', 813, 457, 75],
    ['PLS6.150D', 813, 457, 150],
    ['ILS9.150D', 914, 610, 150],
    ['ILS12.150D', 1219, 610, 150],
    ['ULTRA R5000', 813, 457, 150]
  ]),

  // ---------------- Boss Laser ----------------
  ...brand('Boss Laser', { ...RUIDA_CO2 }, [
    ['LS-1416', 406, 355, 50],
    ['LS-1420', 508, 355, 50],
    ['LS-1630', 762, 406, 100],
    ['LS-2436', 914, 610, 100],
    ['LS-3655', 1397, 914, 150],
    ['HP-2436', 914, 610, 100],
    ['HP-3655', 1397, 914, 150],
    ['HP-2440', 1016, 610, 100],
    ['LS-1416 Galvo (fiber)', 175, 175, 50, GALVO]
  ]),

  // ---------------- Full Spectrum ----------------
  ...brand('Full Spectrum Laser', { ...P, type: 'co2', origin: 'tl' }, [
    ['Muse Core', 508, 305, 45],
    ['Muse 2D', 508, 305, 45],
    ['Muse 3D', 508, 305, 45],
    ['Muse Titan', 1016, 508, 90],
    ['Hobby 20×12', 508, 305, 40],
    ['Pro Series 24×36', 914, 610, 90],
    ['Pro Series 48×36', 1219, 914, 150],
    ['P-Series 20×12', 508, 305, 45]
  ]),

  // ---------------- Kern / Vytek / GCC / Rabbit / Redsail ----------------
  ...brand('Kern Laser', { ...RUIDA_CO2 }, [
    ['LaserCELL 3000', 1219, 914, 150],
    ['OptiFlex', 1524, 1219, 400],
    ['HSE 52×100', 2540, 1321, 400]
  ]),
  ...brand('Vytek', { ...RUIDA_CO2 }, [
    ['Vytek FC Series 1318', 1300, 1800, 150],
    ['LST-1612', 1219, 610, 100],
    ['Vytek Desktop 12×16', 406, 305, 50]
  ]),
  ...brand('GCC', { ...P, type: 'co2', origin: 'tl' }, [
    ['LaserPro Spirit', 740, 460, 60],
    ['LaserPro S290LS', 740, 460, 60],
    ['LaserPro C180 II', 458, 305, 30],
    ['LaserPro E200', 610, 305, 30]
  ]),
  ...brand('Rabbit Laser', { ...RUIDA_CO2 }, [
    ['RL-HX 1280', 1200, 800, 100],
    ['RL-80-1290', 1200, 900, 80],
    ['RL-100-1610', 1600, 1000, 100]
  ]),
  ...brand('Redsail', { ...RUIDA_CO2 }, [
    ['CM1290', 1200, 900, 100],
    ['M500', 500, 300, 50],
    ['CM1610', 1600, 1000, 130]
  ]),

  // ---------------- Chinese generic CO₂ ----------------
  ...brand('Generic CO₂', { ...RUIDA_CO2 }, [
    ['K40 (Lihuiyu M2 Nano)', 300, 200, 40, { controller: 'm2nano' }],
    ['K40 upgraded to GRBL (Cohesion3D / Awesome.tech)', 300, 200, 40, { controller: 'grbl', origin: 'tl' }],
    ['K40 upgraded to Smoothie (Cohesion3D Mini)', 300, 200, 40, { controller: 'smoothie', origin: 'tl' }],
    ['4040 50W', 400, 400, 50],
    ['4060 50W', 600, 400, 50],
    ['5030 50W', 500, 300, 50],
    ['6040 60W', 600, 400, 60],
    ['7050 80W', 700, 500, 80],
    ['9060 100W', 900, 600, 100],
    ['1060 100W', 1000, 600, 100],
    ['1290 130W', 1200, 900, 130],
    ['1390 150W', 1300, 900, 150],
    ['1610 150W', 1600, 1000, 150],
    ['1325 150W', 2500, 1300, 150],
    ['1530 180W', 3000, 1500, 180],
    ['Trocen AWC708 machine 9060', 900, 600, 100, { controller: 'trocen' }],
    ['TopWisdom TL-403 machine 6040', 600, 400, 60, { controller: 'topwisdom' }]
  ]),

  // ---------------- Fiber galvo (generic JCZ / EZCAD) ----------------
  ...brand('Generic Fiber Galvo', { ...GALVO }, [
    ['20W Raycus (110×110 lens)', 110, 110, 20],
    ['30W Raycus (150×150 lens)', 150, 150, 30],
    ['30W JPT MOPA (175×175 lens)', 175, 175, 30],
    ['50W Raycus (200×200 lens)', 200, 200, 50],
    ['60W JPT MOPA (200×200 lens)', 200, 200, 60],
    ['100W JPT MOPA (300×300 lens)', 300, 300, 100],
    ['UV 5W galvo (110×110)', 110, 110, 5, { type: 'uv' }],
    ['CO₂ 30W RF galvo (110×110)', 110, 110, 30, { type: 'co2' }]
  ]),
  ...brand('Cloudray', { ...GALVO }, [
    ['QS-30 30W', 175, 175, 30],
    ['QS-50 50W', 200, 200, 50],
    ['MP-60 MOPA 60W', 200, 200, 60],
    ['GM-100 MOPA 100W', 300, 300, 100],
    ['LP-30 portable', 110, 110, 30]
  ]),
  ...brand('ComMarker', { ...GALVO }, [
    ['B4 20W', 110, 110, 20],
    ['B4 30W', 150, 150, 30],
    ['B4 50W', 200, 200, 50],
    ['B4 60W MOPA', 200, 200, 60],
    ['B6 MOPA 30W', 150, 150, 30],
    ['B6 JPT MOPA 60W', 200, 200, 60],
    ['Omni 1 UV 5W', 110, 110, 5, { type: 'uv' }]
  ]),

  // ---------------- CNC routers with laser add-on ----------------
  ...brand('CNC + Laser', { controller: 'grbl', maxSpeed: 5000, rapid: 5000 }, [
    ['Generic 3018 (GRBL) + laser', 300, 180, 5.5],
    ['Generic 3040 + laser', 400, 300, 5.5],
    ['Generic 6040 + laser', 600, 400, 10],
    ['Shapeoko 4 XL + J Tech', 838, 432, 7, { controller: 'grbl' }],
    ['Shapeoko 5 Pro 4×2 + laser', 1220, 610, 10, { controller: 'grblhal' }],
    ['Inventables X-Carve 1000 + laser', 750, 750, 7],
    ['Carvera Air + laser', 300, 200, 5, { controller: 'smoothie' }],
    ['OpenBuilds LEAD 1010 + laser', 730, 810, 7, { controller: 'grbl' }],
    ['OpenBuilds LEAD 1515 + laser', 1250, 1270, 7, { controller: 'grbl' }],
    ['Ooznest WorkBee 1010 + laser', 690, 720, 7],
    ['Onefinity Woodworker + laser', 816, 816, 10, { controller: 'grblhal' }],
    ['LongMill MK2 30×30 + LaserBeam', 780, 780, 10],
    ['LongMill MK2 48×30 + LaserBeam', 1250, 780, 10],
    ['Ender 3 V2 + laser module (Marlin)', 220, 220, 5, { controller: 'marlin' }],
    ['Prusa MK3/MK4 + laser (Marlin)', 250, 210, 5, { controller: 'marlin' }]
  ]),

  // ---------------- Generic diode frames ----------------
  ...brand('Generic Diode', { controller: 'grbl' }, [
    ['GRBL 170×170', 170, 170, 5],
    ['GRBL 300×300', 300, 300, 5],
    ['GRBL 400×400', 400, 400, 10],
    ['GRBL 400×430', 400, 430, 10],
    ['GRBL 600×600', 600, 600, 20],
    ['GRBL 800×400', 800, 400, 20],
    ['GRBL 1000×1000', 1000, 1000, 20],
    ['FluidNC / ESP32 400×400', 400, 400, 10, { controller: 'grblhal' }],
    ['MKS DLC32 400×400', 400, 400, 10]
  ])
];

export const MACHINES = DB.map((m, i) => ({
  id: `${m.brand}::${m.model}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'),
  ...m,
  sMax: CONTROLLERS[m.controller].sMax,
  baud: CONTROLLERS[m.controller].baud,
  index: i
}));

export const BRANDS = [...new Set(MACHINES.map(m => m.brand))].sort((a, b) => a.localeCompare(b));

export function findMachine(id) {
  return MACHINES.find(m => m.id === id);
}

// Build a full device configuration from a catalog profile.
export function deviceFromProfile(p) {
  return {
    profileId: p.id,
    name: `${p.brand} ${p.model}`,
    brand: p.brand,
    model: p.model,
    type: p.type,
    power: p.power,
    workW: p.workW,
    workH: p.workH,
    controller: p.controller,
    baud: p.baud,
    sMax: p.sMax,
    maxSpeed: p.maxSpeed,
    rapid: p.rapid,
    origin: p.origin,
    laserMode: p.controller === 'grbl-m3' ? 'M3' : 'M4',
    airAssist: true,
    homeOnStart: false,
    returnHome: true,
    jobOrigin: p.jobOrigin || 'absolute',
    jobAnchor: 'bl',
    framePower: 0,
    frameSpeed: 3000,
    startGcode: '',
    endGcode: ''
  };
}

export const DEFAULT_DEVICE = deviceFromProfile(MACHINES.find(m => m.id.startsWith('creality::cv-01-pro')) || MACHINES[0]);
