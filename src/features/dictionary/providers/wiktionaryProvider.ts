import type { DictionaryEntry, Pronunciation } from "../../../types/word";
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
          const pronunciations = await this.fetchFinnishPronunciations(variant).catch(() => []);
          if (pronunciations.length > 0) {
            entry.pronunciations = pronunciations;
            const first = pronunciations[0];
            entry.pronunciation = first.ipa?.[0];
            entry.pronunciationSource = first.ipa?.length ? first.source : undefined;
            entry.pronunciationAudioUrl = first.audioUrl;
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

  private async fetchFinnishPronunciations(word: string): Promise<Pronunciation[]> {
    const sectionParams = new URLSearchParams({
      action: "parse",
      prop: "sections",
      page: word,
      format: "json",
      origin: "*",
    });
    const sectionsResponse = await this.fetchPronunciationApi(sectionParams);
    if (!sectionsResponse) return [];
    const sectionsData = await sectionsResponse.json().catch(() => null) as {
      parse?: { sections?: { line?: string; index?: string }[] };
    } | null;
    const finnishSection = sectionsData?.parse?.sections?.find((section) =>
      section.line?.toLocaleLowerCase() === "finnish",
    );
    if (!finnishSection?.index) return [];

    const textParams = new URLSearchParams({
      action: "parse",
      page: word,
      prop: "text",
      section: finnishSection.index,
      format: "json",
      origin: "*",
    });
    const textResponse = await this.fetchPronunciationApi(textParams);
    if (!textResponse) return [];
    const textData = await textResponse.json().catch(() => null) as {
      parse?: { text?: { "*"?: string } };
    } | null;
    const html = textData?.parse?.text?.["*"];
    if (!html) return [];

    const document = new DOMParser().parseFromString(html, "text/html");
    const pronunciationItems = [...document.querySelectorAll("li")].filter((item) =>
      item.querySelector('a[href*="International_Phonetic_Alphabet"]'),
    );
    const syllabification = [...document.querySelectorAll("li")]
      .find((item) => /^(?:Syllabification|Hyphenation)/i.test(item.textContent?.trim() ?? ""))
      ?.querySelector('[lang="fi"]')?.textContent?.trim();

    return pronunciationItems.map((item) => {
      const ipa = [...item.querySelectorAll("span.IPA")]
        .map((node) => node.textContent?.trim())
        .filter((value): value is string => Boolean(value && /^[/\[].+[/\]]$/.test(value)));
      const audio = item.querySelector("audio");
      const sources = [...(audio?.querySelectorAll("source[src]") ?? [])];
      const preferredSource = sources.find((source) =>
        source.getAttribute("type")?.includes("mpeg") || source.getAttribute("src")?.toLowerCase().includes(".mp3"),
      ) ?? sources[0];
      const rawAudioUrl = preferredSource?.getAttribute("src") ?? audio?.getAttribute("src");
      const audioUrl = rawAudioUrl ? new URL(rawAudioUrl, `https://${this.host}`).href : undefined;
      const fileLink = item.querySelector('a[href*="/wiki/File:"]')?.getAttribute("href");
      const sourceUrl = `https://${this.host}/wiki/${encodeURIComponent(word)}#Finnish`;

      return {
        ipa: ipa.length > 0 ? [...new Set(ipa)] : undefined,
        audioUrl,
        audioSource: audioUrl ? "Wikimedia Commons（经 Wiktionary 引用）" : undefined,
        audioSourceUrl: fileLink ? new URL(fileLink, `https://${this.host}`).href : undefined,
        syllabification,
        source: "Wiktionary",
        sourceUrl,
      };
    }).filter((pronunciation) =>
      Boolean(pronunciation.ipa?.length || pronunciation.audioUrl || pronunciation.syllabification),
    );
  }

  private async fetchPronunciationApi(params: URLSearchParams): Promise<Response | undefined> {
    try {
      const response = await fetch(`https://${this.host}/w/api.php?${params}`, {
        signal: AbortSignal.timeout(6_000),
      });
      return response.ok ? response : undefined;
    } catch {
      return undefined;
    }
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
