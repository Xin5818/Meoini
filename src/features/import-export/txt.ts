import { db } from "../../db/database";
import type { Flashcard } from "../../types/word";
import { createFlashcard } from "../flashcards/review";
import { searchDictionaryExact } from "../dictionary/dictionaryService";

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
    if (!foundValid) {
      invalidLines.push(rawLine);
    }
  }
  return { words, duplicateCount, invalidLines };
}

export function parseWordList(text: string): string[] {
  return parseWordListDetailed(text).words;
}

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
  const card = await db.flashcards.get(id);
  if (!card) return "error";
  try {
    const entries = await searchDictionaryExact(card.word, card.language);
    const entry = entries[0];
    if (!entry || entry.meanings.length === 0) {
      await db.flashcards.put({ ...card, meaning: "", partOfSpeech: undefined, example: undefined, dictionaryEntry: undefined, lookupStatus: "not_found" });
      return "not_found";
    }
    const updated: Flashcard = {
      ...card,
      meaning: entry.meanings.map((meaning) => meaning.text).join("；"),
      partOfSpeech: [...new Set(entry.meanings.map((meaning) => meaning.partOfSpeech).filter(Boolean))].join("、") || undefined,
      example: entry.examples?.[0]?.text,
      dictionaryEntry: entry,
      lookupStatus: "found",
    };
    await db.flashcards.put(updated);
    return "found";
  } catch {
    await db.flashcards.put({ ...card, lookupStatus: "error" });
    return "error";
  }
}
