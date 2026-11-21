/*
 * Cycle — UI and app logic.
 * Author: Vishal Gangaram
 *
 * Privacy: this file never calls fetch/XHR/WebSocket/sendBeacon. All data is
 * read from and written to on-device storage via ./db.js. The page's
 * Content-Security-Policy additionally blocks any connection to other origins.
 */
import { openStore } from './db.js';
import {
  toDay, fromDay, todayStr, isValidDateStr, findPeriods, computeStats,
  currentStatus, predictionMarkers, PHASES, PERIOD_FLOWS,
} from './cycle.js';

const FLOWS = [
  { id: 'none', label: 'None' },
  { id: 'spotting', label: 'Spotting' },
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'heavy', label: 'Heavy' },
];
const SYMPTOMS = [
  ['cramps', 'Cramps'], ['headache', 'Headache'], ['bloating', 'Bloating'],
  ['tender_breasts', 'Tender breasts'], ['acne', 'Acne'], ['back_pain', 'Back pain'],
  ['fatigue', 'Fatigue'], ['nausea', 'Nausea'], ['cravings', 'Cravings'], ['insomnia', 'Insomnia'],
];
const MOODS = [
  ['happy', 'Happy'], ['calm', 'Calm'], ['energetic', 'Energetic'], ['sensitive', 'Sensitive'],
  ['sad', 'Sad'], ['anxious', 'Anxious'], ['irritable', 'Irritable'], ['low', 'Low'],
];
const SYMPTOM_IDS = new Set(SYMPTOMS.map(([id]) => id));
const MOOD_IDS = new Set(MOODS.map(([id]) => id));
const FLOW_IDS = new Set(FLOWS.map((f) => f.id));
const DEFAULT_SETTINGS = { cycleLength: 28, periodLength: 5 };
const RELOCK_AFTER_MS = 60 * 1000;
const EXPORT_APP_ID = 'cycle-tracker-pwa';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  store: null,
  entries: new Map(), // date -> entry
  settings: { ...DEFAULT_SETTINGS },
  pin: null, // { salt, hash } or null
  view: 'today',
  calMonth: null, // { y, m } (m: 0-11)
  logDate: null,
  derived: null,
  locked: false,
  hiddenAt: 0,
};

/* ---------- helpers ---------- */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function dateFromDay(n) { return new Date(n * 86400000); }
const fmt = (n, opts) => dateFromDay(n).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts });
const fmtShort = (n) => fmt(n, { day: 'numeric', month: 'short' });
const fmtLong = (n) => fmt(n, { weekday: 'long', day: 'numeric', month: 'long' });
function fmtRange(a, b) {
  const sameMonth = dateFromDay(a).getUTCMonth() === dateFromDay(b).getUTCMonth();
  return sameMonth ? `${fmtShort(a)}–${fmt(b, { day: 'numeric' })}` : `${fmtShort(a)} – ${fmtShort(b)}`;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const today = () => toDay(todayStr());

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.classList.remove('show'); t.hidden = true; }, 2600);
}

function isEmptyEntry(e) {
  return (!e.flow || e.flow === 'none') && !(e.symptoms && e.symptoms.length) && !e.mood && !(e.note && e.note.trim());
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object' || !isValidDateStr(raw.date)) return null;
  const e = {
    date: raw.date,
    flow: FLOW_IDS.has(raw.flow) ? raw.flow : 'none',
    symptoms: Array.isArray(raw.symptoms) ? [...new Set(raw.symptoms.filter((s) => SYMPTOM_IDS.has(s)))] : [],
    mood: MOOD_IDS.has(raw.mood) ? raw.mood : '',
    note: typeof raw.note === 'string' ? raw.note.slice(0, 1000) : '',
    updated: Number.isFinite(raw.updated) ? raw.updated : 0,
  };
  return isEmptyEntry(e) ? null : e;
}

