import type { DictionaryEntry, Flashcard } from "../../types/word";
import { applyDictionaryEntryToFlashcard } from "../dictionary/meaningProcessing.ts";

export const DICTIONARY_LOOKUP_TIMEOUT_MS = 45_000;

export async function lookupAndPersistFlashcard(
  id: string,
  storage: {
    get: (id: string) => Promise<Flashcard | undefined>;
    lookup: (card: Flashcard, signal?: AbortSignal) => Promise<DictionaryEntry | undefined>;
    put: (card: Flashcard) => Promise<unknown>;
  },
  timeoutMs = DICTIONARY_LOOKUP_TIMEOUT_MS,
): Promise<"found" | "not_found" | "error"> {
  let card: Flashcard | undefined;
  try {
    card = await withTimeout(storage.get(id), timeoutMs);
  } catch {
    return "error";
  }
  if (!card) return "error";
  try {
    const startedAt = Date.now();
    await withTimeout(storage.put({ ...card, lookupStatus: "querying", lookupStartedAt: startedAt, lookupError: undefined }), timeoutMs);
    const controller = new AbortController();
    const entry = await withTimeout(storage.lookup(card, controller.signal), timeoutMs, () => {
      controller.abort(new DOMException("Dictionary lookup timed out", "TimeoutError"));
    });
    const updated = applyDictionaryEntryToFlashcard(card, entry);
    updated.lookupCompletedAt = Date.now();
    updated.lookupStartedAt = undefined;
    updated.lookupError = undefined;
    await withTimeout(storage.put(updated), timeoutMs);
    return updated.lookupStatus === "found" ? "found" : "not_found";
  } catch (error) {
    try {
      await withTimeout(storage.put({
        ...card,
        lookupStatus: "error",
        lookupStartedAt: undefined,
        lookupCompletedAt: Date.now(),
        lookupError: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      }), timeoutMs);
    } catch {
      // The task returns an error even when the local database itself is unavailable.
    }
    return "error";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("LOOKUP_TIMEOUT"));
    }, timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
