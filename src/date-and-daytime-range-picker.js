// date-and-daytime-range-picker.js
const templateURL = new URL('./date-and-daytime-range-picker.html', import.meta.url);

// Load and parse the external template once, cache it
let cachedTemplate = null;
async function loadTemplate() {
  if (cachedTemplate) return cachedTemplate;
  const res = await fetch(templateURL.href);
  if (!res.ok) throw new Error(`Failed to load template: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tpl = doc.getElementById('date-and-daytime-range-picker-template');
  if (!tpl) throw new Error('Template with id="date-and-daytime-range-picker-template" not found in date-and-daytime-range-picker.html');
  cachedTemplate = tpl;
  return cachedTemplate;
}

class DateAndDaytimeRangePicker extends HTMLElement {
  static get observedAttributes() {
    return ['min-date', 'max-date', 'time-step', 'date-step-days', 'default-tz'];
  }

  #ready = false; // set to true only after template is attached & elements cached

  #root;
  #els = {};
  #prevTZ = null;

  #state = {
    // Dates (local date-only indexes)
    minDate: null, maxDate: null,
    dateMin: 0, dateMax: 0, dateStart: 0, dateEnd: 0, dateStepDays: 1,
    // Time of day (minutes)
    timeMin: 0, timeMax: 24*60 - 1, timeStart: 22*60, timeEnd: 6*60, timeStep: 15,
    // TZ
    timeZone: 'UTC'
  };

  // Tick targets
  #DATE_TICK_TARGET = 7;
  #TIME_TICK_TARGET = 8;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.#root = this.shadowRoot;
  }

  async connectedCallback() {
    const tpl = await loadTemplate();
    this.#root.appendChild(tpl.content.cloneNode(true));

    // Cache elements after template is attached
    this.#els = {
      // TZ
      tzInput: this.#root.getElementById('tzInput'),
      tzDatalist: this.#root.getElementById('timezones'),
      tzOffsetPreview: this.#root.getElementById('tzOffsetPreview'),
      // Date
      dateStart: this.#root.getElementById('dateStart'),
      dateEnd: this.#root.getElementById('dateEnd'),
      dateThumbStart: this.#root.getElementById('dateThumbStart'),
      dateThumbEnd: this.#root.getElementById('dateThumbEnd'),
      dateFill: this.#root.getElementById('dateFill'),
      dateTrack: this.#root.getElementById('dateTrack'),
      dateTicks: this.#root.getElementById('dateTicks'),
      dateTickLabels: this.#root.getElementById('dateTickLabels'),
      // Time
      timeStart: this.#root.getElementById('timeStart'),
      timeEnd: this.#root.getElementById('timeEnd'),
      timeThumbStart: this.#root.getElementById('timeThumbStart'),
      timeThumbEnd: this.#root.getElementById('timeThumbEnd'),
      timeFillA: this.#root.getElementById('timeFillA'),
      timeFillB: this.#root.getElementById('timeFillB'),
      timeTrack: this.#root.getElementById('timeTrack'),
      timeTicks: this.#root.getElementById('timeTicks'),
      timeTickLabels: this.#root.getElementById('timeTickLabels'),
    };

    // Init state from attributes, build TZ list, wire events
    this.#initDefaults();
    this.#populateTimeZones();
    this.#wireEvents();
    this.#enableTrackDraggingAndRecenter();

    // Now the component is fully wired; mark ready and render
    this.#ready = true;
    this.#renderAll();

  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;

    // If not ready yet, only update internal state and bail out.
    if (!this.#ready) {
      switch (name) {
        case 'default-tz':
          if (newVal) this.#state.timeZone = newVal;
          break;
        case 'time-step': {
          const n = Math.max(1, parseInt(newVal ?? '15', 10) || 15);
          this.#state.timeStep = n;
          break;
        }
        case 'date-step-days': {
          const n = Math.max(1, parseInt(newVal ?? '1', 10) || 1);
          this.#state.dateStepDays = n;
          break;
        }
        case 'min-date':
        case 'max-date':
          // Let #initDateBounds read attributes in connectedCallback;
          // we don't need to do anything special here.
          break;
      }
      return;
    }

    // Already ready: do the full logic with renders/events.
    switch (name) {
      case 'min-date':
      case 'max-date':
        this.#initDateBounds();
        this.#clampAndSyncDates();
        this.#renderDate();
        this.#emit('change');
        break;

      case 'time-step': {
        const n = Math.max(1, parseInt(newVal ?? '15', 10) || 15);
        this.#state.timeStep = n;
        this.#renderTime();
        this.#emit('change');
        break;
      }

      case 'date-step-days': {
        const n = Math.max(1, parseInt(newVal ?? '1', 10) || 1);
        this.#state.dateStepDays = n;
        this.#renderDate();
        this.#emit('change');
        break;
      }

      case 'default-tz': {
        if (newVal) this.#state.timeZone = newVal;
        this.#populateTimeZones(); // now safe; tz datalist exists
        this.#renderTZ();
        this.#emit('change');
        break;
      }
    }
  }

  /* ---------- Public API ---------- */
  get dateRange() { return { start: this.#idxToDate(this.#state.dateStart), end: this.#idxToDate(this.#state.dateEnd) }; }
  set dateRange(v) {
    const start = this.#coerceDateOnly(v.start);
    const end = this.#coerceDateOnly(v.end);
    if (!start || !end) return;
    this.#state.dateStart = this.#dateToIdx(start);
    this.#state.dateEnd   = this.#dateToIdx(end);
    this.#clampAndSyncDates(); this.#renderDate(); this.#emit('change');
  }

  get timeRange() {
    const { timeStart: s, timeEnd: e } = this.#state;
    return { startMinutes: s, endMinutes: e, crossesMidnight: e < s };
  }
  set timeRange(v) {
    const s = this.#clamp(0, 1439, Math.round(v.startMinutes));
    const e = this.#clamp(0, 1439, Math.round(v.endMinutes));
    this.#state.timeStart = s; this.#state.timeEnd = e;
    this.#clampAndSyncTimes(); this.#renderTime(); this.#emit('change');
  }

  get timeZone() { return this.#state.timeZone; }
  set timeZone(v) { if (v) { this.#state.timeZone = v; this.#renderTZ(); this.#emit('change'); } }

  /* ---------- Init ---------- */
  #initDefaults() {
    const attrTZ = this.getAttribute('default-tz');
    const sysTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.#state.timeZone = attrTZ || sysTZ || 'UTC';

    this.#initDateBounds();

    // Default: full date span
    this.#state.dateStart = this.#state.dateMin;
    this.#state.dateEnd   = this.#state.dateMax;

    const ts = parseInt(this.getAttribute('time-step') ?? '15', 10);
    if (!Number.isNaN(ts)) this.#state.timeStep = Math.max(1, ts);
    const ds = parseInt(this.getAttribute('date-step-days') ?? '1', 10);
    if (!Number.isNaN(ds)) this.#state.dateStepDays = Math.max(1, ds);
  }

  #initDateBounds() {
    const attrMin = this.getAttribute('min-date');
    const attrMax = this.getAttribute('max-date');
    let minD = this.#coerceDateOnly(attrMin);
    let maxD = this.#coerceDateOnly(attrMax);

    if (!minD || !maxD || minD > maxD) {
      const today = this.#todayLocal();
      maxD = today; minD = new Date(today); minD.setDate(today.getDate() - 30);
    }

    this.#state.minDate = minD;
    this.#state.maxDate = maxD;
    this.#state.dateMin = 0;
    this.#state.dateMax = this.#daysBetween(minD, maxD);
  }

  /* ---------- Time zone datalist ---------- */
  #populateTimeZones() {
    const dl = this.#els.tzDatalist;
    dl.innerHTML = '';
    const current = this.#state.timeZone;

    let zones = [];
    if (typeof Intl.supportedValuesOf === 'function') {
      try { zones = Intl.supportedValuesOf('timeZone'); } catch {}
    }
    if (!zones || zones.length === 0) {
      zones = [
        'Europe/Berlin','Europe/London','Europe/Paris','Europe/Madrid','Europe/Rome','Europe/Warsaw',
        'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Sao_Paulo',
        'Asia/Tokyo','Asia/Shanghai','Asia/Hong_Kong','Asia/Singapore','Asia/Kolkata',
        'Australia/Sydney'
      ];
    }
    if (!zones.includes('UTC')) zones = ['UTC', ...zones];

    for (const z of zones) {
      const opt = document.createElement('option');
      opt.value = z;
      dl.appendChild(opt);
    }

    this.#els.tzInput.value = current;
    this.#els.tzInput.classList.remove('invalid');
    this.#renderTZ();
  }

  #isValidTimeZone(tz) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(); return true; }
    catch { return false; }
  }

  /* ---------- Events ---------- */
  #wireEvents() {
    const E = this.#els;

    // Time zone input (datalist) with select-like UX
    const commitTZ = (tz, kind /* 'input' | 'change' */) => {
      this.#state.timeZone = tz;
      E.tzInput.classList.remove('invalid');
      this.#renderTZ();
      this.#emit(kind);
    };
    const isValidTZ = (val) => this.#isValidTimeZone(val);

    const onTZInput = () => {
      const val = (E.tzInput.value || '').trim();
      if (!val) { E.tzInput.classList.remove('invalid'); return; }
      if (isValidTZ(val)) commitTZ(val, 'input'); else E.tzInput.classList.add('invalid');
    };
    const onTZChange = () => {
      const val = (E.tzInput.value || '').trim();
      if (!val) {
        const restore = this.#prevTZ ?? this.#state.timeZone;
        E.tzInput.value = restore; E.tzInput.classList.remove('invalid');
        this.#renderTZ(); this.#emit('change'); return;
      }
      if (isValidTZ(val)) commitTZ(val, 'change');
      else {
        const restore = this.#prevTZ ?? this.#state.timeZone;
        E.tzInput.value = restore; E.tzInput.classList.remove('invalid');
        this.#renderTZ(); this.#emit('change');
      }
    };

    E.tzInput.addEventListener('focus', () => {
      this.#prevTZ = this.#state.timeZone;
      E.tzInput.placeholder = this.#prevTZ || '';
      E.tzInput.value = '';
      E.tzInput.classList.remove('invalid');
    });
    E.tzInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' || ev.key === 'Esc') {
        E.tzInput.value = '';
        E.tzInput.classList.remove('invalid');
        ev.preventDefault(); ev.stopPropagation();
      }
    });
    E.tzInput.addEventListener('blur', () => {
      if ((E.tzInput.value || '').trim() === '') {
        const restore = this.#prevTZ ?? this.#state.timeZone;
        E.tzInput.value = restore;
        E.tzInput.classList.remove('invalid');
        this.#renderTZ();
        this.#emit('change');
      }
      E.tzInput.placeholder = '';
    });
    E.tzInput.addEventListener('input', onTZInput);
    E.tzInput.addEventListener('change', onTZChange);

    // Date inputs <-> slider
    E.dateStart.addEventListener('input', () => {
      const d = this.#coerceDateOnly(E.dateStart.value); if (!d) return;
      this.#state.dateStart = this.#dateToIdx(d);
      this.#clampAndSyncDates(); this.#renderDate(); this.#emit('input');
    });
    E.dateEnd.addEventListener('input', () => {
      const d = this.#coerceDateOnly(E.dateEnd.value); if (!d) return;
      this.#state.dateEnd = this.#dateToIdx(d);
      this.#clampAndSyncDates(); this.#renderDate(); this.#emit('input');
    });
    const onDateThumb = () => {
      this.#state.dateStart = Math.round(+E.dateThumbStart.value);
      this.#state.dateEnd   = Math.round(+E.dateThumbEnd.value);
      this.#clampAndSyncDates(); this.#renderDate(); this.#emit('input');
    };
    E.dateThumbStart.addEventListener('input', onDateThumb);
    E.dateThumbEnd.addEventListener('input', onDateThumb);
    E.dateThumbStart.addEventListener('change', () => this.#emit('change'));
    E.dateThumbEnd.addEventListener('change', () => this.#emit('change'));

    // Time inputs <-> slider
    const parseTime = (val) => {
      if (!val || !/^\d{2}:\d{2}(:\d{2})?$/.test(val)) return null;
      const [H, M] = val.split(':').map(Number);
      if (H > 23 || M > 59) return null;
      return H * 60 + M;
    };
    E.timeStart.addEventListener('input', () => {
      const m = parseTime(E.timeStart.value); if (m == null) return;
      this.#state.timeStart = m; this.#clampAndSyncTimes(); this.#renderTime(); this.#emit('input');
    });
    E.timeEnd.addEventListener('input', () => {
      const m = parseTime(E.timeEnd.value); if (m == null) return;
      this.#state.timeEnd = m; this.#clampAndSyncTimes(); this.#renderTime(); this.#emit('input');
    });
    const onTimeThumb = () => {
      this.#state.timeStart = Math.round(+E.timeThumbStart.value);
      this.#state.timeEnd   = Math.round(+E.timeThumbEnd.value);
      this.#clampAndSyncTimes(); this.#renderTime(); this.#emit('input');
    };
    E.timeThumbStart.addEventListener('input', onTimeThumb);
    E.timeThumbEnd.addEventListener('input', onTimeThumb);
    E.timeThumbStart.addEventListener('change', () => this.#emit('change'));
    E.timeThumbEnd.addEventListener('change', () => this.#emit('change'));
  }

  /* ---------- Track drag + recenter-on-click ---------- */
  #enableTrackDraggingAndRecenter() { this.#makeTrackInteractive('date'); this.#makeTrackInteractive('time'); }
  #makeTrackInteractive(kind) {
    const CLICK_PX_THRESHOLD = 6;
    const isDate = kind === 'date';
    const track = isDate ? this.#els.dateTrack : this.#els.timeTrack;
    if (!track) return;

    const onPointerDown = (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const rect = track.getBoundingClientRect();
      const downX = ev.clientX, downY = ev.clientY;
      let dragged = false;

      track.classList.add('dragging');
      track.setPointerCapture(ev.pointerId);

      const S = this.#state;
      const init = isDate
        ? { a: S.dateStart, b: S.dateEnd, min: S.dateMin, max: S.dateMax, step: S.dateStepDays, span: S.dateMax - S.dateMin }
        : { a: S.timeStart, b: S.timeEnd, min: S.timeMin, max: S.timeMax, step: S.timeStep, span: (S.timeMax - S.timeMin) };

      const onPointerMove = (e) => {
        const dx = e.clientX - downX, dy = e.clientY - downY;
        if (!dragged && Math.hypot(dx, dy) > CLICK_PX_THRESHOLD) dragged = true;
        if (!dragged) return;

        const ratio = rect.width ? dx / rect.width : 0;
        if (isDate) {
          let shift = Math.round(ratio * init.span);
          shift = Math.round(shift / init.step) * init.step;
          const minShift = init.min - init.a;
          const maxShift = init.max - init.b;
          const minShiftStep = Math.ceil(minShift / init.step) * init.step;
          const maxShiftStep = Math.floor(maxShift / init.step) * init.step;
          shift = Math.max(minShiftStep, Math.min(maxShiftStep, shift));
          S.dateStart = init.a + shift; S.dateEnd = init.b + shift;
          this.#renderDate(); this.#emit('input');
        } else {
          let shift = Math.round(ratio * (init.span + 1));
          shift = Math.round(shift / init.step) * init.step;
          const mod = 1440, wrap = (v) => ((v % mod) + mod) % mod;
          S.timeStart = wrap(init.a + shift); S.timeEnd = wrap(init.b + shift);
          this.#renderTime(); this.#emit('input');
        }
      };

      const onPointerUp = (e) => {
        track.classList.remove('dragging');
        track.releasePointerCapture(ev.pointerId);
        if (!dragged) {
          const rectNow = track.getBoundingClientRect();
          const clickRatio = rectNow.width
            ? (Math.min(rectNow.right, Math.max(rectNow.left, e.clientX)) - rectNow.left) / rectNow.width
            : 0.5;
          if (isDate) this.#recenterDateAt(clickRatio); else this.#recenterTimeAt(clickRatio);
          this.#emit('change');
        } else {
          this.#emit('change');
        }
        track.removeEventListener('pointermove', onPointerMove);
        track.removeEventListener('pointerup', onPointerUp);
        track.removeEventListener('pointercancel', onPointerUp);
      };

      track.addEventListener('pointermove', onPointerMove);
      track.addEventListener('pointerup', onPointerUp);
      track.addEventListener('pointercancel', onPointerUp);
    };

    track.addEventListener('pointerdown', onPointerDown);
  }

  #recenterDateAt(ratio) {
    const S = this.#state;
    const r = Math.max(0, Math.min(1, ratio));
    const span = S.dateMax - S.dateMin;
    const currentCenter = (S.dateStart + S.dateEnd) / 2;
    const targetCenter = S.dateMin + r * span;
    let shift = targetCenter - currentCenter;
    shift = Math.round(shift / S.dateStepDays) * S.dateStepDays;
    const minShift = S.dateMin - S.dateStart;
    const maxShift = S.dateMax - S.dateEnd;
    const minShiftStep = Math.ceil(minShift / S.dateStepDays) * S.dateStepDays;
    const maxShiftStep = Math.floor(maxShift / S.dateStepDays) * S.dateStepDays;
    shift = Math.max(minShiftStep, Math.min(maxShiftStep, shift));
    S.dateStart += shift; S.dateEnd += shift;
    this.#renderDate(); this.#emit('input');
  }

  #recenterTimeAt(ratio) {
    const S = this.#state, mod = 1440;
    const r = Math.max(0, Math.min(1, ratio));
    const width = (S.timeEnd >= S.timeStart) ? (S.timeEnd - S.timeStart) : (mod - S.timeStart + S.timeEnd);
    let center = (S.timeStart + width / 2) % mod; center = (center + mod) % mod;
    let target = Math.round(r * (mod - 1)); target = ((target % mod) + mod) % mod;
    let shift = target - center;
    shift = Math.round(shift / S.timeStep) * S.timeStep;
    const wrap = (v) => ((v % mod) + mod) % mod;
    S.timeStart = wrap(S.timeStart + shift);
    S.timeEnd   = wrap(S.timeEnd + shift);
    this.#renderTime(); this.#emit('input');
  }

  /* ---------- Rendering ---------- */
  #renderAll() { this.#renderTZ(); this.#renderDate(); this.#renderTime(); }
  #renderTZ() {
    const E = this.#els;
    E.tzInput.value = this.#state.timeZone;
    const d = this.#idxToDate(this.#state.dateStart);
    const [h, m, s] = this.#minToHMS(this.#state.timeStart);
    const iso = this.#toISOWithOffset(this.#state.timeZone, d.getFullYear(), d.getMonth()+1, d.getDate(), h, m, s);
    E.tzOffsetPreview.value = `${this.#state.timeZone} offset: ${iso.slice(-6)}`;
  }

  #renderDate() {
    const E = this.#els; const S = this.#state;
    const step = S.dateStepDays;
    E.dateThumbStart.min = String(S.dateMin);
    E.dateThumbStart.max = String(S.dateMax);
    E.dateThumbStart.step = String(step);
    E.dateThumbEnd.min = String(S.dateMin);
    E.dateThumbEnd.max = String(S.dateMax);
    E.dateThumbEnd.step = String(step);

    E.dateThumbStart.value = String(S.dateStart);
    E.dateThumbEnd.value = String(S.dateEnd);

    E.dateStart.value = this.#fmtDateISO(this.#idxToDate(S.dateStart));
    E.dateEnd.value = this.#fmtDateISO(this.#idxToDate(S.dateEnd));

    const leftPct = (S.dateStart - S.dateMin) / (S.dateMax - S.dateMin || 1);
    const rightPct = (S.dateEnd - S.dateMin) / (S.dateMax - S.dateMin || 1);
    this.#setFill(E.dateFill, leftPct, rightPct);

    this.#buildDateTicks();
  }

  #renderTime() {
    const E = this.#els; const S = this.#state;
    const step = S.timeStep, min = S.timeMin, max = S.timeMax;

    E.timeThumbStart.min = String(min); E.timeThumbStart.max = String(max); E.timeThumbStart.step = String(step);
    E.timeThumbEnd.min   = String(min); E.timeThumbEnd.max   = String(max); E.timeThumbEnd.step   = String(step);

    E.timeThumbStart.value = String(S.timeStart);
    E.timeThumbEnd.value   = String(S.timeEnd);

    E.timeStart.step = String(step * 60);
    E.timeEnd.step   = String(step * 60);

    E.timeStart.value = this.#fmtHHMMSS(S.timeStart);
    E.timeEnd.value   = this.#fmtHHMMSS(S.timeEnd);

    const startPct = (S.timeStart - min) / (max - min || 1);
    const endPct   = (S.timeEnd - min)   / (max - min || 1);
    const wraps    = S.timeEnd < S.timeStart;

    if (!wraps) {
      this.#setFill(E.timeFillA, startPct, endPct);
      E.timeFillB.classList.add('hidden');
    } else {
      this.#setFill(E.timeFillA, startPct, 1);
      this.#setFill(E.timeFillB, 0, endPct);
      E.timeFillB.classList.remove('hidden');
    }

    this.#buildTimeTicks();
    this.#renderTZ();
  }

  #setFill(el, leftPct, rightPct) {
    const left = Math.max(0, Math.min(1, leftPct));
    const right = Math.max(0, Math.min(1, rightPct));
    const width = Math.max(0, right - left);
    el.style.setProperty('--fill-left', `${(left * 100).toFixed(4)}%`);
    el.style.setProperty('--fill-scale', width.toFixed(4));
  }

  /* ---------- Tick builders ---------- */
  #buildDateTicks() {
    const ticks = this.#els.dateTicks;
    const labels = this.#els.dateTickLabels;
    ticks.innerHTML = ''; labels.innerHTML = '';

    const totalDays = Math.max(1, this.#state.dateMax - this.#state.dateMin);
    const stepDays = this.#chooseDateTickStep(totalDays, this.#DATE_TICK_TARGET);
    const minDate = this.#state.minDate;

    for (let i = 0; i <= totalDays; i += stepDays) {
      const pct = i / totalDays;
      const d = new Date(minDate); d.setDate(minDate.getDate() + i);
      const isStrong = stepDays >= 30 || this.#isMonthStart(d);

      const t = document.createElement('div');
      t.className = 'tick' + (isStrong ? ' strong' : '');
      t.style.left = `${(pct * 100).toFixed(4)}%`;
      ticks.appendChild(t);

      const lab = document.createElement('div');
      lab.className = 'tick-label';
      lab.style.left = `${(pct * 100).toFixed(4)}%`;
      lab.textContent = this.#formatDateTickLabel(d, stepDays);
      labels.appendChild(lab);
    }
  }
  #chooseDateTickStep(totalDays, target) {
    const candidates = [1, 2, 5, 7, 14, 30, 60, 90, 120, 180, 365];
    let best = candidates[0], bestDiff = Math.abs(totalDays / candidates[0] - target);
    for (const c of candidates) {
      const diff = Math.abs(totalDays / c - target);
      if (diff < bestDiff) { best = c; bestDiff = diff; }
    }
    return best;
  }
  #isMonthStart(d) { return d.getDate() === 1; }
  #formatDateTickLabel(d, stepDays) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (stepDays >= 90) return `${y}-${m}`;
    if (stepDays >= 30) return `${y}-${m}`;
    return `${m}-${day}`;
  }

  #buildTimeTicks() {
    const ticks = this.#els.timeTicks;
    const labels = this.#els.timeTickLabels;
    ticks.innerHTML = ''; labels.innerHTML = '';

    const totalMins = 1440;
    const stepMins = this.#chooseTimeTickStep(this.#TIME_TICK_TARGET);

    for (let m = 0; m < totalMins; m += stepMins) {
      const pct = m / (totalMins - 1);
      const isStrong = (m % 60 === 0);

      const t = document.createElement('div');
      t.className = 'tick' + (isStrong ? ' strong' : '');
      t.style.left = `${(pct * 100).toFixed(4)}%`;
      ticks.appendChild(t);

      if (isStrong || (m % (stepMins * 2) === 0)) {
        const lab = document.createElement('div');
        lab.className = 'tick-label';
        lab.style.left = `${(pct * 100).toFixed(4)}%`;
        const H = Math.floor(m / 60), M = m % 60;
        lab.textContent = `${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}`;
        labels.appendChild(lab);
      }
    }
  }
  #chooseTimeTickStep(target) {
    const candidates = [15, 30, 60, 120, 180, 240];
    let best = candidates[0], bestDiff = Math.abs(1440 / candidates[0] - target);
    for (const c of candidates) {
      const diff = Math.abs(1440 / c - target);
      if (diff < bestDiff) { best = c; bestDiff = diff; }
    }
    return best;
  }

  /* ---------- Helpers ---------- */
  #clampAndSyncDates() {
    const S = this.#state;
    S.dateStart = this.#snapToStep(this.#clamp(S.dateMin, S.dateMax, S.dateStart), S.dateStepDays);
    S.dateEnd   = this.#snapToStep(this.#clamp(S.dateMin, S.dateMax, S.dateEnd), S.dateStepDays);
    if (S.dateStart > S.dateEnd) [S.dateStart, S.dateEnd] = [S.dateEnd, S.dateStart];
  }
  #clampAndSyncTimes() {
    const S = this.#state;
    S.timeStart = this.#snapToStep(this.#clamp(S.timeMin, S.timeMax, S.timeStart), S.timeStep);
    S.timeEnd   = this.#snapToStep(this.#clamp(S.timeMin, S.timeMax, S.timeEnd), S.timeStep);
  }

  #snapToStep(value, step) { return Math.round(value / step) * step; }
  #clamp(min, max, v) { return Math.max(min, Math.min(max, v)); }

  #todayLocal() { const n=new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  #coerceDateOnly(v) {
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y,m,d]=v.split('-').map(Number); return new Date(y, m-1, d); }
    return null;
  }
  #fmtDateISO(d) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
  #fmtHHMMSS(min) { const h=Math.floor(min/60), m=min%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`; }
  #minToHMS(min) { const h=Math.floor(min/60), m=min%60, s=0; return [h,m,s]; }
  #daysBetween(a, b) {
    const MS=86400000;
    const ad=new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const bd=new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
    return Math.round((bd - ad)/MS);
  }
  #dateToIdx(d) { return this.#daysBetween(this.#state.minDate, d); }
  #idxToDate(idx) { const d=new Date(this.#state.minDate); d.setDate(d.getDate()+idx); return d; }

  /* ---------- Time Zone math (no libs) ---------- */
  #getOffsetMinutes(tz, epochMs) {
    const d = new Date(epochMs);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
    const asUTCms = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return (asUTCms - epochMs) / 60000;
  }
  #localToEpoch(tz, y, M, d, h, m, s) {
    let guess = Date.UTC(y, M - 1, d, h, m, s);
    let off = this.#getOffsetMinutes(tz, guess);
    let epoch = guess - off * 60000;
    for (let i=0;i<4;i++){ const noff=this.#getOffsetMinutes(tz, epoch); if (noff===off) break; off=noff; epoch=guess - off*60000; }
    const fmt = new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const parts = Object.fromEntries(fmt.formatToParts(new Date(epoch)).map(p=>[p.type,p.value]));
    const ok=(+parts.year===y)&&(+parts.month===M)&&(+parts.day===d)&&(+parts.hour===h)&&(+parts.minute===m)&&(+parts.second===s);
    if (!ok) epoch += 3600000;
    return epoch;
  }
  #toISOWithOffset(tz, y, M, d, h, m, s) {
    const epoch = this.#localToEpoch(tz, y, M, d, h, m, s);
    const off = this.#getOffsetMinutes(tz, epoch);
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    const oh = String(Math.floor(abs / 60)).padStart(2,'0');
    const om = String(abs % 60).padStart(2,'0');
    const YYYY=String(y).padStart(4,'0'), MM=String(M).padStart(2,'0'), DD=String(d).padStart(2,'0');
    const HH=String(h).padStart(2,'0'), MI=String(m).padStart(2,'0'), SS=String(s).padStart(2,'0');
    return `${YYYY}-${MM}-${DD}T${HH}:${MI}:${SS}${sign}${oh}:${om}`;
  }

  /* ---------- Event emitter ---------- */
  #emit(type) {
    const S = this.#state;
    const dS = this.#idxToDate(S.dateStart);
    const dE = this.#idxToDate(S.dateEnd);
    const [sH,sM,sS] = this.#minToHMS(S.timeStart);
    const [eH,eM,eS] = this.#minToHMS(S.timeEnd);
    const tz = S.timeZone;
    const crossesMidnight = S.timeEnd < S.timeStart;

    const dateStartISO = this.#fmtDateISO(dS);
    const dateEndISO   = this.#fmtDateISO(dE);
    const timeStartISO = `${String(sH).padStart(2,'0')}:${String(sM).padStart(2,'0')}:${String(sS).padStart(2,'0')}`;
    const timeEndISO   = `${String(eH).padStart(2,'0')}:${String(eM).padStart(2,'0')}:${String(eS).padStart(2,'0')}`;

    const endDateForRange = new Date(dE);
    if (crossesMidnight) endDateForRange.setDate(endDateForRange.getDate() + 1);

    const startDTISO = this.#toISOWithOffset(tz, dS.getFullYear(), dS.getMonth()+1, dS.getDate(), sH, sM, sS);
    const endDTISO   = this.#toISOWithOffset(tz, endDateForRange.getFullYear(), endDateForRange.getMonth()+1, endDateForRange.getDate(), eH, eM, eS);

    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true, composed: true,
      detail: {
        dateStart: dateStartISO, dateEnd: dateEndISO,
        timeStart: timeStartISO, timeEnd: timeEndISO,
        timeZone: tz, crossesMidnight,
        timeStartMinutes: S.timeStart, timeEndMinutes: S.timeEnd,
        rangeStartDateTimeISO: startDTISO, rangeEndDateTimeISO: endDTISO
      }
    }));
  }
}

customElements.define('date-and-daytime-range-picker', DateAndDaytimeRangePicker);
