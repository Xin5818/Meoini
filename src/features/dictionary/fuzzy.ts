export function levenshtein(a: string, b: string): number {
  const aa = normalizeWord(a).toLocaleLowerCase();
  const bb = normalizeWord(b).toLocaleLowerCase();
  if (aa === bb) return 0;
  if (aa.length === 0) return bb.length;
  if (bb.length === 0) return aa.length;

  const row = new Array<number>(bb.length + 1);
  for (let j = 0; j <= bb.length; j++) row[j] = j;

  for (let i = 1; i <= aa.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= bb.length; j++) {
      const temp = row[j];
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[bb.length];
}

/** Canonical Unicode normalization keeps composed and decomposed accents equivalent. */
export function normalizeWord(word: string): string {
  return word.normalize("NFC").trim();
}

/** Return spellings that differ only by Finnish a/ä and o/ö keyboard substitutions. */
export function diacriticVariants(word: string, limit = 16): string[] {
  const chars = Array.from(normalizeWord(word).toLocaleLowerCase());
  const alternatives: string[][] = chars.map((char) => {
    if (char === "a") return ["a", "ä"];
    if (char === "ä") return ["ä", "a"];
    if (char === "o") return ["o", "ö"];
    if (char === "ö") return ["ö", "o"];
    return [char];
  });

  let variants = [""];
  for (const choices of alternatives) {
    variants = variants.flatMap((prefix) => choices.map((char) => prefix + char));
    if (variants.length > limit * 2) variants = variants.slice(0, limit * 2);
  }
  return variants.filter((variant) => variant !== chars.join("")).slice(0, limit);
}

export function pickFuzzyCandidate(
  query: string,
  candidates: string[],
  maxDistance = 2,
): string | null {
  const q = query.trim();
  if (!q || candidates.length === 0) return null;

  let best: { word: string; dist: number } | null = null;
  for (const word of candidates) {
    const dist = levenshtein(q, word);
    if (dist > maxDistance) continue;
    if (!best || dist < best.dist) best = { word, dist };
  }
  return best?.word ?? null;
}
