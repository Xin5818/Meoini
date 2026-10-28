export interface PronunciationSourceView {
  source?: string;
  sourceUrl?: string;
}

/** Deduplicate source labels before rendering and preserve the first useful link. */
export function getUniqueIpaSources(sources: PronunciationSourceView[]): PronunciationSourceView[] {
  const unique = new Map<string, PronunciationSourceView>();
  for (const item of sources) {
    const source = item.source?.replace(/^\s*IPA\s*来源\s*[:：]\s*/i, "").trim();
    if (!source) continue;
    const key = source.normalize("NFC").toLocaleLowerCase();
    const previous = unique.get(key);
    if (!previous || (!previous.sourceUrl && item.sourceUrl)) unique.set(key, { source, sourceUrl: item.sourceUrl });
  }
  return [...unique.values()];
}

export function shouldShowPronunciationPlaybackMessage(status: string | undefined): boolean {
  return Boolean(status && status !== "finished");
}
