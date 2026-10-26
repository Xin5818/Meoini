import type { Flashcard, ReviewRating } from "../../types/word";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Simple spaced repetition for v1; swap implementation later without touching UI. */
export function applyReview(
  card: Flashcard,
  rating: ReviewRating,
  now = Date.now(),
): Flashcard {
  switch (rating) {
    case "again":
      return {
        ...card,
        dueAt: now + 4 * HOUR,
        intervalDays: 0,
        repetitions: 0,
      };
    case "hard": {
      const intervalDays = Math.max(1, Math.floor(card.intervalDays * 0.5) || 1);
      return {
        ...card,
        intervalDays,
        dueAt: now + intervalDays * DAY,
        repetitions: card.repetitions + 1,
      };
    }
    case "good": {
      const intervalDays =
        card.intervalDays === 0
          ? 1
          : Math.min(365, Math.floor(card.intervalDays * 2) + 1);
      return {
        ...card,
        intervalDays,
        dueAt: now + intervalDays * DAY,
        repetitions: card.repetitions + 1,
      };
    }
  }
}

export function createFlashcard(input: {
  word: string;
  language: string;
  meaning: string;
  example?: string;
  tags?: string[];
}): Flashcard {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    word: input.word.trim(),
    language: input.language,
    meaning: input.meaning.trim(),
    example: input.example?.trim() || undefined,
    tags: input.tags ?? [],
    createdAt: now,
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
  };
}
