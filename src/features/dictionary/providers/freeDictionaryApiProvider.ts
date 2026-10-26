import type { DictionaryEntry } from "../../../types/word";
import type { DictionaryProvider } from "../dictionaryService";

interface ApiMeaning {
  partOfSpeech?: string;
  definitions?: {
    definition?: string;
    example?: string;
  }[];
}

interface ApiPhonetic {
  text?: string;
}

interface ApiEntry {
  word: string;
  phonetics?: ApiPhonetic[];
  meanings?: ApiMeaning[];
  sourceUrls?: string[];
}

export class FreeDictionaryApiProvider implements DictionaryProvider {
  async search(word: string, language: string): Promise<DictionaryEntry[]> {
    if (language !== "en") {
      throw new Error("Free Dictionary API 当前仅支持英语 (en)");
    }

    const query = word.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`;
    const response = await fetch(url);

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`词典请求失败 (${response.status})`);
    }

    const data = (await response.json()) as ApiEntry[];
    return data.map((entry) => this.toDictionaryEntry(entry, language));
  }

  private toDictionaryEntry(entry: ApiEntry, language: string): DictionaryEntry {
    const meanings: DictionaryEntry["meanings"] = [];
    const examples: DictionaryEntry["examples"] = [];

    for (const block of entry.meanings ?? []) {
      for (const def of block.definitions ?? []) {
        if (!def.definition) continue;
        meanings.push({
          text: def.definition,
          language: "en",
          partOfSpeech: block.partOfSpeech,
        });
        if (def.example) {
          examples.push({ text: def.example });
        }
      }
    }

    const pronunciation =
      entry.phonetics?.find((p) => p.text)?.text ?? undefined;

    return {
      word: entry.word,
      language,
      meanings,
      examples: examples.length ? examples : undefined,
      pronunciation,
      source: "Free Dictionary API",
      sourceUrl: entry.sourceUrls?.[0] ?? "https://dictionaryapi.dev/",
    };
  }
}
