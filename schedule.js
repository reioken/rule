/* Deductidle — which puzzles are today's. Safe to ship to the client: no rules here, only the draw.
   Every day has three puzzles, Easy, Medium and Hard, each with a different kind of thing. The draw
   comes from a seed made of the day number, so everyone gets the same three and nothing repeats on
   a weekly pattern. A slot never shows the same kind two days in a row. */
export const LAUNCH_UTC = Date.UTC(2026, 8, 17); // day 1
export const DAILY_DOMAINS = ['numbers', 'words', 'shapes', 'emoji', 'cards'];
/* 1: one simple rule. 2: two rules joined, join shown. 3: two rules joined, join hidden. */
export const LEVELS_PER_DAY = [1, 2, 3];
export const LEVEL_NAMES = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const EASY_ONLY = new Set(['emoji']); // too few emoji to build many compound rules from

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
/* The three puzzles of one day, in order: [{ level, domainId }, ...]. Day 1 is fixed so the launch puzzle stays what it was. */
export function dayPlan(day) {
  day = Math.max(0, day);
  while (plans.length <= day) {
    const d = plans.length;
    if (d === 0) { plans.push([{ level: 1, domainId: 'numbers' }, { level: 2, domainId: 'words' }, { level: 3, domainId: 'cards' }]); continue; }
    const rng = seeded(d * 7919 + 3);
    const prev = plans[d - 1];
    const used = new Set();
    const slots = LEVELS_PER_DAY.map((level) => {
      const choices = DAILY_DOMAINS.filter((id) => !used.has(id) && id !== prev[level - 1].domainId && (level === 1 || !EASY_ONLY.has(id)));
      const domainId = choices[Math.floor(rng() * choices.length)];
      used.add(domainId);
      return { level, domainId };
    });
    plans.push(slots);
  }
  return plans[day];
}
export const domainFor = (day, level = 1) => dayPlan(day)[level - 1].domainId;