function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && Number.isInteger(raw.cycleLength) && raw.cycleLength >= 15 && raw.cycleLength <= 60) s.cycleLength = raw.cycleLength;
  if (raw && Number.isInteger(raw.periodLength) && raw.periodLength >= 1 && raw.periodLength <= 15) s.periodLength = raw.periodLength;
  return s;
}

/* ---------- data ---------- */

async function loadAll() {
  const [entries, settings, pin] = await Promise.all([
    state.store.getAllEntries(),
    state.store.getKV('settings'),
    state.store.getKV('pin'),
  ]);
  state.entries = new Map(entries.map((e) => [e.date, e]));
  state.settings = sanitizeSettings(settings);
  state.pin = pin && pin.salt && pin.hash ? pin : null;
}

function derive() {
  const periods = findPeriods([...state.entries.values()]);
  const stats = computeStats(periods, state.settings);
  const t = today();
  state.derived = { periods, stats, today: t, status: currentStatus(periods, stats, t) };
  return state.derived;
}

async function saveEntry(e) {
  if (isEmptyEntry(e)) {
    state.entries.delete(e.date);
    await state.store.deleteEntry(e.date);
  } else {
    e.updated = Date.now();
    state.entries.set(e.date, e);
    await state.store.putEntry(e);
  }
}

async function saveSettings() {
  await state.store.setKV('settings', { ...state.settings });
}

/* ---------- rendering ---------- */

function render() {
  derive();
  renderToday();
  renderCalendar();
  renderHistory();
  renderSettings();
}

function renderToday() {
  const { status, stats, today: t } = state.derived;
  $('#today-date').textContent = fmtLong(t);
  const R = 86;
  const circ = 2 * Math.PI * R;
  const arc = (el, fromFrac, toFrac) => {
    const a = Math.max(0, Math.min(1, fromFrac));
    const b = Math.max(a, Math.min(1, toFrac));
    el.setAttribute('stroke-dasharray', `0 ${(a * circ).toFixed(2)} ${((b - a) * circ).toFixed(2)} ${circ.toFixed(2)}`);
  };
  const marker = $('#ring-marker');
  $('#hero').dataset.phase = status.hasData ? status.phase : 'none';
  const pill = $('#phase-pill');
  const periodBtn = $('#period-btn');
  const endBtn = $('#period-end-btn');

  if (!status.hasData) {
    $('#ring-label').hidden = true;
    $('#ring-big').hidden = true;
    $('#ring-empty').hidden = false;
    $('#ring-sub').textContent = 'No cycle yet';
    for (const id of ['#ring-period', '#ring-fertile', '#ring-ovulation']) arc($(id), 0, 0);
    marker.setAttribute('hidden', '');
    pill.textContent = 'Getting started';
    pill.dataset.phase = 'none';
    $('#headline').textContent = 'Log your first period';
    $('#blurb').textContent = 'Tap “Period started” on its first day. You can also add past periods from the calendar.';
    $('#stat-row').hidden = true;
    periodBtn.hidden = false;
    endBtn.hidden = true;
  } else {
    const len = stats.avgCycle;
    const start = status.lastPeriod.start;
    $('#ring-label').hidden = false;
    $('#ring-big').hidden = false;
    $('#ring-empty').hidden = true;
    $('#ring-big').textContent = String(status.cycleDay);
    $('#ring-sub').textContent = status.daysLate > 0 ? `expected ~${len}` : `of ~${len}`;
    // The ring maps the whole cycle: logged period, fertile window, ovulation, and a marker for today.
    arc($('#ring-period'), 0, status.lastPeriod.length / len);
    arc($('#ring-fertile'), (status.fertileStart - start) / len, (status.fertileEnd - start + 1) / len);
    arc($('#ring-ovulation'), (status.ovulation - start) / len, (status.ovulation - start + 1) / len);
    const frac = Math.min((status.cycleDay - 0.5) / len, 1);
    const ang = frac * 2 * Math.PI;
    marker.setAttribute('cx', (100 + R * Math.cos(ang)).toFixed(2));
    marker.setAttribute('cy', (100 + R * Math.sin(ang)).toFixed(2));
    marker.dataset.phase = status.phase;
    marker.removeAttribute('hidden');
    const ph = PHASES[status.phase];
    pill.textContent = ph.label;
    pill.dataset.phase = status.phase;

    let headline;
    if (status.inPeriod) {
      const dayOf = t - status.lastPeriod.start + 1;
      headline = `Period · day ${dayOf}`;
    } else if (status.daysLate > 0) {
      headline = `${plural(status.daysLate, 'day')} late`;
    } else if (status.daysUntil === 0) {
      headline = 'Period expected today';
    } else {
      headline = `Next period in ${plural(status.daysUntil, 'day')}`;
    }
    $('#headline').textContent = headline;
    $('#blurb').textContent = ph.blurb;

    $('#stat-row').hidden = false;
    $('#stat-next').textContent = status.daysLate > 0 ? `Due ${fmtShort(status.nextStart)}` : fmtShort(status.nextStart);
    $('#stat-fertile').textContent = fmtRange(status.fertileStart, status.fertileEnd);
    $('#stat-ovulation').textContent = fmtShort(status.ovulation);

    periodBtn.hidden = status.inPeriod;
    endBtn.hidden = !status.inPeriod;
  }

  const note = $('#defaults-note');
  if (status.hasData && stats.usingDefaults) {
    note.hidden = false;
    note.textContent = `Using your default ${stats.avgCycle}-day cycle and ${stats.avgPeriod}-day period until 2 full cycles are logged.`;
  } else {
    note.hidden = true;
  }

  const e = state.entries.get(fromDay(t));
  $('#today-log-summary').textContent = e ? summarizeEntry(e) : 'Nothing logged yet. Add flow, symptoms or mood.';
}

