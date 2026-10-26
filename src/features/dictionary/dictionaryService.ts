import type { DictionaryEntry } from "../../types/word";
import { FreeDictionaryApiProvider } from "./providers/freeDictionaryApiProvider";

export interface DictionaryProvider {
  search(word: string, language: string): Promise<DictionaryEntry[]>;
}

const providers: Record<string, DictionaryProvider> = {
  en: new FreeDictionaryApiProvider(),
};

export function getSupportedDictionaryLanguages() {
  return Object.keys(providers);
}

export async function searchDictionary(
  word: string,
  language: string,
): Promise<DictionaryEntry[]> {
  const provider = providers[language];
  if (!provider) {
    throw new Error(`暂不支持该语言的在线词典：${language}`);
  }
  return provider.search(word, language);
}
