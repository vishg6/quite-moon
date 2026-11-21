/*
 * Quiet Moon — cycle maths (pure functions, no DOM, no storage).
 * Author: Vishal Gangaram
 *
 * Dates are handled as "YYYY-MM-DD" strings in the user's local calendar and
 * converted to integer day numbers (days since 1970-01-01, UTC-based) for
 * arithmetic, so daylight-saving changes never shift a day.
 */

export const DAY_MS = 86400000;
export const PERIOD_FLOWS = new Set(['light', 'medium', 'heavy']);
export const MIN_CYCLE = 15;
export const MAX_CYCLE = 60;
export const CYCLES_TO_AVERAGE = 6;

const pad = (n) => String(n).padStart(2, '0');

export function toDay(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDay(n) {
  const dt = new Date(n * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromDay(toDay(s)) === s;
}

/**
 * Group days with light/medium/heavy flow into periods. A single unlogged day
 * inside a period is bridged (e.g. a forgotten log). Spotting alone never
 * starts or extends a period.
 * @returns {{start:number,end:number,length:number}[]} oldest first
 */
export function findPeriods(entries) {
  const days = [...new Set(
    entries.filter((e) => PERIOD_FLOWS.has(e.flow)).map((e) => toDay(e.date))
  )].sort((a, b) => a - b);
  const periods = [];
  for (const d of days) {
    const last = periods[periods.length - 1];
    if (last && d - last.end <= 2) last.end = d;
    else periods.push({ start: d, end: d });
  }
  for (const p of periods) p.length = p.end - p.start + 1;
  return periods;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Cycle statistics. Cycle length = days between consecutive period starts.
 * Averages use the last 6 cycles of 15–60 days; until 2 such cycles exist the
 * user's default cycle and period lengths are used.
 */
export function computeStats(periods, settings) {
  const cycles = [];
  for (let i = 0; i < periods.length - 1; i++) {
    cycles.push({ start: periods[i].start, length: periods[i + 1].start - periods[i].start });
  }
  const valid = cycles.filter((c) => c.length >= MIN_CYCLE && c.length <= MAX_CYCLE)
    .slice(-CYCLES_TO_AVERAGE);
  const usingDefaults = valid.length < 2;
  // Period lengths of the periods that begin the counted cycles (plus the latest one).
  const recentPeriods = periods.slice(-CYCLES_TO_AVERAGE).map((p) => p.length);
  const avgCycle = usingDefaults ? settings.cycleLength : Math.round(mean(valid.map((c) => c.length)));
  const avgPeriod = usingDefaults || !recentPeriods.length
    ? settings.periodLength
    : Math.round(mean(recentPeriods));
  return {
    cycles,
    validCycles: valid,
    usingDefaults,
    avgCycle,
    avgPeriod,
    rawAvgCycle: valid.length ? mean(valid.map((c) => c.length)) : null,
    rawAvgPeriod: periods.length ? mean(recentPeriods) : null,
  };
}

/**
 * Where are we today?
 * @param {number} today day number
 */
export function currentStatus(periods, stats, today) {
  const past = periods.filter((p) => p.start <= today);
  if (!past.length) return { hasData: false };
  const last = past[past.length - 1];
  const cycleDay = today - last.start + 1;
  const nextStart = last.start + stats.avgCycle;
  const daysUntil = nextStart - today;
  const ovulation = nextStart - 14;
  const fertileStart = ovulation - 5;
  const fertileEnd = ovulation + 1;

  let phase;
  if (today <= last.end) phase = 'menstrual';
  else if (daysUntil < 0) phase = 'late';
  else if (daysUntil === 0) phase = 'due';
  else if (today === ovulation) phase = 'ovulation';
  else if (today >= fertileStart && today <= fertileEnd) phase = 'fertile';
  else if (today < fertileStart) phase = 'follicular';
  else phase = 'luteal';

  return {
    hasData: true,
    lastPeriod: last,
    cycleDay,
    nextStart,
    daysUntil,
    daysLate: daysUntil < 0 ? -daysUntil : 0,
    ovulation,
    fertileStart,
    fertileEnd,
    phase,
    inPeriod: today <= last.end,
  };
}

/**
 * Calendar markers for day numbers in [from, to].
 * @returns {Map<number, {predicted?:boolean, fertile?:boolean, ovulation?:boolean}>}
 */
export function predictionMarkers(periods, stats, today, from, to) {
  const map = new Map();
  const mark = (d, key) => {
    if (d < from || d > to) return;
    const m = map.get(d) || {};
    m[key] = true;
    map.set(d, m);
  };
  const past = periods.filter((p) => p.start <= today);
  if (!past.length) return map;
  const last = past[past.length - 1];
  // Ignore anything already logged after the last period start (e.g. pre-filled days).
  const loggedEnd = Math.max(last.end, ...periods.map((p) => p.end));

  for (let k = 1; ; k++) {
    const start = last.start + k * stats.avgCycle;
    const ov = start - 14;
    if (ov - 5 > to) break;
    for (let d = ov - 5; d <= ov + 1; d++) if (d > loggedEnd) mark(d, 'fertile');
    if (ov > loggedEnd) mark(ov, 'ovulation');
    for (let d = start; d < start + stats.avgPeriod; d++) {
      if (d >= today && d > loggedEnd) mark(d, 'predicted');
    }
    if (k > 400) break; // safety
  }
  return map;
}

/** Phase labels and short descriptions for the Today screen. */
export const PHASES = {
  menstrual: { label: 'Period', blurb: 'Your period is here. Rest, hydrate and be gentle with yourself.' },
  follicular: { label: 'Follicular phase', blurb: 'Energy often rises as your body prepares to ovulate.' },
  fertile: { label: 'Fertile window', blurb: 'Estimated fertile days around ovulation.' },
  ovulation: { label: 'Ovulation (est.)', blurb: 'Estimated ovulation day — the most fertile day of the cycle.' },
  luteal: { label: 'Luteal phase', blurb: 'The second half of your cycle. PMS symptoms may appear.' },
  due: { label: 'Period expected', blurb: 'Your period is predicted to start today.' },
  late: { label: 'Period late', blurb: 'Your period hasn’t been logged yet. Cycles naturally vary.' },
};
