export interface ParsedWordList {
  words: string[];
  duplicateCount: number;
  invalidLines: string[];
}

export function parseWordListDetailed(text: string): ParsedWordList {
  const words: string[] = [];
  const seen = new Set<string>();
  const invalidLines: string[] = [];
  let duplicateCount = 0;

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || /^\|?[\s:|-]+\|?$/.test(line)) continue;
    const withoutOuterPipes = line.replace(/^\|+|\|+$/g, "");
    const cell = withoutOuterPipes.split("|")[0] ?? "";
    const cleaned = cell.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s*)/, "").trim();
    if (!cleaned) continue;
    if (/^(word|words|单词|词汇)$/i.test(cleaned)) continue;

    const parts = cleaned.split(/[,;，；]/).map((part) =>
      part.trim().replace(/^(["'“”‘’])(.*)\1$/, "$2").normalize("NFC"),
    );
    let foundValid = false;
    for (const word of parts) {
      if (!word) continue;
      if (!/^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u.test(word)) continue;
      foundValid = true;
      const key = word.toLocaleLowerCase();
      if (seen.has(key)) duplicateCount++;
      else {
        seen.add(key);
        words.push(word);
      }
    }
    if (!foundValid) invalidLines.push(rawLine);
  }
  return { words, duplicateCount, invalidLines };
}

export function parseWordList(text: string): string[] {
  return parseWordListDetailed(text).words;
}
