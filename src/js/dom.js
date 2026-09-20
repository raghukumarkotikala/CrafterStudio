// Small DOM helpers: element builder, modals, toasts, form rows.
import { icon } from './icons.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Element.append(null) would insert the text "null"; skip empty conditionals.
export function appendAll(el, ...kids) {
  el.append(...kids.flat().filter(k => k != null && k !== false));
}

export function ibtn(name, title, onClick, extra = {}) {
  return h('button', { class: 'ibtn ' + (extra.class || ''), title, onClick, html: icon(name), ...extra.attrs });
}

export function toast(msg, kind = 'info', ms = 3800) {
  const root = document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + kind }, msg);
  root.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

let modalDepth = 0;
export function openModal({ title, body, buttons = [], width, onClose }) {
  const root = document.getElementById('modal-root');
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: 'modal', style: width ? { width } : null });
  const close = () => {
    back.remove();
    modalDepth--;
    document.removeEventListener('keydown', onKey, true);
    if (onClose) onClose();
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  const head = h('div', { class: 'modal-h' }, h('span', {}, title), h('button', { class: 'mini', html: icon('close'), onClick: close }));
  const foot = h('div', { class: 'modal-f' });
  for (const b of buttons) {
    foot.appendChild(h('button', {
      class: 'btn ' + (b.primary ? 'primary' : b.danger ? 'danger' : ''),
      onClick: async () => {
        const r = b.onClick ? await b.onClick() : undefined;
        if (r !== false) close();
      }
    }, b.label));
  }
  box.append(head, h('div', { class: 'modal-b' }, body));
  if (buttons.length) box.append(foot);
  back.appendChild(box);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  root.appendChild(back);
  modalDepth++;
  const first = box.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, box };
}

export function modalOpen() { return modalDepth > 0; }

export function row(label, ...ctl) {
  return h('div', { class: 'row' }, h('label', {}, label), h('div', { class: 'ctl' }, ...ctl));
}

export function num(value, onChange, { min, max, step = 'any', cls = '', unit } = {}) {
  const inp = h('input', { class: 'num ' + cls, type: 'number', value: value ?? '', min, max, step });
  const commit = () => {
    if (inp.value === '') return;
    let v = parseFloat(inp.value);
    if (isNaN(v)) return;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    onChange(v);
  };
  inp.addEventListener('change', commit);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); inp.blur(); } e.stopPropagation(); });
  return unit !== undefined ? [inp, h('span', { class: 'unit' }, unit)] : inp;
}

export function select(options, value, onChange, cls = 'inp') {
  const s = h('select', { class: cls, onChange: () => onChange(s.value) },
    ...Object.entries(options).map(([k, v]) => h('option', { value: k }, v)));
  s.value = value;
  return s;
}

export function check(value, onChange, label) {
  const c = h('input', { type: 'checkbox', checked: value, onChange: () => onChange(c.checked) });
  return label ? h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' } }, c, label) : c;
}

export function seg(options, value, onChange) {
  const wrap = h('div', { class: 'seg' });
  for (const [k, v] of Object.entries(options)) {
    wrap.appendChild(h('button', { class: k === value ? 'on' : '', onClick: () => onChange(k) }, v));
  }
  return wrap;
}

export function fmtNum(v, d = 2) {
  return (Math.round(v * 10 ** d) / 10 ** d).toString();
}
