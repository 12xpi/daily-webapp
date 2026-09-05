(function () {
  const MONTHS_GENITIVE = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const WEEKDAYS = [
    'воскресенье', 'понедельник', 'вторник', 'среда',
    'четверг', 'пятница', 'суббота'
  ];

  let glossary = {};
  let ethicsBlocks = null;
  let ethicsLoadingPromise = null;

  const BOOK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" fill="currentColor"/></svg>';

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Supports **bold**, *italic*, [[term]] / [[displayText|term]] glossary words,
  // and {{blockId}} tappable references into data/ethics.json.
  // Escapes HTML first so raw text stays safe, then converts markers to tags.
  // Line breaks (\n) are left as-is; CSS white-space:pre-line renders them.
  function formatText(str) {
    let out = escapeHtml(str);
    out = out.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
    out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, display, key) => {
      const term = (key || display).trim();
      return `<span class="term" data-term="${escapeHtml(term)}">${display}</span>`;
    });
    out = out.replace(/\{\{([^}]+)\}\}/g, (match, id) => {
      return `<button type="button" class="book-ref" data-ref="${escapeHtml(id.trim())}" aria-label="Открыть в тексте книги">${BOOK_ICON}</button>`;
    });
    return out;
  }

  function setFormatted(el, str) {
    el.innerHTML = formatText(str);
  }

  function openGlossary(term) {
    const definition = glossary[term];
    if (!definition) return;
    const card = document.getElementById('modalCard');
    card.innerHTML = `<p>${formatText(definition)}</p>`;
    document.getElementById('modalOverlay').hidden = false;
  }

  function closeGlossary() {
    document.getElementById('modalOverlay').hidden = true;
  }

  function setupGlossaryHandlers() {
    document.addEventListener('click', (e) => {
      const term = e.target.closest('.term');
      if (term) {
        openGlossary(term.dataset.term);
        return;
      }
      const ref = e.target.closest('.book-ref');
      if (ref) {
        openBook(ref.dataset.ref);
        return;
      }
      if (e.target.id === 'modalOverlay') {
        closeGlossary();
      }
      if (e.target.id === 'bookClose') {
        closeBook();
      }
    });
  }

  async function ensureEthicsLoaded() {
    if (ethicsBlocks) return ethicsBlocks;
    if (!ethicsLoadingPromise) {
      ethicsLoadingPromise = loadJSON('data/ethics.json').then(data => {
        ethicsBlocks = data;
        return data;
      });
    }
    return ethicsLoadingPromise;
  }

  function renderBook(blocks) {
    const body = document.getElementById('bookBody');
    if (body.dataset.rendered) return;

    const frag = document.createDocumentFragment();
    blocks.forEach(b => {
      const el = document.createElement('div');
      el.className = 'book-block';
      el.id = 'book-' + b.id;

      if (b.type === 'part_title') {
        const h = document.createElement('h2');
        h.className = 'book-part-title';
        h.textContent = b.label;
        el.appendChild(h);

        const sub = document.createElement('p');
        sub.className = 'book-part-subtitle';
        sub.textContent = b.text;
        el.appendChild(sub);
      } else {
        const label = document.createElement('div');
        label.className = 'book-label';
        label.textContent = b.label;
        el.appendChild(label);

        const text = document.createElement('p');
        text.className = 'book-text';
        text.textContent = b.text;
        el.appendChild(text);
      }

      frag.appendChild(el);
    });

    body.appendChild(frag);
    body.dataset.rendered = 'true';
  }

  async function openBook(refId) {
    let blocks;
    try {
      blocks = await ensureEthicsLoaded();
    } catch (e) {
      return;
    }
    renderBook(blocks);
    document.getElementById('bookOverlay').hidden = false;

    requestAnimationFrame(() => {
      const target = document.getElementById('book-' + refId);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      target.classList.add('book-highlight');
      setTimeout(() => target.classList.remove('book-highlight'), 1800);
    });
  }

  function closeBook() {
    document.getElementById('bookOverlay').hidden = true;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function dayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date - start;
    return Math.floor(diff / 86400000) + 1;
  }

  function formatDate(date) {
    const day = date.getDate();
    const month = MONTHS_GENITIVE[date.getMonth()];
    const weekday = WEEKDAYS[date.getDay()];
    return `${day} ${month}, ${weekday}`;
  }

  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  }

  async function init() {
    const today = new Date();
    const key = `${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

    document.getElementById('date').textContent = formatDate(today);

    let reflections, prayers, stepPrayers;
    try {
      [reflections, prayers, stepPrayers] = await Promise.all([
        loadJSON('data/reflections.json'),
        loadJSON('data/prayers.json'),
        loadJSON('data/step_prayers.json')
      ]);
    } catch (e) {
      showEmpty();
      return;
    }

    try {
      glossary = await loadJSON('data/glossary.json');
    } catch (e) {
      glossary = {};
    }

    renderStepPrayers(stepPrayers);

    const reflection = reflections[key];
    const pairIndex = dayOfYear(today) % prayers.length;
    const pair = prayers[pairIndex];

    if (!reflection || !pair) {
      showEmpty();
      return;
    }

    setFormatted(document.querySelector('#prayer1 .prayer-text'), pair.classic);
    setFormatted(document.querySelector('#prayer2 .prayer-text'), pair.personal);

    document.querySelector('.reflection-title').textContent = reflection.title;
    setFormatted(document.querySelector('.reflection-desc'), reflection.description);
    setFormatted(document.querySelector('.reflection-content'), reflection.content);
    document.querySelector('.reflection-source').textContent = reflection.sources;
  }

  function renderStepPrayers(list) {
    const nav = document.getElementById('stepPrayers');
    if (!Array.isArray(list) || list.length === 0) return;

    list.forEach(item => {
      const details = document.createElement('details');
      details.className = 'step-prayer';

      const summary = document.createElement('summary');
      summary.textContent = item.title;
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'step-prayer-body';

      const text = document.createElement('p');
      text.className = 'step-prayer-text';
      setFormatted(text, item.text);
      body.appendChild(text);

      if (item.source) {
        const source = document.createElement('p');
        source.className = 'step-prayer-source';
        source.textContent = item.source;
        body.appendChild(source);
      }

      details.appendChild(body);
      nav.appendChild(details);
    });
  }

  function showEmpty() {
    document.getElementById('empty').hidden = false;
    document.getElementById('prayer1').hidden = true;
    document.getElementById('prayer2').hidden = true;
    document.getElementById('reflection').hidden = true;
    document.querySelectorAll('.rule').forEach(r => r.hidden = true);
  }

  init();
  setupGlossaryHandlers();
})();
