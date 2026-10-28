import Dexie, { type Table } from "dexie";
import type { Flashcard } from "../types/word";
import { repairStoredDictionaryMeaning } from "../features/dictionary/meaningProcessing.ts";

class MeoiniDatabase extends Dexie {
  flashcards!: Table<Flashcard, string>;

  constructor() {
    super("meoini");

    this.version(1).stores({
      flashcards: "id, word, language, dueAt, createdAt",
    });
  }
}

export const db = new MeoiniDatabase();

export async function saveFlashcard(card: Flashcard) {
  await db.flashcards.put(card);
}

export async function getFlashcards() {
  return repairDictionaryCards(await db.flashcards.orderBy("createdAt").reverse().toArray());
}

export async function recoverExpiredDictionaryLookups(
  now = Date.now(),
  staleAfterMs = 2 * 60 * 1000,
): Promise<number> {
  const stale = await db.flashcards
    .filter((card) => card.lookupStatus === "querying" && (!card.lookupStartedAt || now - card.lookupStartedAt >= staleAfterMs))
    .toArray();
  if (!stale.length) return 0;
  await db.flashcards.bulkPut(stale.map((card) => ({
    ...card,
    lookupStatus: "pending" as const,
    lookupStartedAt: undefined,
    lookupError: "上次查询中断，已恢复为待重试。",
  })));
  return stale.length;
}

export async function getFlashcardById(id: string) {
  return db.flashcards.get(id);
}

export async function getFlashcardByWord(word: string, language: string) {
  const key = normalizeCardWord(word);
  return db.flashcards
    .where("language")
    .equals(language)
    .filter((card) => normalizeCardWord(card.word) === key)
    .first();
}

export async function saveFlashcardIfAbsent(card: Flashcard): Promise<{ card: Flashcard; inserted: boolean }> {
  return db.transaction("rw", db.flashcards, async () => {
    const existing = await getFlashcardByWord(card.word, card.language);
    if (existing) return { card: existing, inserted: false };
    await db.flashcards.add(card);
    return { card, inserted: true };
  });
}

export async function deleteFlashcard(id: string) {
  await db.flashcards.delete(id);
}

export async function countDueFlashcards(now = Date.now()) {
  return db.flashcards.where("dueAt").belowOrEqual(now).count();
}

export async function getDueFlashcards(now = Date.now()) {
  const cards = await db.flashcards
    .where("dueAt")
    .belowOrEqual(now)
    .sortBy("dueAt");
  return repairDictionaryCards(cards);
}

async function repairDictionaryCards(cards: Flashcard[]): Promise<Flashcard[]> {
  const repaired = cards.map(repairStoredDictionaryMeaning);
  const changed = repaired.filter((card, index) => card !== cards[index]);
  if (changed.length) await db.flashcards.bulkPut(changed);
  return repaired;
}

function normalizeCardWord(word: string): string {
  return word.normalize("NFC").toLocaleLowerCase();
}
