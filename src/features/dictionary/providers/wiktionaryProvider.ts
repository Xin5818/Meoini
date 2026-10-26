import type { DictionaryEntry } from "../../../types/word";
import type { DictionaryProvider } from "../dictionaryService";
import { extractLemmaFromGloss, stripHtml, truncate } from "../textUtils";
import { normalizeWord } from "../fuzzy";

type RestDefBlock = {
  partOfSpeech?: string;
  language?: string;
  definitions?: {
    definition?: string;
    examples?: string[];
    parsedExamples?: { example?: string; translation?: string }[];
  }[];
};

type RestPayload = Record<string, RestDefBlock[]>;

const WIKI_LANG_NAME: Record<string, string> = {
  en: "English",
  fi: "Finnish",
};

const glossCache = new Map<string, string>();

export class WiktionaryProvider implements DictionaryProvider {
  private readonly host: string;

  constructor(host = "en.wiktionary.org") {
    this.host = host;
  }

  async search(word: string, language: string): Promise<DictionaryEntry[]> {
    const query = normalizeWord(word);
    if (!query) return [];

    const variants = uniqueQueries(query);
    for (const variant of variants) {
      const entry = await this.fetchEntry(variant, language);
      if (entry && entry.meanings.length > 0) {
        if (language === "fi") {
          const pronunciation = await this.fetchFinnishIpa(variant).catch(() => undefined);
          if (pronunciation) {
            entry.pronunciation = pronunciation;
            entry.pronunciationSource = "Wiktionary (Finnish IPA entry)";
          }
        }
        return [entry];
      }
    }
    return [];
  }

  async briefGloss(word: string, language: string): Promise<string | undefined> {
    const key = `${language}:${word.toLowerCase()}`;
    const cached = glossCache.get(key);
    if (cached) return cached;

    const entries = await this.search(word, language);
    const gloss = entries[0]?.meanings[0]?.text;
    if (!gloss) return undefined;
    const short = truncate(gloss, 72);
    glossCache.set(key, short);
    return short;
  }

  private async fetchEntry(
    word: string,
    language: string,
  ): Promise<DictionaryEntry | null> {
    const url = `https://${this.host}/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new Error(error instanceof DOMException && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK");
    }

    if (response.status === 404) return null;
    if (response.status === 429) throw new Error("RATE_LIMIT");
    if (!response.ok) throw new Error(`PROVIDER_${response.status}`);

    let data: RestPayload;
    try {
      data = (await response.json()) as RestPayload;
    } catch {
      throw new Error("PROVIDER_INVALID_RESPONSE");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("PROVIDER_INVALID_RESPONSE");
    }
    return this.parsePayload(word, language, data);
  }

  private async fetchFinnishIpa(word: string): Promise<string | undefined> {
    const params = new URLSearchParams({
      action: "query",
      titles: word,
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      format: "json",
      origin: "*",
    });
    let response: Response;
    try {
      response = await fetch(`https://${this.host}/w/api.php?${params}`, {
        signal: AbortSignal.timeout(6_000),
      });
    } catch {
      return undefined;
    }
    if (!response.ok) return undefined;

    const payload = (await response.json().catch(() => null)) as {
      query?: {
        pages?: Record<string, {
          revisions?: { slots?: { main?: { content?: string; "*"?: string } } }[];
        }>;
      };
    } | null;
    const wikitext = Object.values(payload?.query?.pages ?? {})[0]?.revisions?.[0]?.slots?.main;
    const source = wikitext?.content ?? wikitext?.["*"];
    if (!source) return undefined;

    // Only accept IPA templates explicitly tagged Finnish (fi); other language
    // sections on the same Wiktionary page are not valid Finnish pronunciations.
    const matches = [...source.matchAll(/\{\{\s*IPA\s*\|\s*fi\s*\|\s*([^|{}]+)(?:\||\}\})/gi)];
    const ipa = matches.map((match) => match[1].trim()).find((value) => /[\p{L}ʋæøɲŋɡˈˌː]/u.test(value));
    return ipa;
  }

  private parsePayload(
    word: string,
    language: string,
    data: RestPayload,
  ): DictionaryEntry | null {
    const wikiLang = WIKI_LANG_NAME[language] ?? language;
    // The REST API groups definitions by the definition language code (en, fi, ...).
    // Falling back to every block can return Finnish meanings during an English search.
    const allBlocks = data[language] ?? [];

    const meanings: DictionaryEntry["meanings"] = [];
    const examples: DictionaryEntry["examples"] = [];

    for (const block of allBlocks) {
      if (block.language && block.language !== wikiLang) {
        continue;
      }
      for (const def of block.definitions ?? []) {
        if (!def.definition) continue;
        const text = stripHtml(def.definition);
        if (!text) continue;
        meanings.push({
          text,
          language,
          definitionLanguage: "en",
          partOfSpeech: block.partOfSpeech,
        });
        for (const ex of def.parsedExamples ?? []) {
          if (ex.example) {
            examples.push({
              text: stripHtml(ex.example),
              translation: ex.translation
                ? stripHtml(ex.translation)
                : undefined,
              translationLanguage: ex.translation ? "en" : undefined,
            });
          }
        }
        for (const raw of def.examples ?? []) {
          examples.push({ text: stripHtml(raw) });
        }
      }
    }

    if (meanings.length === 0) return null;

    return {
      word,
      language,
      meanings,
      examples: examples.length ? dedupeExamples(examples) : undefined,
      source: "Wiktionary",
      sourceUrl: `https://${this.host}/wiki/${encodeURIComponent(word)}`,
    };
  }
}

export async function wiktionaryOpenSearch(
  prefix: string,
  host = "en.wiktionary.org",
  limit = 10,
): Promise<string[]> {
  const q = prefix.trim();
  if (q.length < 3) return [];

  const url =
    `https://${host}/w/api.php?action=opensearch&search=${encodeURIComponent(q)}` +
    `&limit=${limit}&format=json&origin=*`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK");
  }

  if (!response.ok) throw new Error(`PROVIDER_${response.status}`);

  let data: [string, string[], string[], string[]];
  try {
    data = (await response.json()) as [string, string[], string[], string[]];
  } catch {
    throw new Error("PROVIDER_INVALID_RESPONSE");
  }
  if (!Array.isArray(data) || !Array.isArray(data[1])) {
    throw new Error("PROVIDER_INVALID_RESPONSE");
  }
  return data[1].filter((word) => word.toLocaleLowerCase().startsWith(q.toLocaleLowerCase())).slice(0, limit);
}

export function collectLemmaHints(entry: DictionaryEntry): string[] {
  const lemmas = new Set<string>();
  for (const m of entry.meanings) {
    const lemma = extractLemmaFromGloss(m.text);
    if (lemma && lemma.toLowerCase() !== entry.word.toLowerCase()) {
      lemmas.add(lemma);
    }
  }
  return [...lemmas];
}

function uniqueQueries(word: string): string[] {
  const base = word.trim();
  const lower = base.toLowerCase();
  const titled = lower.charAt(0).toUpperCase() + lower.slice(1);
  return [...new Set([base, lower, titled])];
}

function dedupeExamples(examples: DictionaryEntry["examples"]): DictionaryEntry["examples"] {
  const seen = new Set<string>();
  const out: NonNullable<DictionaryEntry["examples"]> = [];
  for (const ex of examples ?? []) {
    if (seen.has(ex.text)) continue;
    seen.add(ex.text);
    out.push(ex);
  }
  return out;
}
