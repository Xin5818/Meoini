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
  audio?: string;
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
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new Error(error instanceof DOMException && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK");
    }

    if (response.status === 404) {
      return [];
    }

    if (response.status === 429) {
      throw new Error("RATE_LIMIT");
    }

    if (!response.ok) {
      throw new Error(`PROVIDER_${response.status}`);
    }

    let data: ApiEntry[];
    try {
      data = (await response.json()) as ApiEntry[];
    } catch {
      throw new Error("PROVIDER_INVALID_RESPONSE");
    }
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
          definitionLanguage: "en",
          partOfSpeech: block.partOfSpeech,
        });
        if (def.example) {
          examples.push({ text: def.example });
        }
      }
    }

    const pronunciation =
      entry.phonetics?.find((p) => p.text)?.text ?? undefined;
    const audio = entry.phonetics?.find((p) => p.audio?.startsWith("https://"))?.audio;

    return {
      word: entry.word,
      language,
      meanings,
      examples: examples.length ? examples : undefined,
      pronunciation,
      pronunciationAudioUrl: audio,
      source: "Free Dictionary API",
      sourceUrl: entry.sourceUrls?.[0] ?? "https://dictionaryapi.dev/",
    };
  }
}
