/* Rule — daily schedule. Safe to ship to the client: no rules, only the weekday map. */
export const LAUNCH_UTC = Date.UTC(2026, 8, 17); // puzzle #1, a Thursday
export const WEEK = { 1: 'numbers', 2: 'words', 3: 'shapes', 4: 'numbers', 5: 'words', 6: 'shapes', 0: 'words' };

export function dayIndex(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((local - LAUNCH_UTC) / 86400000);
}

export const domainFor = (day) => WEEK[new Date(LAUNCH_UTC + day * 86400000).getUTCDay()];