function summarizeEntry(e) {
  const parts = [];
  if (e.flow && e.flow !== 'none') parts.push(`${FLOWS.find((f) => f.id === e.flow).label} flow`);
  if (e.symptoms?.length) parts.push(e.symptoms.map((s) => SYMPTOMS.find(([id]) => id === s)[1]).join(', '));
  if (e.mood) parts.push(`Mood: ${MOODS.find(([id]) => id === e.mood)[1]}`);
  if (e.note?.trim()) parts.push(`“${e.note.trim().slice(0, 60)}${e.note.trim().length > 60 ? '…' : ''}”`);
  return parts.join(' · ') || 'Logged';
}

function renderCalendar() {
  if (!state.calMonth) {
    const n = new Date();
    state.calMonth = { y: n.getFullYear(), m: n.getMonth() };
  }
  const { y, m } = state.calMonth;
  const { periods, stats, today: t } = state.derived;
  const first = Math.round(Date.UTC(y, m, 1) / 86400000);
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const firstWeekday = (dateFromDay(first).getUTCDay() + 6) % 7; // Monday = 0
  const gridStart = first - firstWeekday;
  const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const markers = predictionMarkers(periods, stats, t, gridStart, gridStart + cells - 1);
  const periodDays = new Set();
  for (const p of periods) for (let d = p.start; d <= p.end; d++) periodDays.add(d);

  $('#cal-title').textContent = dateFromDay(first).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' });

  let html = '';
  for (let i = 0; i < cells; i++) {
    const d = gridStart + i;
    const ds = fromDay(d);
    const dt = dateFromDay(d);
    const inMonth = dt.getUTCMonth() === m;
    const e = state.entries.get(ds);
    const mk = markers.get(d) || {};
    const cls = ['day'];
    if (!inMonth) cls.push('out');
    if (d === t) cls.push('today');
    if (periodDays.has(d) || (e && PERIOD_FLOWS.has(e.flow))) cls.push('period');
    else if (e && e.flow === 'spotting') cls.push('spotting');
    else if (mk.predicted) cls.push('predicted');
    if (!cls.includes('period') && !mk.predicted) {
      if (mk.ovulation) cls.push('ovulation');
      else if (mk.fertile) cls.push('fertile');
    }
    const hasExtra = e && ((e.symptoms && e.symptoms.length) || e.mood || (e.note && e.note.trim()));
    const labels = [fmtLong(d)];
    if (cls.includes('period')) labels.push('period');
    if (cls.includes('spotting')) labels.push('spotting');
    if (cls.includes('predicted')) labels.push('predicted period');
    if (cls.includes('ovulation')) labels.push('estimated ovulation');
    if (cls.includes('fertile')) labels.push('fertile window');
    if (hasExtra) labels.push('has notes');
    html += `<button type="button" role="gridcell" class="${cls.join(' ')}" data-date="${ds}" aria-label="${esc(labels.join(', '))}"${d === t ? ' aria-current="date"' : ''}><span class="num">${dt.getUTCDate()}</span>${hasExtra ? '<span class="dot" aria-hidden="true"></span>' : ''}</button>`;
  }
  $('#cal-grid').innerHTML = html;
}

