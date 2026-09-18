/* Deductidle — which puzzle is today's. Safe to ship to the client: no rules here, only the draw.
   Every day draws a domain and a difficulty from a seed made of the day number, so everyone gets
   the same puzzle and nothing repeats on a weekly pattern. A domain never comes up two days in a row. */
export const LAUNCH_UTC = Date.UTC(2026, 8, 17); // puzzle #1
export const DAILY_DOMAINS = ['numbers', 'words', 'shapes', 'emoji', 'cards'];
/* 1: one simple rule. 2: two rules joined, join shown. 3: two rules joined, join hidden. */
export const LEVEL_WEIGHTS = [[1, 0.4], [2, 0.4], [3, 0.2]];

export function dayIndex(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((local - LAUNCH_UTC) / 86400000);
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plans = [];
/* The draw for one day. Day 1 is fixed so the launch puzzle stays what it was. */
export function dayPlan(day) {
  day = Math.max(0, day);
  while (plans.length <= day) {
    const d = plans.length;
    if (d === 0) { plans.push({ domainId: 'numbers', level: 1 }); continue; }
    const rng = seeded(d * 7919 + 3);
    const prev = plans[d - 1].domainId;
    const choices = DAILY_DOMAINS.filter((id) => id !== prev);
    const domainId = choices[Math.floor(rng() * choices.length)];
    let roll = rng(), level = 1;
    for (const [lvl, w] of LEVEL_WEIGHTS) { if (roll < w) { level = lvl; break; } roll -= w; }
    if (domainId === 'emoji') level = 1; // too few emoji to build many compound rules from
    plans.push({ domainId, level });
  }
  return plans[day];
}
export const domainFor = (day) => dayPlan(day).domainId;
export const levelFor = (day) => dayPlan(day).level;
