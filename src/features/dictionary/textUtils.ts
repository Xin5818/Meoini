export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/** Pull lemma from Wiktionary form-of lines, e.g. "partitive singular of suomi". */
export function extractLemmaFromGloss(gloss: string): string | null {
  const patterns = [
    /\b(?:inflection|partitive|genitive|inessive|elative|illative|ablative|allative|translative|nominative|accusative|singular|plural)\s+of\s+([\p{L}][\p{L}-]*)/iu,
    /\bform of\s+([\p{L}][\p{L}-]*)/iu,
  ];
  for (const re of patterns) {
    const m = gloss.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