function renderHistory() {
  const { periods, stats, today: t } = state.derived;
  const list = $('#history-list');
  $('#avg-cycle').textContent = stats.rawAvgCycle ? `${stats.rawAvgCycle.toFixed(1)} d` : '–';
  $('#avg-period').textContent = stats.rawAvgPeriod ? `${stats.rawAvgPeriod.toFixed(1)} d` : '–';
  $('#cycles-count').textContent = String(stats.cycles.length);
  $('#avg-note').textContent = stats.usingDefaults
    ? `Predictions use your defaults (${state.settings.cycleLength}-day cycle, ${state.settings.periodLength}-day period) until 2 cycles are logged.`
    : `Averages use your last ${stats.validCycles.length} cycles (cycles under 15 or over 60 days are ignored).`;

  if (!periods.length) {
    list.innerHTML = '<li class="empty card">No periods logged yet. Use “Period started” on the Today screen, or tap days in the calendar.</li>';
    return;
  }
  const rows = periods.map((p, i) => {
    const next = periods[i + 1];
    const cycleLen = next ? next.start - p.start : null;
    const ignored = cycleLen !== null && (cycleLen < 15 || cycleLen > 60);
    const cycleText = cycleLen !== null
      ? `${cycleLen}-day cycle${ignored ? ' (ignored)' : ''}`
      : (p.start <= t ? `Current cycle · day ${t - p.start + 1}` : 'Upcoming');
    const year = dateFromDay(p.start).getUTCFullYear();
    // Bar: whole width = 45 days; lavender = cycle length, rose = period length.
    const scale = (n) => Math.max(0, Math.min(100, (n / 45) * 100)).toFixed(1);
    const cycleSpan = cycleLen ?? Math.max(t - p.start + 1, p.length);
    const isCurrent = !next && p.start <= t;
    const bar = `<svg class="hist-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
        <rect class="bar-track" x="0" y="0" width="100" height="8" rx="4"/>
        <rect class="bar-cycle" x="0" y="0" width="${scale(cycleSpan)}" height="8" rx="4"/>
        <rect class="bar-period" x="0" y="0" width="${scale(p.length)}" height="8" rx="4"/>
      </svg>`;
    return `<li class="card hist-item${isCurrent ? ' current' : ''}">
      <div class="hist-dot" aria-hidden="true"></div>
      <div class="hist-main">
        <span class="hist-date">${esc(fmtRange(p.start, p.end))} <span class="hist-year">${year}</span></span>
        <span class="hist-sub">${esc(cycleText)}</span>
      </div>
      <span class="hist-len">${plural(p.length, 'day')}</span>
      ${bar}
    </li>`;
  });
  list.innerHTML = rows.reverse().join('');
}

function renderSettings() {
  $('#set-cycle').textContent = state.settings.cycleLength;
  $('#set-period').textContent = state.settings.periodLength;
  $('#pin-status').textContent = state.pin ? 'On — asked when the app opens' : 'Off';
  $('#pin-set-btn').textContent = state.pin ? 'Change' : 'Set PIN';
  $('#pin-remove-row').hidden = !state.pin;
  $('#storage-kind').textContent = state.store.kind;
}

