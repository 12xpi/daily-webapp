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
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date - start;
    return Math.floor(diff / 86400000) + 1;
  }

  function formatDate(date) {
    const day = date.getDate();
    const month = MONTHS_GENITIVE[date.getMonth()];
    const weekday = WEEKDAYS[date.getDay()];
    return { day, month, weekday };
  }

  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  }

  async function init() {
    const today = new Date();
    const key = `${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

    const { day, month, weekday } = formatDate(today);
    document.getElementById('dateWeekday').textContent = weekday;
    document.getElementById('dateDay').textContent = day;
    document.getElementById('dateMonth').textContent = month;

    let reflections, prayers, aaPrayers, spinoza, aaProtocols;
    try {
      [reflections, prayers, aaPrayers, spinoza, aaProtocols] = await Promise.all([
        loadJSON('data/reflections.json'),
        loadJSON('data/prayers.json'),
        loadJSON('data/aa_prayers.json'),
        loadJSON('data/spinoza.json'),
        loadJSON('data/aa_protocols.json')
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

    renderStepPrayers(aaPrayers, spinoza, aaProtocols);

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

  // Заголовок раздела: текст, а если задана иконка — «иконка + текст»
  function setSummary(summary, title, icon) {
    if (!icon) {
      summary.textContent = title;
      return;
    }
    const label = document.createElement('span');
    label.className = 'sum-label';
    const img = document.createElement('img');
    img.className = 'sum-icon';
    img.src = 'images/' + icon;
    img.alt = '';
    img.width = 16;
    img.height = 16;
    const text = document.createElement('span');
    text.textContent = title;
    label.append(img, text);
    summary.appendChild(label);
  }

  function buildStepPrayer(item, withDividers, icon) {
    const details = document.createElement('details');
    details.className = 'step-prayer';

    const summary = document.createElement('summary');
    setSummary(summary, item.title, icon);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'step-prayer-body';

    const text = document.createElement('p');
    text.className = 'step-prayer-text';
    setFormatted(text, item.text, withDividers);
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

  function buildPrayerGroup(title, items, icon) {
    const group = document.createElement('details');
    group.className = 'prayer-group';

    const groupSummary = document.createElement('summary');
    setSummary(groupSummary, title, icon);
    group.appendChild(groupSummary);

    const groupBody = document.createElement('div');
    groupBody.className = 'prayer-group-body';
    items.forEach(item => groupBody.appendChild(buildStepPrayer(item)));
    group.appendChild(groupBody);

    return group;
  }

  function fmtSize(bytes) {
    if (!bytes) return '';
    const mb = bytes / 1048576;
    return mb >= 1 ? mb.toFixed(1) + ' МБ' : Math.round(bytes / 1024) + ' КБ';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
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
  const LISTENED_GAP = 60;  // столько секунд до конца считаем «дослушано»

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

  // 3725 -> "1:02:05", 725 -> "12:05"
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' + mm : mm) + ':' + String(s).padStart(2, '0');
  }

  async function fetchAudioList() {
    let res;
    try {
      res = await fetch(AUDIO_API + '/list', {
        headers: { Authorization: 'Bearer ' + audioToken },
      });
    } catch (e) {
      // fetch падает до всякого ответа: адрес воркера неверен, нет DNS,
      // нет интернета или запрос зарезал CORS.
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

  // Внятный текст вместо «попробуйте позже»
  function audioErrorText(e) {
    if (e && e.code === 'network') {
      return 'Воркер недоступен. Проверьте адрес в AUDIO_API (app.js) и что воркер задеплоен.';
    }
    return 'Сервер ответил ошибкой' + (e && e.code ? ' ' + e.code : '') +
           '. Проверьте секреты DRIVE_API_KEY и DRIVE_FOLDER_ID в Cloudflare.';
  }

  /* ---- длительность записей ----
     Drive не знает длительность .m4a, поэтому воркер возвращает duration: null.
     Фронтенд сам читает метаданные файла (скрытый <audio>), показывает минуты
     и сообщает воркеру — тот кладёт значение в KV. В следующий раз /list
     вернёт duration сразу, и дозагрузка уже не понадобится. */
  function probeDuration(id) {
    return new Promise((resolve) => {
      const a = new Audio();
      a.preload = 'metadata';
      let finished = false;
      const finish = (sec) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        a.removeAttribute('src');
        try { a.load(); } catch (e) {}
        resolve(sec);
      };
      const timer = setTimeout(() => finish(0), 15000);
      a.addEventListener('loadedmetadata', () => {
        finish(Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration) : 0);
      });
      a.addEventListener('error', () => finish(0));
      a.src = AUDIO_API + '/audio/' + encodeURIComponent(id) +
              '?t=' + encodeURIComponent(audioToken);
    });
  }

  // Без заголовков и тела — «простой» запрос, preflight не нужен
  function postDuration(id, sec) {
    fetch(AUDIO_API + '/duration/' + encodeURIComponent(id) +
          '?sec=' + sec + '&t=' + encodeURIComponent(audioToken),
          { method: 'POST' }).catch(() => {});
  }

  // По одному файлу за раз, чтобы не качать метаданные всех файлов сразу
  async function fillDurations(files, rows) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].duration) continue;
      if (!rows[i].isConnected) return;   // раздел перерисовали — прекращаем
      const sec = await probeDuration(files[i].id);
      if (!sec) continue;
      rows[i].setDuration(sec);
      postDuration(files[i].id, sec);
    }
  }

  // Рисует форму ввода пароля внутри группы
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

  /* ---- Заметки ----
     Общий блокнот (плавающая кнопка) и заметки к записям («+» после названия).
     Хранятся в Cloudflare KV через воркер (GET/PUT /notes), доступ — тем же паролем,
     что и к аудио. Весь набор заметок грузится один раз за сессию и кэшируется. */
  let notes = null;        // { general: '', audio: { [id]: text } }
  let notesPromise = null;
  let noteOverlay = null;

  async function notesRequest(method, body) {
    let res;
    try {
      res = await fetch(AUDIO_API + '/notes', {
        method,
        headers: Object.assign(
          { Authorization: 'Bearer ' + audioToken },
          body ? { 'Content-Type': 'application/json' } : {}
        ),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      const err = new Error('network');
      err.code = 'network';
      throw err;
    }
    if (!res.ok) {
      const err = new Error('http ' + res.status);
      err.code = res.status;
      throw err;
    }
    return res.json();
  }

  function loadNotes(force) {
    if (notes && !force) return Promise.resolve(notes);
    if (!notesPromise) {
      notesPromise = notesRequest('GET')
        .then((d) => {
          notes = { general: d.general || '', audio: d.audio || {} };
          return notes;
        })
        .finally(() => { notesPromise = null; });
    }
    return notesPromise;
  }

  async function saveNote(scope, id, text) {
    await notesRequest('PUT', { scope, id, text });
    if (scope === 'general') notes.general = text;
    else if (text.trim()) notes.audio[id] = text;
    else delete notes.audio[id];
  }

  function closeNoteEditor() {
    if (noteOverlay) {
      noteOverlay.remove();
      noteOverlay = null;
    }
  }

  // opts: { title, scope: 'general' | 'audio', id, onSaved }
  function openNoteEditor(opts) {
    closeNoteEditor();

    const overlay = document.createElement('div');
    overlay.className = 'note-overlay';

    const card = document.createElement('div');
    card.className = 'note-card';

    const head = document.createElement('div');
    head.className = 'note-head';
    const headTitle = document.createElement('span');
    headTitle.className = 'note-head-title';
    headTitle.textContent = opts.title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'book-close';
    close.setAttribute('aria-label', 'Закрыть');
    close.textContent = '✕';
    close.addEventListener('click', closeNoteEditor);
    head.append(headTitle, close);

    const body = document.createElement('div');
    card.append(head, body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    noteOverlay = overlay;

    function resetToken() {
      audioToken = '';
      localStorage.removeItem('audioToken');
    }

    function showMessage(text) {
      body.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'audio-status';
      p.textContent = text;
      body.appendChild(p);
    }

    function currentText() {
      return opts.scope === 'general' ? notes.general : (notes.audio[opts.id] || '');
    }

    function showEditor() {
      body.innerHTML = '';

      const ta = document.createElement('textarea');
      ta.className = 'note-input';
      ta.placeholder = 'Текст заметки…';
      ta.value = currentText();

      const foot = document.createElement('div');
      foot.className = 'note-foot';
      const status = document.createElement('span');
      status.className = 'note-status';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'note-save';
      save.textContent = 'Сохранить';
      foot.append(status, save);

      body.append(ta, foot);

      save.addEventListener('click', async () => {
        save.disabled = true;
        save.textContent = 'Сохранение…';
        status.textContent = '';
        const text = ta.value;
        try {
          await saveNote(opts.scope, opts.id, text);
          if (opts.onSaved) opts.onSaved(text);
          closeNoteEditor();
        } catch (e) {
          if (e.code === 401) {
            resetToken();
            showGate();
            return;
          }
          status.textContent = 'Не удалось сохранить. Попробуйте ещё раз.';
          save.disabled = false;
          save.textContent = 'Сохранить';
        }
      });

      ta.focus();
    }

    // Пароля нет (или устарел) — просим ввести, как в разделе аудио
    function showGate() {
      body.innerHTML = '';

      const hint = document.createElement('p');
      hint.className = 'audio-status';
      hint.textContent = 'Введите пароль. Он сохранится только на этом устройстве.';

      const row = document.createElement('div');
      row.className = 'audio-gate audio-gate-row';
      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'current-password';
      input.placeholder = 'Пароль';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Войти';
      row.append(input, btn);

      const error = document.createElement('div');
      error.className = 'audio-gate-error';
      error.hidden = true;

      body.append(hint, row, error);

      async function submit() {
        const value = input.value.trim();
        if (!value) return;
        btn.disabled = true;
        error.hidden = true;
        audioToken = value;
        try {
          await loadNotes(true);
          localStorage.setItem('audioToken', value);
          showEditor();
        } catch (e) {
          resetToken();
          btn.disabled = false;
          error.textContent = e.code === 401
            ? 'Неверный пароль.'
            : 'Не удалось связаться с сервером заметок.';
          error.hidden = false;
        }
      }

      btn.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
      input.focus();
    }

    (async () => {
      if (!audioToken) {
        showGate();
        return;
      }
      showMessage('Загрузка…');
      try {
        await loadNotes();
        if (noteOverlay === overlay) showEditor();
      } catch (e) {
        if (e.code === 401) {
          resetToken();
          showGate();
        } else {
          showMessage(e.code === 'network'
            ? 'Воркер недоступен.'
            : 'Не удалось загрузить заметки.');
        }
      }
    })();
  }

  // Плавающая кнопка «+» — общий блокнот
  function setupNotesFab() {
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'notes-fab';
    fab.setAttribute('aria-label', 'Блокнот');
    fab.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
    fab.addEventListener('click', () => {
      openNoteEditor({ title: 'Блокнот', scope: 'general' });
    });
    document.body.appendChild(fab);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeNoteEditor();
    });
  }

  // 3725 -> "1:02:05", 725 -> "12:05", 0 -> "00:00" (формат плеера, как на макете)
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  }

  const ICON_OPEN =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';

  // Круговая стрелка с «10»: вперёд — по часовой, назад — зеркально (цифры не зеркалим)
  function iconSkip(forward) {
    const flip = forward ? '' : ' transform="translate(24 0) scale(-1 1)"';
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<g' + flip + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
      '<path d="M17.36 8.5A7 7 0 1 1 12 6"/>' +
      '<path d="M12 2.8 16.2 6 12 9.2z" fill="currentColor" stroke-linejoin="round"/></g>' +
      '<text x="12" y="15.7" text-anchor="middle" font-size="7.6" font-weight="700" ' +
      'fill="currentColor" font-family="PT Sans, -apple-system, sans-serif">10</text></svg>';
  }

  const ICON_PLAY =
    '<svg class="ic-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE =
    '<svg class="ic-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.4z" fill="currentColor"/></svg>';

  // Собирает одну строку: «дата · минуты» + бейдж статуса, название с кнопкой ▶,
  // плеер (скрыт, пока не нажали ▶) и заметка
  function buildAudioRow(f, list) {
    const row = document.createElement('div');
    row.className = 'audio-row';

    const meta = document.createElement('div');
    meta.className = 'audio-meta';
    const metaText = document.createElement('span');
    const badge = document.createElement('span');
    badge.className = 'audio-badge';
    meta.append(metaText, badge);

    // ▶ перед названием: раскрывает плеер и сама исчезает
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'audio-open';
    openBtn.setAttribute('aria-label', 'Показать плеер');
    openBtn.innerHTML = ICON_OPEN;

    const title = document.createElement('div');
    title.className = 'audio-title';
    const titleText = document.createElement('span');
    titleText.className = 'audio-title-text';
    titleText.appendChild(document.createTextNode(f.title || f.name));

    // «+» сразу после названия — заметка к этой записи
    const noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.className = 'note-add';
    noteBtn.setAttribute('aria-label', 'Заметка к записи');
    noteBtn.textContent = '+';
    titleText.append(' ', noteBtn);
    title.append(openBtn, titleText);

    // Текст заметки под плеером, если она есть
    const noteEl = document.createElement('div');
    noteEl.className = 'audio-note';
    noteEl.hidden = true;

    function refreshNote() {
      const t = (notes && notes.audio[f.id]) || '';
      noteEl.textContent = t;
      noteEl.hidden = !t;
    }
    noteBtn.addEventListener('click', () => {
      openNoteEditor({
        title: f.title || f.name,
        scope: 'audio',
        id: f.id,
        onSaved: refreshNote,
      });
    });
    row.refreshNote = refreshNote;

    // Сам звук — без родных controls, интерфейс рисуем сами.
    const audio = document.createElement('audio');
    audio.className = 'audio-player';
    // Именно none: иначе браузер начнёт тянуть все файлы при раскрытии.
    audio.preload = 'none';
    audio.src =
      AUDIO_API + '/audio/' + encodeURIComponent(f.id) +
      '?t=' + encodeURIComponent(audioToken);

    // --- интерфейс плеера (по умолчанию скрыт) ---
    const ap = document.createElement('div');
    ap.className = 'ap';
    ap.hidden = true;

    const seek = document.createElement('div');
    seek.className = 'ap-seek';
    const curEl = document.createElement('span');
    curEl.className = 'ap-time';
    curEl.textContent = '00:00';
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'ap-range';
    range.min = 0;
    range.max = 1;
    range.step = 'any';
    range.value = 0;
    range.setAttribute('aria-label', 'Позиция в записи');
    const durEl = document.createElement('span');
    durEl.className = 'ap-time ap-time--end';
    durEl.textContent = '--:--';
    seek.append(curEl, range, durEl);

    const controls = document.createElement('div');
    controls.className = 'ap-controls';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'ap-skip';
    backBtn.setAttribute('aria-label', 'Назад на 10 секунд');
    backBtn.innerHTML = iconSkip(false);
    const mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.className = 'ap-main';
    mainBtn.innerHTML = ICON_PLAY + ICON_PAUSE + '<span class="ap-spin" aria-hidden="true"></span>';
    const fwdBtn = document.createElement('button');
    fwdBtn.type = 'button';
    fwdBtn.className = 'ap-skip';
    fwdBtn.setAttribute('aria-label', 'Вперёд на 10 секунд');
    fwdBtn.innerHTML = iconSkip(true);
    controls.append(backBtn, mainBtn, fwdBtn);

    const errorEl = document.createElement('div');
    errorEl.className = 'ap-error';
    errorEl.hidden = true;

    ap.append(seek, controls, errorEl);

    row.append(meta, title, ap, noteEl, audio);

    let saved = loadPos(f.id);   // с какой секунды продолжать
    let lastSaved = saved;       // что уже лежит в localStorage
    let applied = false;         // перемотались ли на сохранённую позицию
    let playing = false;         // идёт ли воспроизведение сейчас
    let loading = false;         // ждём звук: первая загрузка или буферизация
    let dragging = false;        // пользователь тянет ползунок

    // Иконка «играет» — три столбика эквалайзера, показываются в углу вместо бейджа.
    // Каждый столбик — две половинки (тёмная сверху, светлая снизу) вокруг средней линии;
    // анимация — только CSS transform: scaleY (см. style.css).
    const waveImg = document.createElement('span');
    waveImg.className = 'eq';
    waveImg.setAttribute('role', 'img');
    waveImg.setAttribute('aria-label', 'играет');
    waveImg.innerHTML =
      '<svg width="19" height="22" viewBox="0 0 14 16" aria-hidden="true">' +
      '<g class="eq-bar eq-bar--1"><rect x="0" y="4" width="4" height="4" fill="#A89098"/>' +
      '<rect x="0" y="8" width="4" height="4" fill="#C9BBBA"/></g>' +
      '<g class="eq-bar eq-bar--2"><rect x="5" y="0" width="4" height="8" fill="#A89098"/>' +
      '<rect x="5" y="8" width="4" height="8" fill="#C9BBBA"/></g>' +
      '<g class="eq-bar eq-bar--3"><rect x="10" y="3" width="4" height="5" fill="#A89098"/>' +
      '<rect x="10" y="8" width="4" height="5" fill="#C9BBBA"/></g>' +
      '</svg>';

    function durNow() {
      return f.duration || (Number.isFinite(audio.duration) ? audio.duration : 0);
    }

    // Пока метаданные не загружены, «текущее место» — это точка, с которой продолжим
    function curNow() {
      return audio.readyState >= 1 ? audio.currentTime : saved;
    }

    // «42 мин»: длительность из воркера (KV), иначе — из самого плеера
    function paintMeta() {
      const dur = durNow();
      const mins = dur ? Math.max(1, Math.round(dur / 60)) + ' мин' : '';
      metaText.textContent = [fmtDate(f.modifiedTime), mins].filter(Boolean).join(' · ');
    }

    // Ползунок, время слева/справа, подгруженная часть дорожки
    function paintProgress() {
      const dur = durNow();
      const cur = dragging ? Number(range.value) : Math.min(curNow(), dur || curNow());

      range.max = dur || 1;
      range.disabled = !dur;
      if (!dragging) range.value = cur;

      curEl.textContent = fmtTime(cur);
      durEl.textContent = dur ? fmtTime(dur) : '--:--';

      const ratio = dur ? Math.min(1, cur / dur) : 0;
      let buf = 0;
      try {
        const br = audio.buffered;
        for (let i = 0; i < br.length; i++) {
          if (br.start(i) <= cur + 1 && br.end(i) >= cur) buf = br.end(i);
        }
      } catch (e) {}
      range.style.setProperty('--p', String(ratio));
      range.style.setProperty('--b', String(Math.max(ratio, dur ? Math.min(1, buf / dur) : 0)));
    }

    // Кнопка ▶ / ❚❚ / крутилка загрузки
    function paintControls() {
      controls.classList.toggle('is-playing', !audio.paused);
      controls.classList.toggle('is-loading', loading);
      mainBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
      mainBtn.setAttribute('aria-label',
        loading ? 'Загрузка…' : (audio.paused ? 'Воспроизвести' : 'Пауза'));
    }

    function showError(text) {
      errorEl.textContent = text;
      errorEl.hidden = !text;
    }

    // new / @ 13 / ✓
    function paintBadge() {
      if (playing) {
        badge.className = 'audio-badge audio-badge--playing';
        if (badge.firstChild !== waveImg) {
          badge.textContent = '';
          badge.appendChild(waveImg);
        }
        return;
      }
      badge.className = 'audio-badge';
      if (isDone(f.id)) {
        badge.textContent = '✓';
        badge.classList.add('audio-badge--done');
      } else if (saved > RESUME_MIN) {
        // целые прошедшие минуты; до первой минуты — «@ 0:30»
        badge.textContent = saved >= 60
          ? '@ ' + Math.floor(saved / 60)
          : '@ 0:' + String(Math.floor(saved)).padStart(2, '0');
        badge.classList.add('audio-badge--pos');
      } else {
        badge.textContent = 'new';
        badge.classList.add('audio-badge--new');
      }
    }

    row.setDuration = (sec) => {
      f.duration = sec;
      paintMeta();
      paintProgress();
    };

    paintMeta();
    paintBadge();
    paintProgress();
    paintControls();

    // Свернуть плеер: ставим на паузу и возвращаем ▶ у названия
    row.collapse = () => {
      audio.pause();
      ap.hidden = true;
      openBtn.hidden = false;
    };

    // ▶ у названия: сворачиваем плеер другой записи, раскрываем этот и сразу играем.
    // Нажатие — жест пользователя, поэтому iOS разрешает play() прямо здесь.
    openBtn.addEventListener('click', () => {
      const topBefore = row.getBoundingClientRect().top;

      list.querySelectorAll('.audio-row').forEach((other) => {
        if (other !== row && other.collapse) other.collapse();
      });

      openBtn.hidden = true;
      ap.hidden = false;
      paintProgress();
      paintControls();
      startPlayback();

      // Если свернувшийся плеер был выше, строка «уехала» вверх — возвращаем её под палец
      const shift = row.getBoundingClientRect().top - topBefore;
      if (Math.abs(shift) > 1) window.scrollBy(0, shift);
    });

    // Перемотка. Пока файл не загружен, просто запоминаем точку старта —
    // seekToSaved применит её, когда придут метаданные.
    function seekTo(t) {
      const dur = durNow();
      t = Math.max(0, dur ? Math.min(t, dur) : t);
      if (audio.readyState >= 1) {
        try {
          audio.currentTime = t;
        } catch (e) {}
      } else {
        saved = t;
      }
      paintProgress();
    }

    function startPlayback() {
      showError('');
      loading = true;   // крутилка сразу после нажатия, пока не пойдёт звук
      paintControls();
      const p = audio.play();
      if (p && p.catch) {
        p.catch((e) => {
          if (e && e.name === 'AbortError') return;   // нас остановил другой плеер
          loading = false;
          paintControls();
          showError('Не удалось начать воспроизведение.');
        });
      }
    }

    mainBtn.addEventListener('click', () => {
      if (audio.paused) startPlayback();
      else audio.pause();
    });

    backBtn.addEventListener('click', () => seekTo(curNow() - 10));
    fwdBtn.addEventListener('click', () => seekTo(curNow() + 10));

    // Пока тянем — только обновляем цифры, перематываем один раз при отпускании
    range.addEventListener('input', () => {
      dragging = true;
      paintProgress();
    });
    range.addEventListener('change', () => {
      dragging = false;
      seekTo(Number(range.value));
    });

    // Перематываем один раз, когда браузер узнал длительность.
    // Страховка на canplay нужна для iOS: там loadedmetadata иногда
    // приходит до того, как перемотка вообще возможна.
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
      // Страховка: если фоновая дозагрузка не сработала (iOS), запоминаем при запуске
      if (!f.duration) {
        f.duration = Math.round(dur);
        postDuration(f.id, f.duration);
      }
      paintMeta();
      paintBadge();
      paintProgress();
    }

    audio.addEventListener('loadedmetadata', seekToSaved);
    audio.addEventListener('durationchange', () => { paintMeta(); paintProgress(); });
    audio.addEventListener('canplay', () => {
      seekToSaved();
      // звук готов — крутилку убираем
      if (loading && !audio.paused) {
        loading = false;
        paintControls();
      }
    });

    // Запоминает текущее место (или отмечает «дослушано»)
    function remember(force) {
      const cur = audio.currentTime;
      const dur = audio.duration;
      if (!dur || !Number.isFinite(dur)) return;
      // Пока метаданные не применены, currentTime ещё 0 — не затираем позицию.
      if (!applied) return;

      // Осталась минута или меньше — считаем дослушанным.
      if (dur - cur <= LISTENED_GAP) {
        if (!isDone(f.id)) {
          clearPos(f.id);
          setDone(f.id, true);
          saved = 0;
          lastSaved = 0;
          paintBadge();
        }
        return;
      }

      // Пишем на диск раз в SAVE_EVERY секунд, а не на каждый timeupdate
      // (он вызывается ~4 раза в секунду). На паузе пишем сразу.
      if (!force && Math.abs(cur - lastSaved) < SAVE_EVERY) return;
      lastSaved = cur;

      if (cur > RESUME_MIN) {
        saved = cur;
        savePos(f.id, cur);
        setDone(f.id, false);   // переслушивают с середины — снова «в процессе»
      } else {
        saved = 0;
        clearPos(f.id);
      }
      paintBadge();
    }

    audio.addEventListener('timeupdate', () => {
      remember(false);
      paintProgress();
    });
    audio.addEventListener('progress', paintProgress);
    audio.addEventListener('seeked', paintProgress);

    audio.addEventListener('pause', () => {
      playing = false;
      loading = false;
      if (!audio.ended) remember(true);
      paintBadge();
      paintControls();
      paintProgress();
    });

    audio.addEventListener('ended', () => {
      playing = false;
      loading = false;
      clearPos(f.id);
      setDone(f.id, true);
      saved = 0;
      lastSaved = 0;
      applied = true;
      paintBadge();
      paintControls();
      paintProgress();
    });

    // Один плеер за раз: запуск нового останавливает предыдущий.
    audio.addEventListener('play', () => {
      playing = true;
      paintBadge();
      paintControls();
      list.querySelectorAll('audio').forEach((other) => {
        if (other !== audio) other.pause();
      });
    });

    // Загрузка/буферизация: крутилка вместо кнопки, пока звука нет
    audio.addEventListener('playing', () => {
      loading = false;
      paintControls();
    });
    audio.addEventListener('waiting', () => {
      if (!audio.paused) {
        loading = true;
        paintControls();
      }
    });
    audio.addEventListener('error', () => {
      loading = false;
      playing = false;
      paintBadge();
      paintControls();
      showError('Не удалось загрузить запись. Проверьте соединение.');
    });

    return row;
  }

  // Рисует список записей с плеерами
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

    const rows = files.map((f) => {
      const r = buildAudioRow(f, list);
      list.appendChild(r);
      return r;
    });

    container.appendChild(list);
    fillDurations(files, rows);

    // Заметки подтягиваем отдельно: если не загрузились — список всё равно работает
    loadNotes().then(() => rows.forEach((r) => r.refreshNote())).catch(() => {});
  }


  // Точка входа раздела — вызывается из renderStepPrayers()
  function buildAudioGroup() {
    const group = document.createElement('details');
    group.className = 'prayer-group';

    const summary = document.createElement('summary');
    setSummary(summary, 'Аудиозаписи', 'icon_audio_32.png');
    group.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'prayer-group-body';
    group.appendChild(body);

    let loaded = false;

    // Загружаем только при первом раскрытии — не тормозим загрузку дня.
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
          // Токен устарел или отозван — просим ввести заново.
          audioToken = '';
          localStorage.removeItem('audioToken');
          renderAudioGate(body);
        } else {
          const err = document.createElement('p');
          err.className = 'audio-status';
          err.textContent = 'Не удалось загрузить список записей.';
          body.appendChild(err);
        }
      }
    });

    return group;
  }

  function renderStepPrayers(aaPrayers, spinoza, aaProtocols) {
    const nav = document.getElementById('stepPrayers');

    if (Array.isArray(spinoza)) {
      spinoza.forEach(item => nav.appendChild(buildStepPrayer(item, true, 'icon_feather_32.png')));
    }

    if (Array.isArray(aaPrayers) && aaPrayers.length > 0) {
      nav.appendChild(buildPrayerGroup('Молитвы АА', aaPrayers, 'icon_pray_32.png'));
    }

    if (Array.isArray(aaProtocols) && aaProtocols.length > 0) {
      nav.appendChild(buildPrayerGroup('Протоколы АА', aaProtocols, 'icon_list_32.png'));
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

  init();
  setupGlossaryHandlers();
  setupNotesFab();
})();
