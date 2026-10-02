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

// ---------------------------------------------------------------------------
// 3D printing filaments. These settings mark/engrave finished printed parts and
// cut thin printed sheets. note explains quirks; danger flags filaments that
// must never go into a laser.
// ---------------------------------------------------------------------------
const frow = (material, thickness, op, mode, power, speed, passes, interval, note) =>
  ({ material, thickness, op, mode, power, speed, passes, interval, note });

const never = (material, note) =>
  ({ material, thickness: '—', op: 'Do not laser', mode: 'line', power: 0, speed: 0, passes: 0, interval: 0, note, danger: true });

const FILAMENT_NOTE = 'Printed plastics melt rather than vaporise: expect rounded, glossy edges and strong fumes. Use extraction, air assist, low power and several passes. Dark opaque filament marks far better than natural or transparent.';

Object.assign(MATERIAL_SETS, {
  'filament-diode': {
    label: '3D filaments — diode (plastic)',
    note: FILAMENT_NOTE + ' A blue diode passes straight through clear plastic, so paint clear parts or use CO₂.',
    items: [
      frow('PLA (black / dark)', '—', 'Engrave', 'fill', 25, 3000, 1, 0.1, 'The best filament for diode engraving — a frosted light mark on dark plastic.'),
      frow('PLA (black / dark)', '—', 'Deep engrave', 'fill', 45, 1500, 2, 0.1, 'Let the part cool between passes or it deforms.'),
      frow('PLA (natural / white)', '—', 'Engrave', 'fill', 60, 1200, 1, 0.1, 'Weak contrast on light colours; marking spray or paint helps.'),
      frow('PLA (silk / glossy)', '—', 'Engrave', 'fill', 20, 4000, 1, 0.1, 'Silk coatings scorch easily — start below matte PLA.'),
      frow('PLA (matte)', '—', 'Engrave', 'fill', 30, 2500, 1, 0.1, ''),
      frow('PLA printed sheet', '1 mm', 'Cut', 'line', 100, 180, 3, 0.1, 'Edges melt and bead; thin flat prints cut better than solid parts.'),
      frow('PLA printed sheet', '2 mm', 'Cut', 'line', 100, 120, 5, 0.1, ''),
      frow('Wood-fill PLA', '—', 'Engrave', 'fill', 30, 3000, 1, 0.08, 'Behaves like thin plywood; the best contrast of any filament.'),
      frow('Carbon-fibre PLA / PETG', '—', 'Engrave', 'fill', 30, 2500, 1, 0.08, 'Dark and matte, so it marks cleanly.'),
      frow('Glow-in-the-dark PLA', '—', 'Engrave', 'fill', 35, 2500, 1, 0.1, 'Abrasive filler; marks grey.'),
      frow('PETG (black / opaque)', '—', 'Engrave', 'fill', 30, 2500, 1, 0.1, 'Melts and strings more than PLA; keep the speed up.'),
      frow('PETG (clear)', '—', 'Engrave', 'fill', 60, 1500, 1, 0.1, 'Diode light passes through clear PETG — paint the surface first, or use CO₂.'),
      frow('TPU (flexible)', '—', 'Engrave', 'fill', 20, 3500, 1, 0.1, 'Low power only; the surface distorts quickly.'),
      frow('PVB (polishable)', '—', 'Engrave', 'fill', 20, 3500, 1, 0.1, 'Softens at low temperature — keep power minimal.'),
      frow('HIPS', '—', 'Engrave', 'fill', 30, 2500, 1, 0.1, 'Styrene fumes: extract outdoors, never into the room.'),
      frow('ABS / ASA', '—', 'Engrave', 'fill', 25, 3000, 1, 0.1, 'Gives off styrene and fine soot — outdoor-vented extraction only.'),
      frow('Nylon (PA, PA-CF)', '—', 'Engrave', 'fill', 35, 2500, 1, 0.1, 'Can release hydrogen cyanide. Vent outdoors, keep jobs short, never leave it running.'),
      frow('Polycarbonate (PC)', '—', 'Engrave', 'fill', 40, 2000, 1, 0.1, 'Burns brown and yellows at the edges; results are usually poor.'),
      frow('Polypropylene (PP)', '—', 'Engrave', 'fill', 25, 3000, 1, 0.1, 'Melts into puddles instead of marking; test on scrap.'),
      frow('Resin print (cured SLA)', '—', 'Engrave', 'fill', 25, 3000, 1, 0.1, 'Wash and fully cure the part first; uncured resin fumes are toxic.'),
      never('PVC / vinyl filament', 'Releases chlorine gas, which corrodes the machine and is dangerous to breathe.'),
      never('Flame-retardant / PVC-blend filament', 'Halogenated additives release corrosive acid gas.')
    ]
  },
  'filament-co2': {
    label: '3D filaments — CO₂ (plastic)',
    note: FILAMENT_NOTE + ' CO₂ light is absorbed by every plastic, so clear filament engraves too.',
    items: [
      frow('PLA (any colour)', '—', 'Engrave', 'fill', 15, 9000, 1, 0.1, 'CO₂ marks light and clear filament as well as dark.'),
      frow('PLA (any colour)', '—', 'Deep engrave', 'fill', 30, 4000, 2, 0.1, ''),
      frow('PLA printed sheet', '2 mm', 'Cut', 'line', 45, 700, 1, 0.1, 'Edges stay glossy; a slow second pass cleans the underside.'),
      frow('PLA printed sheet', '4 mm', 'Cut', 'line', 60, 350, 2, 0.1, ''),
      frow('PETG (clear or opaque)', '—', 'Engrave', 'fill', 18, 8000, 1, 0.1, 'Frosted mark; keep the speed high to avoid melt-back.'),
      frow('PETG printed sheet', '2 mm', 'Cut', 'line', 45, 600, 1, 0.1, ''),
      frow('Wood-fill PLA', '—', 'Engrave', 'fill', 20, 7000, 1, 0.1, 'Darkens like real wood.'),
      frow('Carbon-fibre PLA / PETG', '—', 'Engrave', 'fill', 20, 7000, 1, 0.08, ''),
      frow('TPU (flexible)', '—', 'Engrave', 'fill', 12, 9000, 1, 0.1, 'Very low power; the surface deforms easily.'),
      frow('PVB (polishable)', '—', 'Engrave', 'fill', 12, 9000, 1, 0.1, ''),
      frow('HIPS', '—', 'Engrave', 'fill', 18, 8000, 1, 0.1, 'Styrene fumes: vent outdoors.'),
      frow('ABS / ASA', '—', 'Engrave', 'fill', 18, 8000, 1, 0.1, 'Styrene and soot; vent outdoors and clean the lens afterwards.'),
      frow('Nylon (PA, PA-CF)', '—', 'Engrave', 'fill', 22, 7000, 1, 0.1, 'Can release hydrogen cyanide. Vent outdoors and stay with the machine.'),
      frow('Polycarbonate (PC)', '—', 'Engrave', 'fill', 25, 6000, 1, 0.1, 'Yellows and chars; test on scrap.'),
      frow('Polypropylene (PP)', '—', 'Engrave', 'fill', 15, 9000, 1, 0.1, 'Melts readily; light marking only.'),
      frow('Resin print (cured SLA)', '—', 'Engrave', 'fill', 15, 8000, 1, 0.1, 'Cure and wash the part before lasering.'),
      never('PVC / vinyl filament', 'Releases chlorine gas, which corrodes the machine and is dangerous to breathe.'),
      never('Flame-retardant / PVC-blend filament', 'Halogenated additives release corrosive acid gas.')
    ]
  }
});

export function materialSetFor(device) {
  if (device.type === 'co2') return 'co2';
  if (device.type === 'fiber' || device.type === 'ir' || device.type === 'uv') return 'fiber';
  const w = device.power || 5;
  if (w <= 6) return 'diode-low';
  if (w < 20) return 'diode-mid';
  return 'diode-high';
}