/* ---------- navigation ---------- */

function showView(name) {
  state.view = name;
  for (const v of ['today', 'calendar', 'history', 'settings']) {
    $(`#view-${v}`).hidden = v !== name;
  }
  for (const tab of $$('.tab')) {
    if (tab.dataset.view === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}

/* ---------- sheets ---------- */

function openSheet(dlg) {
  if (!dlg.open) dlg.showModal();
}

function setupSheetClose() {
  for (const dlg of $$('dialog')) {
    dlg.addEventListener('click', (ev) => {
      if (ev.target === dlg && dlg.classList.contains('sheet')) dlg.close('cancel'); // backdrop tap
      if (ev.target.closest('[data-close]')) dlg.close('cancel');
    });
  }
}

function buildLogControls() {
  $('#flow-seg').innerHTML = FLOWS.map((f) =>
    `<button type="button" role="radio" aria-checked="false" data-flow="${f.id}" class="seg-btn flow-${f.id}"><span class="flow-ico" aria-hidden="true"></span>${f.label}</button>`).join('');
  $('#symptom-chips').innerHTML = SYMPTOMS.map(([id, label]) =>
    `<button type="button" class="chip" aria-pressed="false" data-symptom="${id}">${label}</button>`).join('');
  $('#mood-chips').innerHTML = MOODS.map(([id, label]) =>
    `<button type="button" class="chip" role="radio" aria-checked="false" data-mood="${id}">${label}</button>`).join('');

  $('#flow-seg').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-flow]');
    if (!b) return;
    for (const x of $$('[data-flow]')) x.setAttribute('aria-checked', String(x === b));
  });
  $('#symptom-chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-symptom]');
    if (b) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
  });
  $('#mood-chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-mood]');
    if (!b) return;
    const was = b.getAttribute('aria-checked') === 'true';
    for (const x of $$('[data-mood]')) x.setAttribute('aria-checked', 'false');
    b.setAttribute('aria-checked', String(!was));
  });
}

function openLog(dateStr) {
  state.logDate = dateStr;
  const d = toDay(dateStr);
  const t = today();
  $('#log-title').textContent = d === t ? 'Today' : fmtLong(d);
  $('#log-eyebrow').textContent = d === t ? fmtLong(d) : (d > t ? 'Daily log · future day' : 'Daily log');
  const e = state.entries.get(dateStr) || { flow: 'none', symptoms: [], mood: '', note: '' };
  for (const x of $$('[data-flow]')) x.setAttribute('aria-checked', String(x.dataset.flow === (e.flow || 'none')));
  for (const x of $$('[data-symptom]')) x.setAttribute('aria-pressed', String(e.symptoms.includes(x.dataset.symptom)));
  for (const x of $$('[data-mood]')) x.setAttribute('aria-checked', String(x.dataset.mood === e.mood));
  $('#log-note').value = e.note || '';
  $('#log-clear').hidden = !state.entries.has(dateStr);
  openSheet($('#log-sheet'));
}

async function submitLog() {
  const e = {
    date: state.logDate,
    flow: ($('[data-flow][aria-checked="true"]') || {}).dataset?.flow || 'none',
    symptoms: $$('[data-symptom][aria-pressed="true"]').map((x) => x.dataset.symptom),
    mood: ($('[data-mood][aria-checked="true"]') || {}).dataset?.mood || '',
    note: $('#log-note').value.slice(0, 1000),
  };
  await saveEntry(e);
  render();
  toast(isEmptyEntry(e) ? 'Day cleared' : 'Saved');
}

function openPeriodSheet() {
  const t = todayStr();
  const input = $('#period-start');
  input.value = t;
  input.max = t;
  const len = state.derived.stats.avgPeriod;
  $('#period-len').textContent = len;
  $('#period-len-note').textContent = state.derived.stats.usingDefaults
    ? `Your default period length (${state.settings.periodLength} days)`
    : `Your average period length (${len} days)`;
  openSheet($('#period-sheet'));
}

