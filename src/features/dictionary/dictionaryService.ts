import type { DictionaryEntry } from "../../types/word";
import { FreeDictionaryApiProvider } from "./providers/freeDictionaryApiProvider";
import {
  WiktionaryProvider,
  wiktionaryOpenSearch,
} from "./providers/wiktionaryProvider";

export interface DictionaryProvider {
  search(word: string, language: string): Promise<DictionaryEntry[]>;
}

export type DictionaryProviderError =
  | "network"
  | "timeout"
  | "rate_limit"
  | "unsupported_language"
  | "provider";

const freeDictionary = new FreeDictionaryApiProvider();
const wiktionary = new WiktionaryProvider();

const LANGUAGE_META: Record<
  string,
  { label: string; suggestHost: string; chain: DictionaryProvider[] }
> = {
  en: {
    label: "English",
    suggestHost: "en.wiktionary.org",
    chain: [freeDictionary, wiktionary],
  },
  fi: {
    label: "Finnish",
    suggestHost: "en.wiktionary.org",
    chain: [wiktionary],
  },
};

export function getSupportedDictionaryLanguages() {
  return Object.keys(LANGUAGE_META);
}

export function getLanguageLabel(code: string) {
  return LANGUAGE_META[code]?.label ?? code;
}

function assertLanguage(language: string) {
  if (!LANGUAGE_META[language]) {
    throw new Error(`UNSUPPORTED:暂不支持该语言的在线词典：${language}`);
  }
}

/** Exact lookup only — used by search orchestration. */
export async function searchDictionaryExact(
  word: string,
  language: string,
): Promise<DictionaryEntry[]> {
  assertLanguage(language);
  const { chain } = LANGUAGE_META[language];
  let lastError: unknown;

  for (const provider of chain) {
    try {
      const entries = await provider.search(word, language);
      if (entries.length > 0) return entries;
    } catch (err) {
      lastError = err;
      if (err instanceof Error && ["NETWORK", "TIMEOUT", "RATE_LIMIT"].includes(err.message)) throw err;
    }
  }

  if (lastError instanceof Error && lastError.message.startsWith("PROVIDER")) {
    throw lastError;
  }
  return [];
}

/** @deprecated Use searchDictionarySmart from dictionarySearch.ts */
export async function searchDictionary(
  word: string,
  language: string,
): Promise<DictionaryEntry[]> {
  return searchDictionaryExact(word, language);
}

export async function suggestDictionaryWords(
  prefix: string,
  language: string,
  limit = 10,
): Promise<string[]> {
  assertLanguage(language);
  const host = LANGUAGE_META[language].suggestHost;
  return wiktionaryOpenSearch(prefix, host, limit);
}

export async function getBriefGloss(
  word: string,
  language: string,
): Promise<string | undefined> {
  assertLanguage(language);
  return wiktionary.briefGloss(word, language);
}
