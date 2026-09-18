/* Deductidle — daily schedule. Safe to ship to the client: no rules, only the weekday maps. */
export const LAUNCH_UTC = Date.UTC(2026, 8, 17); // puzzle #1, a Thursday
export const WEEK = { 1: 'emoji', 2: 'words', 3: 'shapes', 4: 'numbers', 5: 'cards', 6: 'shapes', 0: 'words' };
/* 1 = one rule. 2 = two rules joined, join shown. 3 = two rules joined, join hidden. Always six examples. */
export const LEVEL_FOR = { 1: 1, 2: 2, 3: 1, 4: 2, 5: 2, 6: 3, 0: 3 };

export function dayIndex(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((local - LAUNCH_UTC) / 86400000);
}

export const domainFor = (day) => WEEK[new Date(LAUNCH_UTC + day * 86400000).getUTCDay()];
