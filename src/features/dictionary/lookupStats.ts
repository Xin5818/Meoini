import type { Flashcard } from "../../types/word";

export interface DictionaryLookupStats {
  total: number;
  pending: number;
  querying: number;
  found: number;
  notFound: number;
  failed: number;
}

export function getDictionaryLookupStats(cards: Flashcard[]): DictionaryLookupStats {
  return groupLookupCards(cards).reduce<DictionaryLookupStats>((stats, group) => {
    stats.total++;
    switch (group.status) {
      case "pending": stats.pending++; break;
      case "querying": stats.querying++; break;
      case "found": stats.found++; break;
      case "not_found": stats.notFound++; break;
      case "error": stats.failed++; break;
    }
    return stats;
  }, { total: 0, pending: 0, querying: 0, found: 0, notFound: 0, failed: 0 });
}

export function countFallbackFound(cards: Flashcard[]): number {
  return groupLookupCards(cards).filter((group) =>
    group.status === "found" && group.cards.some((card) => card.dictionaryEntry?.lookupDiagnostics?.fallbackUsed),
  ).length;
}

export function getLookupCardsByStatus(
  cards: Flashcard[],
  status: "pending" | "querying" | "found" | "not_found" | "error",
): Flashcard[] {
  return groupLookupCards(cards)
    .filter((group) => group.status === status)
    .map((group) => group.cards.find((card) => card.lookupStatus === status) ?? group.cards[0]);
}

export function getDictionaryLookupPercent(stats: DictionaryLookupStats): number {
  if (stats.total === 0) return 0;
  return Math.round(((stats.found + stats.notFound + stats.failed) / stats.total) * 100);
}

function groupLookupCards(cards: Flashcard[]): { status: "pending" | "querying" | "found" | "not_found" | "error"; cards: Flashcard[] }[] {
  const groups = new Map<string, Flashcard[]>();
  for (const card of cards) {
    if (!card.lookupStatus && !card.dictionaryEntry) continue;
    const key = `${card.language}:${card.word.normalize("NFC").toLocaleLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(card);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const statuses = new Set(group.map((card) => card.lookupStatus ?? (card.dictionaryEntry ? "found" : "pending")));
    const status = statuses.has("found") ? "found"
      : statuses.has("querying") ? "querying"
        : statuses.has("pending") ? "pending"
          : statuses.has("error") ? "error"
            : "not_found";
    return { status, cards: group };
  });
}
