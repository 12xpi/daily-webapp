(function () {
  const MONTHS_GENITIVE = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const WEEKDAYS = [
    'воскресенье', 'понедельник', 'вторник', 'среда',
    'четверг', 'пятница', 'суббота'
  ];

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

    renderStepPrayers(stepPrayers);

    const reflection = reflections[key];
    const pairIndex = dayOfYear(today) % prayers.length;
    const pair = prayers[pairIndex];

    if (!reflection || !pair) {
      showEmpty();
      return;
    }

    document.querySelector('#prayer1 .prayer-text').textContent = pair.classic;
    document.querySelector('#prayer2 .prayer-text').textContent = pair.personal;

    document.querySelector('.reflection-title').textContent = reflection.title;
    document.querySelector('.reflection-desc').textContent = reflection.description;
    document.querySelector('.reflection-content').textContent = reflection.content;
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
      text.textContent = item.text;
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
})();
