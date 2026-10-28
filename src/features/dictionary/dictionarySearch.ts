import type { DictionaryEntry } from "../../types/word";
import { diacriticVariants, normalizeWord, pickFuzzyCandidate } from "./fuzzy";
import {
  searchDictionaryExact,
  suggestDictionaryWords,
} from "./dictionaryService";
import type { DictionaryProviderError } from "./dictionaryService";
import { collectLemmaHints } from "./providers/wiktionaryProvider";
import { createRequestSignal, mapRequestError } from "./request.ts";

export interface DictionarySuggestion {
  word: string;
  hint?: string;
}

export type DictionarySearchResult =
  | {
      status: "ok";
      entries: DictionaryEntry[];
      matchKind: "exact" | "lemma" | "fuzzy" | "diacritic" | "suggestion";
      queryUsed: string;
      relatedWords?: string[];
    }
  | {
      status: "not_found";
      query: string;
      suggestions: DictionarySuggestion[];
    }
  | {
      status: "error";
      query: string;
      message: string;
      errorKind: DictionaryProviderError;
    };

export async function searchDictionarySmart(
  query: string,
  language: string,
  parentSignal?: AbortSignal,
): Promise<DictionarySearchResult> {
  const signal = createRequestSignal(parentSignal, 30_000);
  const trimmed = normalizeWord(query);
  if (!trimmed) {
    return { status: "not_found", query: "", suggestions: [] };
  }

  try {
    const exact = await searchDictionaryExact(trimmed, language, signal);
    if (exact.length > 0) {
      const { entries, relatedWords } = await attachLemmaEntries(exact, language, signal);
      return {
        status: "ok",
        entries,
        matchKind: "exact",
        queryUsed: trimmed,
        relatedWords,
      };
    }

    // Keep exact spelling first. Only try diacritic substitutions after the exact lookup misses.
    for (const variant of diacriticVariants(trimmed)) {
      const entries = await searchDictionaryExact(variant, language, signal);
      if (entries.length === 0) continue;
      const related = await attachLemmaEntries(entries, language, signal);
      return {
        status: "ok",
        entries: related.entries,
        matchKind: "diacritic",
        queryUsed: variant,
        relatedWords: related.relatedWords,
      };
    }

    const candidateLists = await Promise.all(
      [trimmed, ...diacriticVariants(trimmed)].map((q) =>
        suggestDictionaryWords(q, language, 12, signal),
      ),
    );
    const prefixList = [...new Set(candidateLists.flat())];
    const exactFromList = prefixList.find((w) => normalizeWord(w).toLocaleLowerCase() === trimmed.toLocaleLowerCase());
    if (exactFromList) {
      const entries = await searchDictionaryExact(exactFromList, language, signal);
      if (entries.length > 0) {
        return {
          status: "ok",
          entries: (await attachLemmaEntries(entries, language, signal)).entries,
          matchKind: "exact",
          queryUsed: exactFromList,
        };
      }
    }

    const fuzzyWord = pickFuzzyCandidate(trimmed, prefixList);
    if (fuzzyWord) {
      const entries = await searchDictionaryExact(fuzzyWord, language, signal);
      if (entries.length > 0) {
        return {
          status: "ok",
          entries: (await attachLemmaEntries(entries, language, signal)).entries,
          matchKind: "fuzzy",
          queryUsed: fuzzyWord,
        };
      }
    }

    const suggestions = prefixList.slice(0, 8).map((word) => ({ word }));
    return { status: "not_found", query: trimmed, suggestions };
  } catch (err) {
    const normalizedError = signal.aborted ? mapRequestError(err, signal) : err;
    return {
      status: "error",
      query: trimmed,
      message: mapErrorMessage(normalizedError),
      errorKind: classifyError(normalizedError),
    };
  }
}

export async function enrichSuggestionsWithHints(
  suggestions: DictionarySuggestion[],
  language: string,
  limit = 5,
): Promise<DictionarySuggestion[]> {
  const { getBriefGloss } = await import("./dictionaryService");
  const slice = suggestions.slice(0, limit);
  const hints = await Promise.all(
    slice.map(async (s) => {
      try {
        const hint = await getBriefGloss(s.word, language);
        return hint ? { ...s, hint } : s;
      } catch {
        return s;
      }
    }),
  );
  return [...hints, ...suggestions.slice(limit)];
}

async function attachLemmaEntries(
  entries: DictionaryEntry[],
  language: string,
  signal?: AbortSignal,
): Promise<{ entries: DictionaryEntry[]; relatedWords: string[] }> {
  const lemmas = new Set<string>();
  for (const entry of entries) {
    for (const lemma of collectLemmaHints(entry)) {
      lemmas.add(lemma);
    }
  }

  const extra: DictionaryEntry[] = [];
  for (const lemma of lemmas) {
    try {
      const found = await searchDictionaryExact(lemma, language, signal);
      if (found.length > 0) {
        extra.push({
          ...found[0],
          meanings: found[0].meanings.map((m) => ({
            ...m,
            text: `[原形 ${lemma}] ${m.text}`,
          })),
        });
      }
    } catch {
      if (signal?.aborted) throw new Error("ABORTED");
      /* ignore lemma lookup failures */
    }
  }

  return {
    entries: [...entries, ...extra],
    relatedWords: extra.map((entry) => entry.word),
  };
}

function classifyError(err: unknown): DictionaryProviderError {
  if (err instanceof Error) {
    if (err.message === "NETWORK") return "network";
    if (err.message === "TIMEOUT") return "timeout";
    if (err.message === "RATE_LIMIT") return "rate_limit";
    if (err.message.startsWith("UNSUPPORTED")) return "unsupported_language";
  }
  return "provider";
}

function mapErrorMessage(err: unknown): string {
  const kind = classifyError(err);
  switch (kind) {
    case "network":
      return "网络异常，无法连接词典服务。请检查网络后重试。";
    case "timeout":
      return "词典请求超时，请检查网络后重试。";
    case "rate_limit":
      return "词典服务请求过于频繁，请稍后再试。";
    case "unsupported_language":
      return err instanceof Error ? err.message : "暂不支持该语言。";
    default:
      return "词典服务暂时不可用，请稍后重试。";
  }
}
