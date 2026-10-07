// In-app manual. Topics come from help-content.js, which the website also renders.
import { h, openModal } from './dom.js';
import { TOPICS } from './help-content.js';

export { TOPICS };

export function openHelp(topicId) {
  let current = topicId && TOPICS.some(t => t.id === topicId) ? topicId : TOPICS[0].id;
  let query = '';

  const listEl = h('div', { class: 'help-list' });
  const bodyEl = h('div', { class: 'help-body' });

  const matches = t => {
    if (!query) return true;
    const q = query.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
  };

  function renderList() {
    listEl.innerHTML = '';
    const hits = TOPICS.filter(matches);
    if (!hits.length) {
      listEl.appendChild(h('div', { class: 'small muted', style: { padding: '8px' } }, 'Nothing matches.'));
      return;
    }
    for (const t of hits) {
      listEl.appendChild(h('div', {
        class: 'help-item' + (t.id === current ? ' sel' : ''),
        onClick: () => { current = t.id; renderList(); renderBody(); }
      }, t.title));
    }
  }

  function renderBody() {
    const t = TOPICS.find(x => x.id === current) || TOPICS[0];
    bodyEl.innerHTML = '';
    bodyEl.appendChild(h('h3', {}, t.title));
    bodyEl.appendChild(h('div', { html: t.body }));
    bodyEl.scrollTop = 0;
  }

  const search = h('input', { class: 'inp', placeholder: 'Search help…' });
  search.addEventListener('input', () => {
    query = search.value.trim();
    const hits = TOPICS.filter(matches);
    if (hits.length && !hits.some(t => t.id === current)) current = hits[0].id;
    renderList();
    renderBody();
  });
  search.addEventListener('keydown', e => e.stopPropagation());

  renderList();
  renderBody();

  openModal({
    title: 'Crafter Studio help',
    width: '940px',
    body: h('div', { class: 'help' },
      h('div', { class: 'help-nav' }, search, listEl),
      bodyEl),
    buttons: [{ label: 'Close', primary: true }]
  });
}
