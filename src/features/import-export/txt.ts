import { db } from "../../db/database";
import type { Flashcard } from "../../types/word";
import { createFlashcard } from "../flashcards/review";
import { searchDictionaryExact } from "../dictionary/dictionaryService";
import { lookupAndPersistFlashcard } from "./lookupFlashcard";
export { parseWordList, parseWordListDetailed } from "./wordListParser";

export async function getExistingWordKeys(language: string): Promise<Set<string>> {
  const cards = await db.flashcards.where("language").equals(language).toArray();
  return new Set(cards.map((card) => card.word.normalize("NFC").toLocaleLowerCase()));
}

export async function importWordsAsFlashcards(
  words: string[],
  language: string,
): Promise<{ imported: number; existing: number; cards: Flashcard[] }> {
  return db.transaction("rw", db.flashcards, async () => {
    const cards = await db.flashcards.where("language").equals(language).toArray();
    const seen = new Set(cards.map((card) => card.word.normalize("NFC").toLocaleLowerCase()));
    const additions: Flashcard[] = [];
    let existing = 0;
    for (const word of words) {
      const key = word.normalize("NFC").toLocaleLowerCase();
      if (seen.has(key)) {
        existing++;
        continue;
      }
      seen.add(key);
      additions.push({ ...createFlashcard({ word, language, meaning: "" }), lookupStatus: "pending" });
    }
    if (additions.length) await db.flashcards.bulkAdd(additions);
    return { imported: additions.length, existing, cards: additions };
  });
}

export async function lookupAndUpdateFlashcard(id: string): Promise<"found" | "not_found" | "error"> {
  return lookupAndPersistFlashcard(id, {
    get: (cardId) => db.flashcards.get(cardId),
    lookup: async (card, signal) => (await searchDictionaryExact(card.word, card.language, signal))[0],
    put: (card) => db.flashcards.put(card),
  });
}