async function submitPeriod() {
  const start = $('#period-start').value;
  if (!isValidDateStr(start)) { toast('Pick a valid date'); return; }
  const len = Number($('#period-len').textContent) || state.settings.periodLength;
  const s = toDay(start);
  for (let d = s; d < s + len; d++) {
    const ds = fromDay(d);
    const existing = state.entries.get(ds);
    if (existing && PERIOD_FLOWS.has(existing.flow)) continue;
    await saveEntry({ ...(existing || { date: ds, symptoms: [], mood: '', note: '' }), date: ds, flow: 'medium' });
  }
  render();
  toast(`Period logged from ${fmtShort(s)}`);
}

async function periodEndedToday() {
  const { status } = state.derived;
  if (!status.inPeriod) return;
  const t = today();
  for (let d = t + 1; d <= status.lastPeriod.end; d++) {
    const ds = fromDay(d);
    const e = state.entries.get(ds);
    if (e && PERIOD_FLOWS.has(e.flow)) await saveEntry({ ...e, flow: 'none' });
  }
  render();
  toast('Period marked as ended today');
}

function confirmDialog(title, text, okLabel = 'Delete') {
  const dlg = $('#confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

/* ---------- PIN ---------- */

const hasCrypto = () => !!(self.crypto && crypto.subtle && crypto.getRandomValues);

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin, salt) {
  return sha256Hex(`${salt}:${pin}`);
}

const lockState = { digits: '', fails: 0, until: 0 };

function updateDots() {
  $$('#pin-dots span').forEach((s, i) => s.classList.toggle('on', i < lockState.digits.length));
}

function showLock() {
  if (!state.pin) return;
  state.locked = true;
  lockState.digits = '';
  updateDots();
  $('#lock-msg').textContent = 'Your data is locked on this device.';
  $('#lock').hidden = false;
  $('#app').setAttribute('aria-hidden', 'true');
  $('#app').inert = true;
  document.querySelector('.tabbar').inert = true;
  for (const d of $$('dialog[open]')) d.close('cancel');
}

function hideLock() {
  state.locked = false;
  $('#lock').hidden = true;
  $('#app').removeAttribute('aria-hidden');
  $('#app').inert = false;
  document.querySelector('.tabbar').inert = false;
}

async function lockKey(key) {
  if (Date.now() < lockState.until) return;
  if (key === 'del') lockState.digits = lockState.digits.slice(0, -1);
  else if (lockState.digits.length < 4) lockState.digits += key;
  updateDots();
  if (lockState.digits.length < 4) return;
  const ok = (await hashPin(lockState.digits, state.pin.salt)) === state.pin.hash;
  if (ok) {
    lockState.fails = 0;
    hideLock();
    return;
  }
  lockState.fails += 1;
  const dots = $('#pin-dots');
  dots.classList.remove('shake');
  void dots.offsetWidth;
  dots.classList.add('shake');
  setTimeout(() => { lockState.digits = ''; updateDots(); }, 350);
  if (lockState.fails >= 5) {
    const wait = Math.min(30 * 2 ** (lockState.fails - 5), 300);
    lockState.until = Date.now() + wait * 1000;
    $('#lock-msg').textContent = `Too many attempts. Try again in ${wait} seconds.`;
  } else {
    $('#lock-msg').textContent = 'Wrong PIN, try again.';
  }
}

function setupLock() {
  $('#keypad').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-key]');
    if (b) lockKey(b.dataset.key);
  });
  document.addEventListener('keydown', (ev) => {
    if (!state.locked) return;
    if (/^[0-9]$/.test(ev.key)) lockKey(ev.key);
    else if (ev.key === 'Backspace') lockKey('del');
  });
  $('#forgot-pin').addEventListener('click', async () => {
    // Temporarily allow the confirm dialog above the lock screen.
    const ok = await confirmDialog('Forgot your PIN?',
      'The PIN cannot be recovered. The only way to unlock is to delete ALL data on this device. You can then import a backup if you have one.',
      'Delete all data');
    if (ok) await deleteAllData();
  });
}

