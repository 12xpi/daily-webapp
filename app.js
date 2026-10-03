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

  // --- Аудиозаписи: Cloudflare Worker -> Google Drive ---
  const AUDIO_API = 'https://daily-audio.sgvyzsb5.workers.dev';
  let audioToken = localStorage.getItem('audioToken') || '';
  let ethicsBlocks = null;
  let ethicsLoadingPromise = null;

  const BOOK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" fill="currentColor"/></svg>';

  const DIVIDER_ICON = '<span class="text-divider" aria-hidden="true"><img src="images/divider-cross.png" alt="" class="text-divider-icon"></span>';

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
  // When withDividers is true, blank lines between paragraphs (\n\n) are
  // rendered as a small cross-icon divider instead of extra vertical space.
  function formatText(str, withDividers) {
    let out = escapeHtml(str);
    out = out.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
    out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, display, key) => {
      const term = (key || display).trim();
      return `<span class="term" data-term="${escapeHtml(term)}">${display}</span>`;
    });
    out = out.replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
      let refType = 'ethics';
      let id = ref.trim();
      if (id.startsWith('letter:')) {
        refType = 'letter';
        id = id.slice('letter:'.length).trim();
      }
      return `<button type="button" class="book-ref" data-ref-type="${refType}" data-ref="${escapeHtml(id)}" aria-label="Открыть в тексте книги">${BOOK_ICON}</button>`;
    });
    if (withDividers) {
      out = out.replace(/\n{2,}/g, DIVIDER_ICON);
    }
    return out;
  }

  function setFormatted(el, str, withDividers) {
    el.innerHTML = formatText(str, withDividers);
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
        if (ref.dataset.refType === 'letter') {
          openLetter(ref.dataset.ref);
        } else {
          openBook(ref.dataset.ref);
        }
        return;
      }
      if (e.target.id === 'modalOverlay') {
        closeGlossary();
      }
      if (e.target.id === 'bookClose') {
        closeBook();
      }
      if (e.target.id === 'lettersClose') {
        closeLetters();
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

  let lettersData = null;
  let lettersLoadingPromise = null;

  async function ensureLettersLoaded() {
    if (lettersData) return lettersData;
    if (!lettersLoadingPromise) {
      lettersLoadingPromise = loadJSON('data/letters.json').then(data => {
        lettersData = data;
        return data;
      });
    }
    return lettersLoadingPromise;
  }

  function renderLetters(letters) {
    const body = document.getElementById('lettersBody');
    if (body.dataset.rendered) return;

    const frag = document.createDocumentFragment();
    letters.forEach(letter => {
      const el = document.createElement('div');
      el.className = 'book-block letter-block';
      el.id = 'letter-' + letter.id;

      const label = document.createElement('div');
      label.className = 'letter-number';
      label.textContent = 'Письмо ' + letter.number;
      el.appendChild(label);

      const meta = document.createElement('div');
      meta.className = 'letter-meta';
      const to = document.createElement('span');
      to.className = 'letter-meta-to';
      to.textContent = letter.to_full || letter.to || '';
      const from = document.createElement('span');
      from.className = 'letter-meta-from';
      from.textContent = letter.from ? 'от ' + letter.from : '';
      meta.appendChild(to);
      meta.appendChild(from);
      el.appendChild(meta);

      if (letter.subtitle) {
        const subtitle = document.createElement('div');
        subtitle.className = 'letter-subtitle';
        subtitle.textContent = letter.subtitle;
        el.appendChild(subtitle);
      }

      if (letter.salutation) {
        const salutation = document.createElement('p');
        salutation.className = 'letter-salutation';
        salutation.textContent = letter.salutation;
        el.appendChild(salutation);
      }

      const text = document.createElement('p');
      text.className = 'book-text';
      setFormatted(text, letter.text);
      el.appendChild(text);

      if (letter.place_date) {
        const placeDate = document.createElement('p');
        placeDate.className = 'letter-place-date';
        placeDate.textContent = letter.place_date;
        el.appendChild(placeDate);
      }

      frag.appendChild(el);
    });

    body.appendChild(frag);
    body.dataset.rendered = 'true';
  }

  async function openLetter(refId) {
    let letters;
    try {
      letters = await ensureLettersLoaded();
    } catch (e) {
      return;
    }
    renderLetters(letters);
    document.getElementById('lettersOverlay').hidden = false;

    requestAnimationFrame(() => {
      const target = document.getElementById('letter-' + refId);
      if (!target) return;
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
      target.classList.add('book-highlight');
      setTimeout(() => target.classList.remove('book-highlight'), 1800);
    });
  }

  function closeLetters() {
    document.getElementById('lettersOverlay').hidden = true;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function dayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  function renderDayHeader(d) {
    const hero = document.getElementById('hero');
    const dayEl = hero.querySelector('.hero-date-day');
    const monthEl = hero.querySelector('.hero-date-month');
    const weekdayEl = hero.querySelector('.hero-date-weekday');

    dayEl.textContent = d.getDate();
    monthEl.textContent = MONTHS_GENITIVE[d.getMonth()];
    weekdayEl.textContent = WEEKDAYS[d.getDay()];

    const doy = dayOfYear(d);
    const imageIndex = ((doy - 1) % 19) + 1;
    const img = hero.querySelector('.hero-image');
    img.src = `images/hero/${imageIndex}.jpg`;
  }

  function buildStepPrayer(item, isSpinoza) {
    const details = document.createElement('details');
    details.className = 'step-prayer';

    const summary = document.createElement('summary');
    summary.textContent = item.title;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'step-prayer-body';

    const text = document.createElement('p');
    text.className = 'step-prayer-text';
    setFormatted(text, item.text, isSpinoza);
    body.appendChild(text);

    if (item.source) {
      const source = document.createElement('p');
      source.className = 'step-prayer-source';
      source.textContent = item.source;
      body.appendChild(source);
    }

    details.appendChild(body);
    return details;
  }

  function buildPrayerGroup(groupTitle, items) {
    const group = document.createElement('details');
    group.className = 'prayer-group';

    const summary = document.createElement('summary');
    summary.textContent = groupTitle;
    group.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'prayer-group-body';
    items.forEach(item => body.appendChild(buildStepPrayer(item, false)));
    group.appendChild(body);

    return group;
  }

  // ============================================================
  // АУДИОЗАПИСИ — доработанный интерфейс
  // ============================================================

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  // Форматирует длительность (секунды → минуты) для метаданных
  function fmtDuration(sec) {
    if (!sec || !Number.isFinite(sec)) return '';
    const min = Math.round(sec / 60);
    return min + ' мин';
  }

  /* ---- память позиции воспроизведения ----
     Всё хранится в localStorage этого устройства: ключ audioPos:<id> —
     секунда, на которой остановились, audioDone:<id> — отметка «прослушано».
     Записи привязаны к ID файла на Drive, поэтому переименование файла
     позицию не сбивает. Перезаливка файла (новый ID) — сбивает. */
  const POS_PREFIX = 'audioPos:';
  const DONE_PREFIX = 'audioDone:';
  const RESUME_MIN = 10;    // короче 10 секунд не запоминаем — это случайный тап
  const SAVE_EVERY = 5;     // как часто сбрасывать позицию на диск, сек
  const LISTENED_GAP = 60;  // столько секунд до конца считаем «дослушано» (было 25, сделал 60)

  function loadPos(id) {
    try {
      const v = parseFloat(localStorage.getItem(POS_PREFIX + id));
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function savePos(id, sec) {
    try {
      localStorage.setItem(POS_PREFIX + id, String(Math.floor(sec)));
    } catch (e) {}
  }

  function clearPos(id) {
    try {
      localStorage.removeItem(POS_PREFIX + id);
    } catch (e) {}
  }

  function isDone(id) {
    try {
      return localStorage.getItem(DONE_PREFIX + id) === '1';
    } catch (e) {
      return false;
    }
  }

  function setDone(id, flag) {
    try {
      if (flag) localStorage.setItem(DONE_PREFIX + id, '1');
      else localStorage.removeItem(DONE_PREFIX + id);
    } catch (e) {}
  }

  async function fetchAudioList() {
    let res;
    try {
      res = await fetch(AUDIO_API + '/list', {
        headers: { Authorization: 'Bearer ' + audioToken },
      });
    } catch (e) {
      const err = new Error('network');
      err.code = 'network';
      throw err;
    }
    if (res.status === 401) {
      const err = new Error('unauthorized');
      err.code = 401;
      throw err;
    }
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : data.files || [];
  }

  function audioErrorText(e) {
    if (e && e.code === 'network') {
      return 'Воркер недоступен. Проверьте адрес в AUDIO_API (app.js) и что воркер задеплоен.';
    }
    return 'Сервер ответил ошибкой' + (e && e.code ? ' ' + e.code : '') +
           '. Проверьте секреты DRIVE_API_KEY и DRIVE_FOLDER_ID в Cloudflare.';
  }

  function renderAudioGate(container) {
    container.innerHTML = '';

    const gate = document.createElement('div');
    gate.className = 'audio-gate';

    const hint = document.createElement('p');
    hint.textContent = 'Введите пароль для доступа к записям. Он сохранится только на этом устройстве.';
    gate.appendChild(hint);

    const row = document.createElement('div');
    row.className = 'audio-gate-row';

    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'current-password';
    input.placeholder = 'Пароль';
    input.setAttribute('aria-label', 'Пароль для раздела Аудиозаписи');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Войти';

    row.append(input, btn);
    gate.appendChild(row);

    const error = document.createElement('div');
    error.className = 'audio-gate-error';
    error.hidden = true;
    gate.appendChild(error);

    container.appendChild(gate);

    async function submit() {
      const value = input.value.trim();
      if (!value) return;
      btn.disabled = true;
      btn.textContent = 'Проверка…';
      error.hidden = true;

      audioToken = value;
      try {
        const files = await fetchAudioList();
        localStorage.setItem('audioToken', value);
        renderAudioList(container, files);
      } catch (e) {
        audioToken = '';
        localStorage.removeItem('audioToken');
        btn.disabled = false;
        btn.textContent = 'Войти';
        error.textContent = e.code === 401
          ? 'Неверный пароль.'
          : audioErrorText(e);
        error.hidden = false;
      }
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  // Собирает одну строку: дата и длительность сверху, название снизу, плеер, статус
  function buildAudioRow(f, list, onChange) {
    const row = document.createElement('div');
    row.className = 'audio-row';

    // Первая строка: дата · длительность + значок статуса
    const metaRow = document.createElement('div');
    metaRow.className = 'audio-meta-row';

    const metaText = document.createElement('div');
    metaText.className = 'audio-meta';
    const parts = [fmtDate(f.modifiedTime), fmtDuration(f.duration)].filter(Boolean);
    metaText.textContent = parts.join(' · ');
    metaRow.appendChild(metaText);

    const badge = document.createElement('div');
    badge.className = 'audio-badge';
    metaRow.appendChild(badge);

    row.appendChild(metaRow);

    // Вторая строка: название записи
    const title = document.createElement('div');
    title.className = 'audio-title';
    title.textContent = f.title || f.name;
    row.appendChild(title);

    // Плеер
    const audio = document.createElement('audio');
    audio.className = 'audio-player';
    audio.controls = true;
    audio.preload = 'none';
    audio.src =
      AUDIO_API + '/audio/' + encodeURIComponent(f.id) +
      '?t=' + encodeURIComponent(audioToken);
    row.appendChild(audio);

    let saved = loadPos(f.id);
    let lastSaved = saved;
    let applied = false;

    function updateBadge() {
      if (isDone(f.id)) {
        badge.className = 'audio-badge audio-badge-done';
        badge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      } else if (saved > RESUME_MIN) {
        const min = Math.round(saved / 60);
        badge.className = 'audio-badge audio-badge-progress';
        badge.textContent = '@ ' + min;
      } else {
        badge.className = 'audio-badge audio-badge-new';
        badge.textContent = 'new';
      }
    }

    updateBadge();

    function seekToSaved() {
      if (applied) return;
      const dur = audio.duration;
      if (!dur || !Number.isFinite(dur)) return;
      applied = true;
      if (saved > RESUME_MIN && saved < dur - LISTENED_GAP) {
        try {
          audio.currentTime = saved;
        } catch (e) {}
      }
      updateBadge();
    }

    audio.addEventListener('loadedmetadata', seekToSaved);
    audio.addEventListener('canplay', seekToSaved);

    audio.addEventListener('timeupdate', () => {
      const cur = audio.currentTime;
      const dur = audio.duration;

      if (dur && dur - cur <= LISTENED_GAP) return;

      if (Math.abs(cur - lastSaved) < SAVE_EVERY) return;
      lastSaved = cur;

      if (cur > RESUME_MIN) {
        saved = cur;
        savePos(f.id, cur);
        updateBadge();
      } else {
        saved = 0;
        clearPos(f.id);
      }
    });

    audio.addEventListener('ended', () => {
      clearPos(f.id);
      setDone(f.id, true);
      saved = 0;
      applied = true;
      updateBadge();
      if (onChange) onChange();
    });

    audio.addEventListener('play', () => {
      list.querySelectorAll('audio').forEach((other) => {
        if (other !== audio) other.pause();
      });
    });

    return row;
  }

  function renderAudioList(container, files) {
    container.innerHTML = '';

    if (!files.length) {
      const empty = document.createElement('p');
      empty.className = 'audio-status';
      empty.textContent = 'Записей пока нет.';
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'audio-list';

    files.forEach((f) => {
      list.appendChild(buildAudioRow(f, list, null));
    });

    container.appendChild(list);
  }

  function buildAudioGroup() {
    const group = document.createElement('details');
    group.className = 'prayer-group';

    const summary = document.createElement('summary');
    summary.textContent = 'Аудиозаписи';
    group.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'prayer-group-body';
    group.appendChild(body);

    let loaded = false;

    group.addEventListener('toggle', async () => {
      if (!group.open || loaded) return;
      loaded = true;

      if (!audioToken) {
        renderAudioGate(body);
        return;
      }

      const status = document.createElement('p');
      status.className = 'audio-status';
      status.textContent = 'Загрузка записей…';
      body.appendChild(status);

      try {
        const files = await fetchAudioList();
        renderAudioList(body, files);
      } catch (e) {
        body.innerHTML = '';
        if (e.code === 401) {
          audioToken = '';
          localStorage.removeItem('audioToken');
          renderAudioGate(body);
        } else {
          const err = document.createElement('p');
          err.className = 'audio-status';
          err.textContent = audioErrorText(e);
          body.appendChild(err);
        }
      }
    });

    return group;
  }

  function renderStepPrayers(aaPrayers, spinoza, aaProtocols) {
    const nav = document.getElementById('stepPrayers');

    if (Array.isArray(spinoza)) {
      spinoza.forEach(item => nav.appendChild(buildStepPrayer(item, true)));
    }

    if (Array.isArray(aaPrayers) && aaPrayers.length > 0) {
      nav.appendChild(buildPrayerGroup('Молитвы АА', aaPrayers));
    }

    if (Array.isArray(aaProtocols) && aaProtocols.length > 0) {
      nav.appendChild(buildPrayerGroup('Протоколы АА', aaProtocols));
    }

    nav.appendChild(buildAudioGroup());
  }

  function showEmpty() {
    document.getElementById('empty').hidden = false;
    document.getElementById('prayer1').hidden = true;
    document.getElementById('prayer2').hidden = true;
    document.getElementById('reflection').hidden = true;
    document.querySelectorAll('.rule').forEach(r => r.hidden = true);
  }

  async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function init() {
    try {
      const data = await loadJSON('data/data.json');
      glossary = data.glossary || {};

      renderDayHeader(new Date());

      const p1 = document.getElementById('prayer1Text');
      setFormatted(p1, data.prayer1, true);

      if (data.prayer2) {
        setFormatted(document.getElementById('prayer2Text'), data.prayer2, true);
      } else {
        document.getElementById('prayer2').hidden = true;
        document.querySelector('.rule--wide').hidden = true;
      }

      const refl = document.getElementById('reflection');
      if (data.reflection) {
        if (data.reflection.title) {
          document.getElementById('reflectionTitle').textContent = data.reflection.title;
        }
        if (data.reflection.desc) {
          document.getElementById('reflectionDesc').textContent = data.reflection.desc;
        } else {
          document.getElementById('reflectionDesc').hidden = true;
        }
        setFormatted(document.getElementById('reflectionContent'), data.reflection.text);
        if (data.reflection.source) {
          document.getElementById('reflectionSource').textContent = data.reflection.source;
        } else {
          document.getElementById('reflectionSource').hidden = true;
        }
      } else {
        refl.hidden = true;
        document.querySelectorAll('.rule').forEach(r => r.hidden = true);
      }

      if (data.spinoza || data.aaPrayers || data.aaProtocols) {
        renderStepPrayers(data.aaPrayers, data.spinoza, data.aaProtocols);
      } else {
        document.getElementById('stepPrayers').hidden = true;
      }

    } catch (e) {
      showEmpty();
    }
  }

  init();
  setupGlossaryHandlers();
})();
