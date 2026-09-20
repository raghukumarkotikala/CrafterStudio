// Starting-point material settings. Every machine, lens and batch of material differs:
// run the Material Test Generator before production work.
// mode: line (cut/score) | fill (engrave) | image ; speed in mm/min ; power in %

const row = (material, thickness, op, mode, power, speed, passes = 1, interval = 0.1) =>
  ({ material, thickness, op, mode, power, speed, passes, interval });

export const MATERIAL_SETS = {
  'diode-low': {
    label: 'Diode ≤ 6 W',
    items: [
      row('Basswood / plywood', '3 mm', 'Cut', 'line', 100, 180, 4),
      row('Basswood / plywood', '—', 'Engrave', 'fill', 60, 3000, 1, 0.08),
      row('Basswood / plywood', '—', 'Score', 'line', 40, 1500),
      row('Basswood / plywood', '—', 'Photo', 'image', 50, 2500, 1, 0.1),
      row('Cardboard', '2 mm', 'Cut', 'line', 100, 600, 2),
      row('Paper / cardstock', '0.3 mm', 'Cut', 'line', 70, 1500),
      row('Leather (veg-tan)', '—', 'Engrave', 'fill', 40, 3000, 1, 0.08),
      row('Leather (veg-tan)', '2 mm', 'Cut', 'line', 100, 150, 4),
      row('Black acrylic (cast)', '3 mm', 'Cut', 'line', 100, 100, 6),
      row('Anodized aluminum', '—', 'Engrave', 'fill', 100, 1200, 1, 0.05),
      row('Slate', '—', 'Engrave', 'fill', 80, 1800, 1, 0.1),
      row('Cork', '—', 'Engrave', 'fill', 40, 3000, 1, 0.1),
      row('Felt', '3 mm', 'Cut', 'line', 90, 400, 2)
    ]
  },
  'diode-mid': {
    label: 'Diode 7 – 15 W',
    items: [
      row('Basswood / plywood', '3 mm', 'Cut', 'line', 100, 360, 2),
      row('Basswood / plywood', '5 mm', 'Cut', 'line', 100, 240, 4),
      row('Basswood / plywood', '—', 'Engrave', 'fill', 35, 6000, 1, 0.08),
      row('Basswood / plywood', '—', 'Score', 'line', 25, 3000),
      row('Basswood / plywood', '—', 'Photo', 'image', 40, 4000, 1, 0.1),
      row('MDF', '3 mm', 'Cut', 'line', 100, 240, 3),
      row('Cardboard', '2 mm', 'Cut', 'line', 100, 1500),
      row('Paper / cardstock', '0.3 mm', 'Cut', 'line', 40, 3000),
      row('Leather (veg-tan)', '—', 'Engrave', 'fill', 25, 6000, 1, 0.08),
      row('Leather (veg-tan)', '2 mm', 'Cut', 'line', 100, 300, 2),
      row('Black acrylic (cast)', '3 mm', 'Cut', 'line', 100, 180, 4),
      row('Anodized aluminum', '—', 'Engrave', 'fill', 80, 2500, 1, 0.05),
      row('Stainless steel (with marking spray)', '—', 'Engrave', 'fill', 100, 1000, 1, 0.05),
      row('Slate', '—', 'Engrave', 'fill', 60, 3000, 1, 0.1),
      row('Glass (painted / taped)', '—', 'Engrave', 'fill', 70, 2000, 1, 0.08),
      row('Cork', '—', 'Engrave', 'fill', 25, 6000, 1, 0.1),
      row('Felt', '3 mm', 'Cut', 'line', 80, 900)
    ]
  },
  'diode-high': {
    label: 'Diode ≥ 20 W',
    items: [
      row('Basswood / plywood', '3 mm', 'Cut', 'line', 100, 900, 1),
      row('Basswood / plywood', '6 mm', 'Cut', 'line', 100, 360, 2),
      row('Basswood / plywood', '10 mm', 'Cut', 'line', 100, 240, 4),
      row('Basswood / plywood', '—', 'Engrave', 'fill', 20, 12000, 1, 0.08),
      row('Basswood / plywood', '—', 'Score', 'line', 15, 6000),
      row('Basswood / plywood', '—', 'Photo', 'image', 25, 8000, 1, 0.1),
      row('MDF', '3 mm', 'Cut', 'line', 100, 600, 1),
      row('Cardboard', '3 mm', 'Cut', 'line', 80, 3000),
      row('Leather (veg-tan)', '—', 'Engrave', 'fill', 15, 12000, 1, 0.08),
      row('Leather (veg-tan)', '3 mm', 'Cut', 'line', 100, 600, 2),
      row('Black acrylic (cast)', '3 mm', 'Cut', 'line', 100, 360, 2),
      row('Anodized aluminum', '—', 'Engrave', 'fill', 50, 5000, 1, 0.05),
      row('Stainless steel (with marking spray)', '—', 'Engrave', 'fill', 80, 2000, 1, 0.05),
      row('Slate', '—', 'Engrave', 'fill', 40, 6000, 1, 0.1),
      row('Glass (painted / taped)', '—', 'Engrave', 'fill', 50, 4000, 1, 0.08)
    ]
  },
  co2: {
    label: 'CO₂ 40 – 150 W',
    items: [
      row('Plywood / basswood', '3 mm', 'Cut', 'line', 60, 1200),
      row('Plywood / basswood', '6 mm', 'Cut', 'line', 75, 600),
      row('Plywood / basswood', '—', 'Engrave', 'fill', 25, 18000, 1, 0.1),
      row('Plywood / basswood', '—', 'Score', 'line', 15, 6000),
      row('Plywood / basswood', '—', 'Photo', 'image', 30, 15000, 1, 0.1),
      row('MDF', '3 mm', 'Cut', 'line', 65, 1000),
      row('Cast acrylic (clear/colour)', '3 mm', 'Cut', 'line', 65, 900),
      row('Cast acrylic (clear/colour)', '6 mm', 'Cut', 'line', 80, 420),
      row('Cast acrylic (clear/colour)', '—', 'Engrave', 'fill', 20, 18000, 1, 0.1),
      row('Leather', '2 mm', 'Cut', 'line', 45, 1500),
      row('Leather', '—', 'Engrave', 'fill', 18, 18000, 1, 0.1),
      row('Paper / cardstock', '0.3 mm', 'Cut', 'line', 12, 6000),
      row('Cardboard', '3 mm', 'Cut', 'line', 30, 3000),
      row('Glass', '—', 'Engrave', 'fill', 30, 12000, 1, 0.12),
      row('Stone / slate', '—', 'Engrave', 'fill', 45, 9000, 1, 0.1),
      row('Anodized aluminum', '—', 'Engrave', 'fill', 30, 15000, 1, 0.08),
      row('Rubber stamp', '2.3 mm', 'Engrave', 'fill', 60, 12000, 1, 0.08),
      row('Fabric (cotton / felt)', '—', 'Cut', 'line', 20, 3000)
    ]
  },
  fiber: {
    label: 'Fiber / IR',
    items: [
      row('Stainless steel', '—', 'Mark (black)', 'fill', 60, 60000, 1, 0.03),
      row('Stainless steel', '—', 'Deep engrave', 'fill', 90, 90000, 10, 0.03),
      row('Aluminum (bare)', '—', 'Mark', 'fill', 80, 90000, 1, 0.03),
      row('Anodized aluminum', '—', 'Mark (white)', 'fill', 40, 180000, 1, 0.03),
      row('Brass / copper', '—', 'Mark', 'fill', 90, 60000, 2, 0.03),
      row('Titanium', '—', 'Mark', 'fill', 50, 90000, 1, 0.03),
      row('ABS / plastics', '—', 'Mark', 'fill', 30, 180000, 1, 0.03),
      row('Gold / silver', '—', 'Mark', 'fill', 90, 30000, 3, 0.02),
      row('Thin steel sheet', '0.2 mm', 'Cut', 'line', 100, 6000, 30)
    ]
  }
};

export function materialSetFor(device) {
  if (device.type === 'co2') return 'co2';
  if (device.type === 'fiber' || device.type === 'ir' || device.type === 'uv') return 'fiber';
  const w = device.power || 5;
  if (w <= 6) return 'diode-low';
  if (w < 20) return 'diode-mid';
  return 'diode-high';
}
