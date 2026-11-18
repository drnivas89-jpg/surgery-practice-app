// Matching presentation files to scheduled classes, by topic words and any
// date written in the file name. Pure functions so they can be tested.

const STOP = new Set([
  'the', 'and', 'of', 'in', 'on', 'to', 'for', 'a', 'an', 'with', 'by', 'at', 'from', 'vs',
  'ppt', 'pptx', 'pdf', 'key', 'final', 'copy', 'new', 'draft', 'class', 'lecture', 'seminar',
  'presentation', 'slides', 'talk', 'dr', 'v1', 'v2', 'v3', 'rev', 'updated',
]);

export function topicTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '') // file extension
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t))
    // light stemming so "hernias"/"hernia", "fractures"/"fracture" meet
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t));
}

/** A yyyy-mm-dd date written in a file name (2026-11-12, 12-11-2026, 12.11.26, 12_11_2026), or null. */
export function dateInName(name: string): string | null {
  const iso = name.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  const dmy = name.match(/(?<!\d)(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2}|\d{2})(?!\d)/);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface MatchableClass { id: string; topic: string; class_date: string | null }

/** 0..1 for topic overlap, plus 1 when the file name carries the class date. */
export function matchScore(fileName: string, c: MatchableClass): number {
  const topic = new Set(topicTokens(c.topic || ''));
  const file = new Set(topicTokens(fileName));
  let overlap = 0;
  topic.forEach((t) => { if (file.has(t)) overlap++; });
  const words = topic.size && file.size ? overlap / Math.min(topic.size, file.size) : 0;
  const date = dateInName(fileName);
  return words + (date && c.class_date && date === c.class_date.substring(0, 10) ? 1 : 0);
}

export const MATCH_THRESHOLD = 0.5;

/**
 * Assign each file to at most one class, best scores first, one file per
 * class. Files with no class above the threshold are left unmatched (null).
 */
export function matchFilesToClasses(fileNames: string[], classes: MatchableClass[]): (string | null)[] {
  const pairs: { f: number; c: string; s: number }[] = [];
  fileNames.forEach((name, f) => classes.forEach((c) => {
    const s = matchScore(name, c);
    if (s >= MATCH_THRESHOLD) pairs.push({ f, c: c.id, s });
  }));
  pairs.sort((a, b) => b.s - a.s);
  const result: (string | null)[] = fileNames.map(() => null);
  const used = new Set<string>();
  for (const p of pairs) {
    if (result[p.f] !== null || used.has(p.c)) continue;
    result[p.f] = p.c;
    used.add(p.c);
  }
  return result;
}

/** Most similar earlier class on the same topic that already has slides. */
export function findReusable<T extends MatchableClass & { ppt_paths: string[] }>(target: MatchableClass, all: T[]): T | null {
  const want = topicTokens(target.topic || '');
  if (want.length === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const c of all) {
    if (c.id === target.id || c.ppt_paths.length === 0) continue;
    const have = new Set(topicTokens(c.topic || ''));
    const overlap = want.filter((t) => have.has(t)).length / Math.max(want.length, have.size);
    if (overlap > bestScore || (overlap === bestScore && best && (c.class_date || '') > (best.class_date || ''))) {
      best = c;
      bestScore = overlap;
    }
  }
  return bestScore >= 0.6 ? best : null;
}