async function savePin(ev) {
  ev.preventDefault();
  const a = $('#pin-new').value;
  const b = $('#pin-repeat').value;
  const err = $('#pin-error');
  if (!/^\d{4}$/.test(a)) { err.textContent = 'The PIN must be exactly 4 digits.'; err.classList.add('error'); return; }
  if (a !== b) { err.textContent = 'The two PINs don’t match.'; err.classList.add('error'); return; }
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = [...saltBytes].map((x) => x.toString(16).padStart(2, '0')).join('');
  const pin = { salt, hash: await hashPin(a, salt) };
  await state.store.setKV('pin', pin);
  state.pin = pin;
  $('#pin-sheet').close('save');
  renderSettings();
  toast('PIN saved');
}

/* ---------- backup ---------- */

function buildExport() {
  return {
    app: EXPORT_APP_ID,
    format: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...state.settings },
    entries: [...state.entries.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

async function exportData() {
  const json = JSON.stringify(buildExport(), null, 2);
  const name = `cycle-backup-${todayStr()}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  // On phones the share sheet ("Save to Files", AirDrop, Drive…) is the most reliable route.
  const isTouch = matchMedia('(pointer: coarse)').matches;
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Cycle backup' });
      toast('Backup ready');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`Exported ${plural(state.entries.size, 'day')}`);
}

function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!data || data.app !== EXPORT_APP_ID || !Array.isArray(data.entries)) {
    throw new Error('This doesn’t look like a Cycle backup file.');
  }
  const entries = data.entries.map(sanitizeEntry).filter(Boolean);
  return { entries, settings: data.settings ? sanitizeSettings(data.settings) : null, exportedAt: data.exportedAt };
}

async function importFile(file) {
  if (file.size > 20 * 1024 * 1024) { toast('That file is too large'); return; }
  let parsed;
  try { parsed = parseBackup(await file.text()); } catch (e) { toast(e.message); return; }
  const when = parsed.exportedAt && !Number.isNaN(Date.parse(parsed.exportedAt))
    ? ` from ${new Date(parsed.exportedAt).toLocaleDateString()}` : '';
  $('#import-summary').textContent = `Backup${when} with ${plural(parsed.entries.length, 'logged day')}. This device currently has ${plural(state.entries.size, 'logged day')}.`;
  const dlg = $('#import-sheet');
  dlg.returnValue = '';
  dlg.showModal();
  const choice = await new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true }));
  if (choice !== 'merge' && choice !== 'replace') return;
  await applyImport(parsed, choice);
}

async function applyImport(parsed, mode) {
  if (mode === 'replace') {
    await state.store.putEntries(parsed.entries, { replace: true });
    if (parsed.settings) { state.settings = parsed.settings; await saveSettings(); }
  } else {
    const toWrite = parsed.entries.filter((e) => {
      const cur = state.entries.get(e.date);
      return !cur || (e.updated || 0) >= (cur.updated || 0);
    });
    await state.store.putEntries(toWrite);
  }
  await loadAll();
  render();
  toast(mode === 'replace' ? `Replaced with ${plural(parsed.entries.length, 'day')}` : `Merged ${plural(parsed.entries.length, 'day')}`);
}

async function deleteAllData() {
  await state.store.clearAll();
  try { localStorage.removeItem('cycle.entries'); localStorage.removeItem('cycle.kv'); } catch { /* ignore */ }
  state.entries = new Map();
  state.settings = { ...DEFAULT_SETTINGS };
  state.pin = null;
  hideLock();
  render();
  showView('today');
  toast('All data deleted');
}

/* ---------- wiring ---------- */

function setupEvents() {
  $('.tabbar').addEventListener('click', (ev) => {
    const b = ev.target.closest('.tab');
    if (b) showView(b.dataset.view);
  });
  $('#today-log-btn').addEventListener('click', () => openLog(todayStr()));
  $('#today-log-card').addEventListener('click', () => openLog(todayStr()));
  $('#period-btn').addEventListener('click', openPeriodSheet);
  $('#period-end-btn').addEventListener('click', periodEndedToday);

  $('#cal-grid').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-date]');
    if (b) openLog(b.dataset.date);
  });
  const shiftMonth = (delta) => {
    const d = new Date(state.calMonth.y, state.calMonth.m + delta, 1);
    state.calMonth = { y: d.getFullYear(), m: d.getMonth() };
    renderCalendar();
  };
  $('#cal-prev').addEventListener('click', () => shiftMonth(-1));
  $('#cal-next').addEventListener('click', () => shiftMonth(1));
  $('#cal-today').addEventListener('click', () => { state.calMonth = null; renderCalendar(); });
  // Swipe between months
  let touchX = null;
  $('#cal-grid').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#cal-grid').addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 60) shiftMonth(dx < 0 ? 1 : -1);
  });

  $('#log-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await submitLog();
    $('#log-sheet').close('save');
  });
  $('#log-clear').addEventListener('click', async () => {
    await saveEntry({ date: state.logDate, flow: 'none', symptoms: [], mood: '', note: '' });
    $('#log-sheet').close('clear');
    render();
    toast('Day cleared');
  });

  $('#period-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('#period-sheet').close('save');
    await submitPeriod();
  });

  for (const stepper of $$('.stepper')) {
    stepper.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-step]');
      if (!b) return;
      const out = $('output', stepper);
      const min = Number(stepper.dataset.min);
      const max = Number(stepper.dataset.max);
      const v = Math.min(max, Math.max(min, Number(out.textContent) + Number(b.dataset.step)));
      out.textContent = v;
      if (stepper.dataset.setting) {
        state.settings[stepper.dataset.setting] = v;
        await saveSettings();
        render();
      }
    });
  }

  $('#pin-set-btn').addEventListener('click', () => {
    if (!hasCrypto()) { toast('PIN needs a secure (HTTPS) connection'); return; }
    $('#pin-new').value = '';
    $('#pin-repeat').value = '';
    $('#pin-error').classList.remove('error');
    $('#pin-error').textContent = 'Only a salted SHA-256 hash is stored, never the PIN itself. If you forget it, the only way back in is to delete all data — keep a backup.';
    $('#pin-title').textContent = state.pin ? 'Change your PIN' : 'Set a 4-digit PIN';
    openSheet($('#pin-sheet'));
  });
  $('#pin-form').addEventListener('submit', savePin);
  $('#pin-remove-btn').addEventListener('click', async () => {
    const ok = await confirmDialog('Remove PIN?', 'The app will open without asking for a PIN.', 'Remove');
    if (!ok) return;
    await state.store.setKV('pin', null);
    state.pin = null;
    renderSettings();
    toast('PIN removed');
  });

  $('#export-btn').addEventListener('click', exportData);
  $('#import-file').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (f) await importFile(f);
  });
  $('#delete-all-btn').addEventListener('click', async () => {
    const ok = await confirmDialog('Delete all data?',
      `This permanently erases ${plural(state.entries.size, 'logged day')}, your settings and PIN from this device. It cannot be undone. Export a backup first if you want to keep anything.`,
      'Delete everything');
    if (ok) await deleteAllData();
  });

  // Hide content when backgrounded; re-lock after a minute away.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      state.hiddenAt = Date.now();
      if (state.pin) $('#privacy-cover').hidden = false;
    } else {
      $('#privacy-cover').hidden = true;
      if (state.pin && !state.locked && Date.now() - state.hiddenAt > RELOCK_AFTER_MS) showLock();
      // The date may have changed while the app was in the background.
      render();
    }
  });
}

function registerSW() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { /* offline cache unavailable */ });
  }
}

async function init() {
  state.store = await openStore();
  await loadAll();
  if (state.pin) showLock();
  buildLogControls();
  setupSheetClose();
  setupLock();
  setupEvents();
  render();
  showView('today');
  document.body.classList.add('ready');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  registerSW();
}

// Expose a tiny hook for automated tests (no data leaves the page).
window.__cycle = { state, derive };

init();
