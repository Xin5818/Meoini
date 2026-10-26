import Dexie, { type Table } from "dexie";
import type { Flashcard } from "../types/word";

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
  return db.flashcards.orderBy("createdAt").reverse().toArray();
}

export async function getFlashcardById(id: string) {
  return db.flashcards.get(id);
}

export async function deleteFlashcard(id: string) {
  await db.flashcards.delete(id);
}

export async function countDueFlashcards(now = Date.now()) {
  return db.flashcards.where("dueAt").belowOrEqual(now).count();
}

export async function getDueFlashcards(now = Date.now()) {
  return db.flashcards
    .where("dueAt")
    .belowOrEqual(now)
    .sortBy("dueAt");
}
