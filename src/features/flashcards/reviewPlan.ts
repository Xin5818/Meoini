import type { Flashcard } from "../../types/word";

export interface ReviewPlanStats {
  dueToday: number;
  completedToday: number;
  notDue: number;
  newCards: number;
  earlyAvailable: number;
}

export interface EarlyReviewDiagnostic {
  id: string;
  word: string;
  dueAt: number;
  repetitions: number;
  lastReviewedAt?: number;
  lastReviewMode?: Flashcard["lastReviewMode"];
  eligible: boolean;
  reason: string;
}

export function getReviewPlanStats(cards: Flashcard[], now = Date.now()): ReviewPlanStats {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);
  const start = dayStart.getTime();
  const end = nextDay.getTime();
  const eligibleEarly = getEarlyReviewCards(cards, now);

  return {
    dueToday: cards.filter((card) => card.dueAt <= now).length,
    completedToday: cards.filter((card) => card.lastReviewedAt !== undefined && card.lastReviewedAt >= start && card.lastReviewedAt < end).length,
    notDue: cards.filter((card) => card.dueAt > now).length,
    newCards: cards.filter(isUnreviewedNewCard).length,
    earlyAvailable: eligibleEarly.length,
  };
}

/** New cards come first, then future-due cards in the order they are scheduled. */
export function getEarlyReviewCards(cards: Flashcard[], now = Date.now()): Flashcard[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return getEarlyReviewDiagnostics(cards, now)
    .filter((item) => item.eligible)
    .map((item) => cardsById.get(item.id)!)
    .sort((a, b) => {
      const aIsNew = isUnreviewedNewCard(a);
      const bIsNew = isUnreviewedNewCard(b);
      if (aIsNew !== bIsNew) return aIsNew ? -1 : 1;
      return a.dueAt - b.dueAt || a.createdAt - b.createdAt;
    });
}

/** Reports the exact rule used for each saved card to explain early-review selection. */
export function getEarlyReviewDiagnostics(cards: Flashcard[], now = Date.now()): EarlyReviewDiagnostic[] {
  return cards.map((card) => {
    const isNew = isUnreviewedNewCard(card);
    const isFutureDue = card.dueAt > now;
    return {
      id: card.id,
      word: card.word,
      dueAt: card.dueAt,
      repetitions: card.repetitions,
      lastReviewedAt: card.lastReviewedAt,
      lastReviewMode: card.lastReviewMode,
      eligible: isNew || isFutureDue,
      reason: isNew
        ? "候选：尚未进入正式间隔复习"
        : isFutureDue
          ? "候选：尚未到期"
          : "排除：已经到期且不是待首次正式复习的新卡，应进入今日复习",
    };
  });
}

export function limitEarlyReviewCards(cards: Flashcard[], limit: number | "all"): Flashcard[] {
  return limit === "all" ? cards : cards.slice(0, Math.max(0, limit));
}

/** Free practice records only its own timestamp/count and leaves SRS fields intact. */
export function applyEarlyPractice(card: Flashcard, now = Date.now()): Flashcard {
  return {
    ...card,
    lastReviewedAt: now,
    lastReviewMode: "early",
    earlyReviewCount: (card.earlyReviewCount ?? 0) + 1,
  };
}

export function isUnreviewedNewCard(card: Flashcard): boolean {
  // Free practice records lastReviewedAt, but does not start the SRS schedule.
  // Keep such cards eligible until a scheduled review actually changes them.
  return card.repetitions === 0 && (
    card.lastReviewMode === "early" || card.lastReviewedAt === undefined
  );
}
