// Renders docs/guide.html from the same topics the app's Help browser shows
// (src/js/help-content.js), reusing the stylesheet and chrome from
// docs/index.html so the guide cannot drift from the site or from the app.
// Run with `npm run guide`.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TOPICS } from '../src/js/help-content.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'docs', 'index.html');
const outPath = path.join(root, 'docs', 'guide.html');

const index = fs.readFileSync(indexPath, 'utf8');

const grab = (re, what) => {
  const m = index.match(re);
  if (!m) throw new Error(`could not find ${what} in docs/index.html — did its markup change?`);
  return m[1];
};

const css = grab(/<style>([\s\S]*?)<\/style>/, 'the <style> block');
// Anchors in the shared header point at sections of the home page, so they need
// to leave the guide rather than hunt for ids that only exist on index.html.
const header = grab(/(<header>[\s\S]*?<\/header>)/, 'the <header>')
  .replace(/href="#/g, 'href="./#');
const footer = grab(/(<footer>[\s\S]*?<\/footer>)/, 'the <footer>')
  .replace(/href="#/g, 'href="./#');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const toc = TOPICS.map(t => `      <li><a href="#${t.id}">${esc(t.title)}</a></li>`).join('\n');
const sections = TOPICS.map(t => `
    <section class="topic" id="${t.id}">
      <h2>${esc(t.title)}</h2>
      ${t.body.trim()}
      <p class="totop"><a href="#top">Back to contents</a></p>
    </section>`).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guide — Crafter Studio</title>
<meta name="description" content="How to use Crafter Studio: machine setup, drawing, layers and burn settings, materials, running a job over USB, G-code export and laser safety.">
<link rel="icon" href="assets/favicon-64.png">
<style>
${css}
  /* ---------- guide ---------- */
  .guide{display:grid; grid-template-columns:240px 1fr; gap:40px; align-items:start}
  .toc{position:sticky; top:20px}
  .toc h2{font-size:13px; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); margin:0 0 10px}
  .toc ol{margin:0; padding-left:20px; font-size:14px; line-height:1.9}
  .toc a{color:var(--text); text-decoration:none}
  .toc a:hover{color:var(--accent); text-decoration:underline}
  .topic{padding:0 0 34px; margin:0 0 34px; border-bottom:1px solid var(--line)}
  .topic:last-of-type{border-bottom:0}
  .topic h2{margin:0 0 14px}
  .topic h4{margin:20px 0 6px; font-size:13px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted)}
  .topic ul,.topic ol{padding-left:20px}
  .topic li{margin-bottom:6px}
  .topic code{background:var(--line); padding:1px 5px; border-radius:3px; font-size:13px}
  .topic kbd{background:var(--line); border-radius:4px; padding:1px 6px; font-size:12px}
  .topic .tbl,.topic table{width:100%; border-collapse:collapse; margin:10px 0 14px; font-size:14px}
  .topic th,.topic td{text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top}
  .topic th{color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.4px}
  .totop{margin-top:16px; font-size:13px}
  @media (max-width:860px){
    .guide{grid-template-columns:1fr; gap:24px}
    .toc{position:static}
  }
</style>
</head>
<body>

${header}

<section id="top">
  <div class="wrap">
    <h1>Guide</h1>
    <p class="sub">Everything in here is also in the app under <b>Help → Help Contents</b>, or by pressing <kbd>F1</kbd>.</p>
  </div>
</section>

<section>
  <div class="wrap guide">
    <nav class="toc">
      <h2>Contents</h2>
      <ol>
${toc}
      </ol>
    </nav>
    <div class="topics">${sections}
    </div>
  </div>
</section>

${footer}

</body>
</html>
`;

fs.writeFileSync(outPath, html, 'utf8');
console.log(`docs/guide.html: ${TOPICS.length} topics, ${(html.length / 1024).toFixed(1)} KB`);
