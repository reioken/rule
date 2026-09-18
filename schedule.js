/* Deductidle — daily schedule. Safe to ship to the client: no rules, only the weekday maps. */
export const LAUNCH_UTC = Date.UTC(2026, 8, 17); // puzzle #1, a Thursday
export const WEEK = { 1: 'emoji', 2: 'words', 3: 'shapes', 4: 'numbers', 5: 'cards', 6: 'shapes', 0: 'words' };
/* 1 = one rule, six examples. 2 = compound rule, six examples. 3 = compound rule, four examples. */
export const LEVEL_FOR = { 1: 1, 2: 2, 3: 1, 4: 2, 5: 2, 6: 3, 0: 3 };
/* Black box alternates between numbers and words. */
export const BOX_WEEK = { 1: 'numbers', 2: 'words', 3: 'numbers', 4: 'words', 5: 'numbers', 6: 'words', 0: 'numbers' };

export function dayIndex(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((local - LAUNCH_UTC) / 86400000);
}

export const domainFor = (day) => WEEK[new Date(LAUNCH_UTC + day * 86400000).getUTCDay()];
export const boxDomainFor = (day) => BOX_WEEK[new Date(LAUNCH_UTC + day * 86400000).getUTCDay()];
