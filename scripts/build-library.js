// Packs the icon sets from node_modules into compact JSON bundles in src/library/.
// Run with `npm run library` (also runs automatically before packaging).
// Format per file: { set, license, viewBox, items: [[name, category, tags, body], ...] }
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src', 'library');
fs.mkdirSync(outDir, { recursive: true });

function innerSvg(svg) {
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  return (m ? m[1] : '')
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/g, '') // Tabler's bounding box helper
    .replace(/\s*\n\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function write(file, data) {
  const p = path.join(outDir, file);
  fs.writeFileSync(p, JSON.stringify(data));
  console.log(`${file}: ${data.items.length} items, ${(fs.statSync(p).size / 1024 / 1024).toFixed(2)} MB`);
}

// ---- Tabler (MIT)
const tablerDir = path.join(root, 'node_modules', '@tabler', 'icons');
const tablerMeta = JSON.parse(fs.readFileSync(path.join(tablerDir, 'icons.json'), 'utf8'));
for (const style of ['outline', 'filled']) {
  const dir = path.join(tablerDir, 'icons', style);
  const items = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort()) {
    const name = f.slice(0, -4);
    const meta = tablerMeta[name] || {};
    const body = innerSvg(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!body) continue;
    items.push([name, meta.category || 'Other', (meta.tags || []).join(' '), body]);
  }
  write(`tabler-${style}.json`, {
    set: `Tabler Icons (${style})`,
    license: 'MIT — Copyright (c) 2020-2024 Paweł Kuna',
    viewBox: '0 0 24 24',
    stroke: style === 'outline',
    items
  });
}
fs.copyFileSync(path.join(tablerDir, 'LICENSE'), path.join(outDir, 'LICENSE-tabler.txt'));

// ---- Material Design Icons (Apache-2.0)
const mdiDir = path.join(root, 'node_modules', '@mdi', 'svg');
const mdiMeta = JSON.parse(fs.readFileSync(path.join(mdiDir, 'meta.json'), 'utf8'));
const mdiItems = [];
for (const m of mdiMeta) {
  if (m.deprecated) continue;
  const file = path.join(mdiDir, 'svg', m.name + '.svg');
  if (!fs.existsSync(file)) continue;
  const body = innerSvg(fs.readFileSync(file, 'utf8'));
  const cat = (m.tags && m.tags[0]) || 'Other';
  mdiItems.push([m.name, cat, [...(m.aliases || []), ...(m.tags || [])].join(' '), body]);
}
write('mdi.json', {
  set: 'Material Design Icons',
  license: 'Apache-2.0 — Pictogrammers',
  viewBox: '0 0 24 24',
  stroke: false,
  items: mdiItems
});
fs.copyFileSync(path.join(mdiDir, 'LICENSE'), path.join(outDir, 'LICENSE-mdi.txt'));
