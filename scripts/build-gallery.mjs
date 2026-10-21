// Renders docs/gallery.html from docs/gallery/items.json, reusing the
// stylesheet and chrome from docs/index.html so the gallery cannot drift from
// the rest of the site. Run with `npm run gallery`.
//
// The item shape is deliberately the shape a database row would have, so that
// when submissions arrive the page can be fed from a feed instead of a file
// without the markup changing.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'docs', 'index.html');
const dataPath = path.join(root, 'docs', 'gallery', 'items.json');
const outPath = path.join(root, 'docs', 'gallery.html');

const index = fs.readFileSync(indexPath, 'utf8');
const grab = (re, what) => {
  const m = index.match(re);
  if (!m) throw new Error(`could not find ${what} in docs/index.html — did its markup change?`);
  return m[1];
};
const css = grab(/<style>([\s\S]*?)<\/style>/, 'the <style> block');
const header = grab(/(<header>[\s\S]*?<\/header>)/, 'the <header>').replace(/href="#/g, 'href="./#');
const footer = grab(/(<footer>[\s\S]*?<\/footer>)/, 'the <footer>').replace(/href="#/g, 'href="./#');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let items = [];
try {
  items = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch {
  items = [];
}

// Every referenced file has to exist, or the page ships broken links.
const missing = [];
for (const it of items) {
  for (const key of ['preview', 'file']) {
    if (!it[key]) continue;
    if (!fs.existsSync(path.join(root, 'docs', 'gallery', it[key]))) missing.push(`${it.id}: ${it[key]}`);
  }
}
if (missing.length) {
  console.error('Missing files referenced by items.json:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const cats = [...new Set(items.map(i => i.category))];

const card = it => {
  const isPhoto = /\.(jpe?g|png|webp)$/i.test(it.preview || '');
  const made = it.source === 'built-in'
    ? `<span class="tag">Ships with the app</span>`
    : `<span class="tag made">Made by ${esc(it.by)}</span>`;
  return `      <figure class="piece">
        <a class="shot" href="gallery/${esc(it.file)}" download>
          <img src="gallery/${esc(it.preview)}" alt="${esc(it.title)}" loading="lazy"${isPhoto ? '' : ' class="vec"'}>
        </a>
        <figcaption>
          <h3>${esc(it.title)}</h3>
          <p class="meta">${esc(it.category)} · ${esc(it.size)} · ${esc(it.cut)} layer</p>
          <p>${esc(it.note)}</p>
          <p class="meta">${made} <span class="tag">${esc(it.licence)}</span></p>
          <a class="btn small" href="gallery/${esc(it.file)}" download>Download SVG</a>
        </figcaption>
      </figure>`;
};

const empty = `    <div class="note">Nothing here yet.</div>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gallery — Crafter Studio</title>
<meta name="description" content="Ready-to-cut designs for Crafter Studio, free to download and use. Mandalas, Indian motifs, frames, festival designs and patterns.">
<link rel="icon" href="assets/favicon-64.png">
<style>
${css}
  /* ---------- gallery ---------- */
  .pieces{display:grid; grid-template-columns:repeat(auto-fill, minmax(260px,1fr)); gap:22px; margin-top:26px}
  .piece{margin:0; background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; display:flex; flex-direction:column}
  .piece .shot{display:block; background:#f6f7f9; aspect-ratio:1/1; display:grid; place-items:center; padding:18px}
  .piece img{max-width:100%; max-height:100%; display:block}
  .piece img.vec{width:82%; height:82%; object-fit:contain}
  .piece figcaption{padding:16px 18px 18px; display:flex; flex-direction:column; gap:7px}
  .piece h3{margin:0; font-size:16.5px}
  .piece p{margin:0; font-size:14px; color:var(--muted)}
  .piece p.meta{font-size:12.5px; color:var(--dim)}
  .tag{display:inline-block; border:1px solid var(--line); border-radius:99px; padding:2px 9px; margin-right:5px; font-size:11.5px}
  .tag.made{border-color:var(--accent); color:var(--accent)}
  .piece .btn{align-self:flex-start; margin-top:4px}
  .cats{display:flex; flex-wrap:wrap; gap:8px; margin-top:18px}
  .cats .tag{font-size:12.5px; padding:4px 11px}
</style>
</head>
<body>
<a id="top"></a>
${header}

<section>
  <div class="wrap">
    <h1>Gallery</h1>
    <p class="sub">Designs that cut as they are. Download the SVG, open it in Crafter Studio, set a layer and go. Everything here is free to use, including for work you sell.</p>
    <div class="cats">${cats.map(c => `<span class="tag">${esc(c)}</span>`).join('')}</div>
    <div class="pieces">
${items.length ? items.map(card).join('\n') : empty}
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <h2>Made something?</h2>
    <p class="sub">This page starts with the designs that ship inside the app. If you have cut or engraved something with Crafter Studio, post a photo in <b>Show and tell</b> on GitHub — the good ones go up here, with your name on them. Say what machine, material and settings you used; that is the part other people need.</p>
    <p><a class="btn primary" href="https://github.com/raghukumarkotikala/CrafterStudio/discussions/categories/show-and-tell">Show what you made</a></p>
  </div>
</section>

${footer}
</body>
</html>
`;

fs.writeFileSync(outPath, html, 'utf8');
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`docs/gallery.html: ${items.length} items across ${cats.length} categories, ${kb} KB`);
