/*
 * Quiet Moon — reminders. Works out which reminders are due, entirely on the
 * phone. Nothing here sends data anywhere.
 * Author: Vishal Gangaram
 */
import { fromDay } from './cycle.js';

export const REMINDER_DEFAULTS = {
  on: true,              // master switch (in-app reminder cards)
  time: 9,               // hour of day for phone notifications
  discreet: true,        // phone notifications say only "Quiet Moon reminder"
  push: false,           // also send phone notifications (Android, installed app)
  upcoming: { on: true, days: 2 },
  due: { on: true },
  late: { on: true, days: 3 },
  fertile: { on: true, before: 0 },   // 0 = on the day, 1 = the day before
  ovulation: { on: false },
  pms: { on: false, days: 3 },
  log: { on: true, time: 20 },        // daily log reminder during a period
};

export const REMINDER_OPTIONS = {
  'upcoming.days': [1, 2, 3, 5],
  'late.days': [1, 3, 7],
  'fertile.before': [0, 1],
  'pms.days': [2, 3, 5],
  'log.time': [18, 19, 20, 21, 22],
  time: [7, 8, 9, 10, 12, 17, 18, 19],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Merge saved reminder settings over the defaults, keeping only valid values. */
export function sanitizeReminders(raw) {
  const r = clone(REMINDER_DEFAULTS);
  if (!raw || typeof raw !== 'object') return r;
  for (const k of ['on', 'discreet', 'push']) if (typeof raw[k] === 'boolean') r[k] = raw[k];
  if (REMINDER_OPTIONS.time.includes(raw.time)) r.time = raw.time;
  for (const type of ['upcoming', 'due', 'late', 'fertile', 'ovulation', 'pms', 'log']) {
    const v = raw[type];
    if (!v || typeof v !== 'object') continue;
    if (typeof v.on === 'boolean') r[type].on = v.on;
    for (const [path, allowed] of Object.entries(REMINDER_OPTIONS)) {
      const [t, field] = path.split('.');
      if (t === type && field && allowed.includes(v[field])) r[type][field] = v[field];
    }
  }
  return r;
}

const SYMPTOM_NAMES = {
  cramps: 'cramps', headache: 'headaches', bloating: 'bloating', tender_breasts: 'tender breasts', acne: 'acne',
  back_pain: 'back pain', fatigue: 'tiredness', nausea: 'nausea', cravings: 'cravings', insomnia: 'trouble sleeping',
};

/** The symptom most often logged in the 4 days before past periods (for the PMS heads-up). */
export function usualPmsSymptom(periods, entries) {
  const counts = {};
  for (const p of periods.slice(-7)) {
    for (let d = p.start - 4; d < p.start; d++) {
      const e = entries.get(fromDay(d));
      if (e) for (const s of e.symptoms || []) counts[s] = (counts[s] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? SYMPTOM_NAMES[best[0]] || null : null;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Every reminder for the current and next cycle, with the day it belongs to.
 * `card` = what to show in the app on `day`. Some reminders also stay up for a
 * few days (`until`). `push` = whether it may also go out as a phone notification.
 */
export function planReminders({ periods, status, entries, today, settings }) {
  const r = settings;
  if (!r.on || !status.hasData) return [];
  const out = [];
  const add = (type, day, text, extra = {}) => out.push({ type, day, key: `${type}:${fromDay(day)}`, text, ...extra });
  const late = status.daysLate > 0;

  if (r.upcoming.on && !status.inPeriod) {
    const start = status.nextStart - r.upcoming.days;
    // One notification on the first day; the in-app card counts down until the due day.
    for (let d = Math.max(start, today); d < status.nextStart; d++) {
      const left = status.nextStart - d;
      add('upcoming', d, `Your period may start in ${plural(left, 'day')}.`, { push: d === start, action: 'calendar' });
    }
  }
  if (r.due.on && !status.inPeriod) add('due', status.nextStart, 'Your period is due today.', { push: true, action: 'period' });
  if (r.late.on && !status.inPeriod) {
    const d = status.nextStart + r.late.days;
    if (status.daysLate >= r.late.days) {
      // Already late enough: keep the card up each day until a period is logged.
      add('late', today, `Your period is ${plural(status.daysLate, 'day')} late. Cycles can vary.`, { push: today === d, action: 'period' });
    } else {
      add('late', d, `Your period is ${plural(r.late.days, 'day')} late. Cycles can vary.`, { push: true, action: 'period' });
    }
  }
  if (r.fertile.on && !late) {
    const d = status.fertileStart - r.fertile.before;
    add('fertile', d, r.fertile.before ? 'Your fertile window starts tomorrow (estimate).' : 'Your fertile window starts today (estimate).', { push: true, action: 'calendar' });
  }
  if (r.ovulation.on && !late) add('ovulation', status.ovulation, 'Today is your estimated ovulation day.', { push: true, action: 'calendar' });
  if (r.pms.on && !status.inPeriod && !late) {
    const sym = usualPmsSymptom(periods, entries);
    add('pms', status.nextStart - r.pms.days, sym ? `You often notice ${sym} around this time.` : 'PMS symptoms may start around now.', { push: true, action: 'log' });
  }
  if (r.log.on && status.hasData) {
    const p = status.lastPeriod;
    for (let d = Math.max(p.start, today); d <= p.end; d++) {
      add('log', d, 'Your period is on. How is your flow today?', { push: true, needsNoLog: true, action: 'log' });
    }
  }
  return out;
}

/** True when a day has a real (not pre-filled) log entry. */
export const isLogged = (e) => !!(e && !e.auto);

/** The in-app cards to show today, minus dismissed and already-handled ones. */
export function dueCards(plan, today, entries, dismissed) {
  return plan.filter((it) => it.day === today
    && !dismissed[it.key]
    && !(it.needsNoLog && isLogged(entries.get(fromDay(today)))));
}

/** The schedule the service worker uses for phone notifications (Android). */
export function pushSchedule(plan, settings) {
  return {
    enabled: !!(settings.on && settings.push),
    time: settings.time,
    logTime: settings.log.time,
    items: plan.filter((it) => it.push).map((it) => ({
      key: it.key,
      type: it.type,
      date: fromDay(it.day),
      title: settings.discreet ? 'Quiet Moon reminder' : 'Quiet Moon',
      body: settings.discreet ? 'Tap to open the app.' : it.text,
      needsNoLog: !!it.needsNoLog,
    })),
  };
}
