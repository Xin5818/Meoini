import type { DictionaryEntry, Pronunciation } from "../../../types/word";
import type { DictionaryProvider } from "../dictionaryService";
import { extractLemmaFromGloss, truncate } from "../textUtils.ts";
import { normalizeWord } from "../fuzzy.ts";
import { cleanDictionaryMeaning } from "../meaningProcessing.ts";
import { parseDictionaryExample, parseFinnishFormRelation } from "../exampleProcessing.ts";
import { createRequestSignal, mapRequestError } from "../request.ts";

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

const FINNISH_LANGUAGE_LABELS = new Set(["finnish", "suomi", "fi"]);
const FINNISH_LANGUAGE_KEYS = new Set(["fi", "finnish", "suomi"]);

const WIKI_LANG_NAME: Record<string, string> = {
  en: "English",
  fi: "Finnish",
};

const glossCache = new Map<string, string>();
const formRelationCache = new Map<string, Promise<{ formOf: string; grammaticalForm: string } | undefined>>();

export class WiktionaryProvider implements DictionaryProvider {
  private readonly host: string;

  constructor(host = "en.wiktionary.org") {
    this.host = host;
  }

  async search(word: string, language: string, signal?: AbortSignal): Promise<DictionaryEntry[]> {
    const query = normalizeWord(word);
    if (!query) return [];

    const variants = uniqueQueries(query);
    const attempts: NonNullable<DictionaryEntry["lookupDiagnostics"]>["attempts"] = [];
    const foundEntries: DictionaryEntry[] = [];
    let firstError: unknown;
    for (const variant of variants) {
      try {
        const entry = await this.fetchEntry(variant, language, signal);
        const diagnostic = entry?.lookupDiagnostics;
        attempts.push(...(diagnostic?.attempts ?? [{ query: variant, languageKey: "fi", languageLabel: "Finnish", status: "empty" as const }]));
        if (entry && hasUsableEntryContent(entry)) {
          foundEntries.push(entry);
          break; // Exact spelling wins; casing aliases are queried only when it misses.
        }
      } catch (error) {
        if (signal?.aborted) throw mapRequestError(error, signal);
        firstError ??= error;
        attempts.push({ query: variant, status: "failed", reason: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
      }
    }
    if (!foundEntries.length) {
      // An empty result is definitive only when every spelling attempt completed successfully.
      console.debug("[Meoini dictionary lookup]", { source: "Wiktionary", word: query, language, attempts, result: firstError ? "failed" : "empty", reason: firstError instanceof Error ? firstError.message : undefined });
      if (firstError) throw firstError;
      return [];
    }

    const merged = mergeFinnishEntries(query, foundEntries, attempts);
    if (language === "fi") {
      await this.enrichFinnishLemma(merged, attempts, signal);
      await this.enrichFinnishExampleForms(merged, signal);
      const pronunciations = await this.fetchFinnishPronunciations(query, signal).catch((error) => {
        if (signal?.aborted) throw error;
        return [];
      });
      if (signal?.aborted) throw mapRequestError(signal.reason, signal);
      if (pronunciations.length > 0) {
        merged.pronunciations = pronunciations;
        const first = pronunciations[0];
        merged.pronunciation = first.ipa?.[0];
        merged.pronunciationSource = first.ipa?.length ? first.source : undefined;
        merged.pronunciationAudioUrl = first.audioUrl;
      }
    }
    console.debug("[Meoini dictionary lookup]", { source: "Wiktionary", word: query, language, attempts, result: "found", entryKind: merged.forms?.length ? "form" : "lemma", fallbackUsed: merged.lookupDiagnostics?.fallbackUsed });
    return [merged];
  }

  private async enrichFinnishLemma(
    entry: DictionaryEntry,
    attempts: NonNullable<DictionaryEntry["lookupDiagnostics"]>["attempts"],
    signal?: AbortSignal,
  ): Promise<void> {
    const normalizedWord = entry.word.normalize("NFC").toLocaleLowerCase();
    const lemma = entry.forms?.find((form) => form.lemma.normalize("NFC").toLocaleLowerCase() !== normalizedWord)?.lemma;
    if (!lemma) return;
    try {
      const lemmaEntry = await this.fetchEntry(lemma, "fi", signal);
      if (!lemmaEntry) {
        attempts.push({ query: lemma, languageKey: "fi", languageLabel: "Finnish", status: "empty" });
        return;
      }
      attempts.push({ query: lemma, languageKey: lemmaEntry.lookupDiagnostics?.matchedLanguageKey, languageLabel: lemmaEntry.lookupDiagnostics?.matchedLanguageLabel, status: "found" });
      const seen = new Set(entry.meanings.map(meaningKey));
      for (const meaning of lemmaEntry.meanings) {
        if (!seen.has(meaningKey(meaning))) entry.meanings.push(meaning);
      }
      entry.examples = dedupeExamples([...(entry.examples ?? []), ...(lemmaEntry.examples ?? [])]);
      if (entry.lookupDiagnostics) entry.lookupDiagnostics.attempts = attempts;
    } catch (error) {
      if (signal?.aborted) throw mapRequestError(error, signal);
      attempts.push({ query: lemma, status: "failed", reason: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
      if (entry.lookupDiagnostics) entry.lookupDiagnostics.attempts = attempts;
    }
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
    parentSignal?: AbortSignal,
  ): Promise<DictionaryEntry | null> {
    const url = `https://${this.host}/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    let response: Response;
    const requestSignal = createRequestSignal(parentSignal, 10_000);
    try {
      response = await fetch(url, { signal: requestSignal });
    } catch (error) {
      throw mapRequestError(error, requestSignal);
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

  private async fetchFinnishPronunciations(word: string, parentSignal?: AbortSignal): Promise<Pronunciation[]> {
    const sectionParams = new URLSearchParams({
      action: "parse",
      prop: "sections",
      page: word,
      format: "json",
      origin: "*",
    });
    const sectionsResponse = await this.fetchPronunciationApi(sectionParams, parentSignal);
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
    const textResponse = await this.fetchPronunciationApi(textParams, parentSignal);
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
    const syllabificationItem = [...document.querySelectorAll("li")]
      .find((item) => /^(?:Syllabification|Hyphenation)\s*:/i.test(item.textContent?.trim() ?? ""));
    const syllabification = syllabificationItem?.querySelector('[lang="fi"]')?.textContent?.trim()
      ?? syllabificationItem?.textContent?.trim().replace(/^(?:Syllabification|Hyphenation)\s*:\s*/i, "").trim();

    const parsedPronunciations = pronunciationItems.map((item) => {
      const ipa = [...item.querySelectorAll("span.IPA")]
        .map((node) => node.textContent?.trim())
        .filter((value): value is string => Boolean(value && /^[/\[].+[/\]]$/.test(value)));
      const audio = item.querySelector("audio");
      const sources = [...(audio?.querySelectorAll("source[src]") ?? [])];
      const rawAudioUrls = [
        ...sources
          .filter((source) => source.getAttribute("type")?.includes("mpeg") || source.getAttribute("src")?.toLowerCase().includes(".mp3")),
        ...sources.filter((source) =>
          !source.getAttribute("type")?.includes("mpeg") && !source.getAttribute("src")?.toLowerCase().includes(".mp3"),
        ),
      ].map((source) => source.getAttribute("src"))
        .concat(audio?.getAttribute("src") ?? [])
        .filter((value): value is string => Boolean(value));
      const audioUrls = [...new Set(rawAudioUrls.map((url) => new URL(url, `https://${this.host}`).href))];
      const audioUrl = audioUrls[0];
      const fileLink = item.querySelector('a[href*="/wiki/File:"]')?.getAttribute("href");
      const sourceUrl = `https://${this.host}/wiki/${encodeURIComponent(word)}#Finnish`;

      return {
        ipa: ipa.length > 0 ? [...new Set(ipa)] : undefined,
        audioUrl,
        audioUrls: audioUrls.length ? audioUrls : undefined,
        audioSource: audioUrl ? "Wikimedia Commons（经 Wiktionary 引用）" : undefined,
        audioSourceUrl: fileLink ? new URL(fileLink, `https://${this.host}`).href : undefined,
        syllabification,
        source: "Wiktionary",
        sourceUrl,
      };
    }).filter((pronunciation) =>
      Boolean(pronunciation.ipa?.length || pronunciation.audioUrls?.length || pronunciation.audioUrl || pronunciation.syllabification),
    );
    if (parsedPronunciations.length === 0 && syllabification) {
      return [{ syllabification, source: "Wiktionary", sourceUrl: `https://${this.host}/wiki/${encodeURIComponent(word)}#Finnish` }];
    }
    return parsedPronunciations;
  }

  private async enrichFinnishExampleForms(entry: DictionaryEntry, signal?: AbortSignal): Promise<void> {
    const lemma = entry.word.normalize("NFC").toLocaleLowerCase();
    const stem = lemma.replace(/[aä]$/u, "");
    if (stem.length < 3 || !entry.examples?.length) return;

    const candidates = [...new Set(entry.examples.flatMap((example) => {
      const tokens = example.text.match(/[\p{L}\p{M}]+/gu) ?? [];
      return tokens
        .map((token) => token.normalize("NFC").toLocaleLowerCase())
        .filter((token) => token !== lemma && token.startsWith(stem));
    }))].slice(0, 3);
    if (!candidates.length) return;

    const relations = new Map<string, { formOf: string; grammaticalForm: string }>();
    await Promise.all(candidates.map(async (form) => {
      const relation = await this.fetchFinnishFormRelation(form, lemma, signal).catch((error) => {
        if (signal?.aborted) throw error;
        return undefined;
      });
      if (relation) relations.set(form, relation);
    }));

    if (relations.size) {
      entry.examples = entry.examples.map((example) => {
        const words = example.text.match(/[\p{L}\p{M}]+/gu) ?? [];
        const relatedForm = words.find((word) => relations.has(word.normalize("NFC").toLocaleLowerCase()));
        const relation = relatedForm
          ? relations.get(relatedForm.normalize("NFC").toLocaleLowerCase())
          : undefined;
        if (!relation || !relatedForm) return example;
        return {
          ...example,
          formOf: relation.formOf,
          grammaticalForm: relation.grammaticalForm,
          formSourceUrl: `https://${this.host}/wiki/${encodeURIComponent(relatedForm)}#Finnish`,
        };
      });
    }
  }

  private async fetchFinnishFormRelation(
    form: string,
    expectedLemma: string,
    parentSignal?: AbortSignal,
  ): Promise<{ formOf: string; grammaticalForm: string } | undefined> {
    const key = `${this.host}:${form}`;
    let cached = formRelationCache.get(key);
    if (!cached) {
      cached = (async () => {
        const requestSignal = createRequestSignal(parentSignal, 6_000);
        let response: Response;
        try {
          response = await fetch(`https://${this.host}/api/rest_v1/page/definition/${encodeURIComponent(form)}`, { signal: requestSignal });
        } catch (error) {
          throw mapRequestError(error, requestSignal);
        }
        if (!response.ok) return undefined;
        const payload = await response.json() as RestPayload;
        for (const block of payload.fi ?? []) {
          if (block.language && block.language !== "Finnish") continue;
          for (const definition of block.definitions ?? []) {
            if (!definition.definition) continue;
            const relation = parseFinnishFormRelation(definition.definition);
            if (relation) return relation;
          }
        }
        return undefined;
      })();
      formRelationCache.set(key, cached);
      void cached.catch(() => {
        if (formRelationCache.get(key) === cached) formRelationCache.delete(key);
      });
    }
    const relation = await cached;
    return relation?.formOf.toLocaleLowerCase() === expectedLemma ? relation : undefined;
  }

  private async fetchPronunciationApi(params: URLSearchParams, parentSignal?: AbortSignal): Promise<Response | undefined> {
    const requestSignal = createRequestSignal(parentSignal, 6_000);
    try {
      const response = await fetch(`https://${this.host}/w/api.php?${params}`, {
        signal: requestSignal,
      });
      return response.ok ? response : undefined;
    } catch (error) {
      if (parentSignal?.aborted) throw mapRequestError(error, parentSignal);
      return undefined;
    }
  }

  private parsePayload(
    word: string,
    language: string,
    data: RestPayload,
  ): DictionaryEntry | null {
    const wikiLang = WIKI_LANG_NAME[language] ?? language;
    // REST v1 groups entries by language code (`fi`) and labels each entry (`Finnish`).
    // Be tolerant of alternate valid labels/keys, while requiring positive Finnish evidence.
    const allBlocks = Object.entries(data).flatMap(([key, blocks]) =>
      (blocks ?? []).map((block) => ({ key, block })),
    ).filter(({ key, block }) => language === "fi"
      ? isFinnishBlock(key, block.language)
      : key === language && (!block.language || block.language === wikiLang));

    const meanings: DictionaryEntry["meanings"] = [];
    const examples: DictionaryEntry["examples"] = [];
    const forms: NonNullable<DictionaryEntry["forms"]> = [];
    let encounteredUnparsedFinnishForm = false;

    for (const { block } of allBlocks) {
      for (const def of block.definitions ?? []) {
        if (!def.definition) continue;
        const parsedDefinition = parseDefinitionMetadata(def.definition);
        if (parsedDefinition.form) {
          forms.push({ ...parsedDefinition.form, word, partOfSpeech: block.partOfSpeech, sourceUrl: `https://${this.host}/wiki/${encodeURIComponent(word)}#Finnish` });
          if (parsedDefinition.text) meanings.push({
            text: parsedDefinition.text,
            language,
            definitionLanguage: "en",
            partOfSpeech: block.partOfSpeech,
            grammaticalForm: parsedDefinition.form.grammaticalForm,
            formOf: parsedDefinition.form.lemma,
          });
        } else if (isLikelyFormDefinition(def.definition) && language === "fi") {
          encounteredUnparsedFinnishForm = true;
        } else if (parsedDefinition.text) {
          meanings.push({
            text: parsedDefinition.text,
            language,
            definitionLanguage: "en",
            partOfSpeech: block.partOfSpeech,
            grammaticalForm: parsedDefinition.grammaticalForm,
            register: parsedDefinition.register,
          });
        }
        for (const ex of def.parsedExamples ?? []) {
          if (ex.example) {
            const example = parseDictionaryExample(ex.example, ex.translation, meanings.map((meaning) => meaning.text));
            if (example) examples.push(example);
          }
        }
        for (const raw of def.examples ?? []) {
          const example = parseDictionaryExample(raw, undefined, meanings.map((meaning) => meaning.text));
          if (example) examples.push(example);
        }
      }
    }

    if (meanings.length === 0 && forms.length === 0) {
      if (encounteredUnparsedFinnishForm) throw new Error("PROVIDER_FORM_PARSE");
      return null;
    }

    const matched = allBlocks[0];
    const matchedKey = matched?.key;
    const matchedLabel = matched?.block.language;
    const matchType = language === "fi" && (matchedKey !== "fi" || matchedLabel !== "Finnish")
      ? "language_alias" as const : "exact" as const;

    return {
      word,
      language,
      meanings,
      examples: examples.length ? dedupeExamples(examples) : undefined,
      forms: forms.length ? dedupeForms(forms) : undefined,
      source: "Wiktionary",
      sourceUrl: `https://${this.host}/wiki/${encodeURIComponent(word)}`,
      lookupDiagnostics: {
        fallbackUsed: matchType !== "exact",
        matchType,
        matchedLanguageKey: matchedKey,
        matchedLanguageLabel: matchedLabel,
        attempts: [{ query: word, languageKey: matchedKey, languageLabel: matchedLabel, status: "found" }],
      },
    };
  }
}

function parseDefinitionMetadata(rawDefinition: string): {
  text: string;
  grammaticalForm?: string;
  register?: string;
  form?: Omit<NonNullable<DictionaryEntry["forms"]>[number], "word" | "partOfSpeech" | "sourceUrl">;
} {
  const parsedForm = parseWiktionaryFormDefinition(rawDefinition);
  if (parsedForm) return { text: parsedForm.gloss ?? "", grammaticalForm: parsedForm.grammaticalForm, form: parsedForm };
  const cleaned = cleanDictionaryMeaning(rawDefinition);
  if (!cleaned) return { text: "" };
  let text = cleaned;

  // Wiktionary's REST definition output can leak CSS next to usage-tag markup.
  // Remove that presentation artifact while keeping the visible bracketed tag.
  const cssStart = text.indexOf(".mw-parser-output");
  if (cssStart >= 0) {
    const annotationStart = text.indexOf("[", cssStart);
    text = annotationStart >= 0
      ? `${text.slice(0, cssStart)}${text.slice(annotationStart)}`
      : text.slice(0, cssStart);
  }
  text = text.replace(/\s+/g, " ").trim();

  const annotation = text.match(/\s*\[([^\]]+)\]\s*$/);
  if (!annotation) return { text };
  const label = annotation[1].trim();
  const normalized = label.toLocaleLowerCase().replace(/[\s_-]+/g, " ");
  const registerLabels = new Set([
    "formal", "neutral", "casual", "informal", "colloquial", "slang",
    "regional", "literary", "rare", "archaic", "dated", "obsolete",
  ]);
  if (registerLabels.has(normalized)) {
    return { text: text.slice(0, annotation.index).trim(), register: label };
  }

  if (/^(?:with\s+)?(?:the\s+)?(?:partitive|genitive|inessive|elative|illative|adessive|ablative|allative|essive|translative|instructive|comitative|nominative|accusative|plural|singular|present|past|first|second|third|infinitive)\b/i.test(label)) {
    return { text: text.slice(0, annotation.index).trim(), grammaticalForm: label };
  }

  return { text };
}

function parseWiktionaryFormDefinition(raw: string): Omit<NonNullable<DictionaryEntry["forms"]>[number], "word" | "partOfSpeech" | "sourceUrl"> | undefined {
  const plain = stripDefinitionMarkup(raw);
  const relationLine = plain.match(/^(.+?)\s+of\s+[\p{L}\p{M}'’\-]+(?:\s*:\s*(.*))?$/iu);
  const hasTemplateMarker = /class=["'][^"']*\bform-of-definition\b/i.test(raw);
  if (!hasTemplateMarker && !relationLine) return undefined;
  const parsedTemplateRelation = hasTemplateMarker ? parseFinnishFormRelation(raw) : undefined;
  if (hasTemplateMarker && !parsedTemplateRelation && !relationLine) return undefined;
  const lemma = parsedTemplateRelation?.formOf ?? relationLine?.[0].match(/\s+of\s+([\p{L}\p{M}'’\-]+)/iu)?.[1];
  const grammar = parsedTemplateRelation?.grammaticalForm ?? relationLine?.[1];
  if (!lemma || !grammar) return undefined;
  const gloss = relationLine?.[2]?.trim() || undefined;
  const grammaticalForm = grammar.trim();
  const grammaticalNumber = /\bplural\b/i.test(grammaticalForm) ? "plural"
    : /\bsingular\b/i.test(grammaticalForm) ? "singular" : undefined;
  return { lemma: lemma.normalize("NFC"), grammaticalForm, grammaticalNumber, gloss };
}

function isLikelyFormDefinition(raw: string): boolean {
  if (/class=["'][^"']*\bform-of-definition\b/i.test(raw)) return true;
  const plain = stripDefinitionMarkup(raw);
  return /^(?:(?:first|second|third)[ -]person|singular|plural|present|past|imperative|indicative|connegative|partitive|genitive|inessive|elative|illative|adessive|ablative|allative|essive|translative|instructive|comitative|nominative|accusative|inflection|form of)\b.*\s+of\s+[\p{L}\p{M}'’\-]+/iu.test(plain);
}

function stripDefinitionMarkup(raw: string): string {
  return raw.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function hasUsableEntryContent(entry: DictionaryEntry): boolean {
  return entry.meanings.length > 0 || Boolean(entry.forms?.length);
}

function meaningKey(meaning: DictionaryEntry["meanings"][number]): string {
  return `${meaning.partOfSpeech ?? ""}:${meaning.formOf ?? ""}:${meaning.text.normalize("NFC").toLocaleLowerCase()}`;
}

function dedupeForms(forms: NonNullable<DictionaryEntry["forms"]>): NonNullable<DictionaryEntry["forms"]> {
  const unique = new Map<string, NonNullable<DictionaryEntry["forms"]>[number]>();
  for (const form of forms) {
    const key = `${form.lemma.toLocaleLowerCase()}:${form.grammaticalForm.toLocaleLowerCase()}:${form.grammaticalNumber ?? ""}:${form.gloss ?? ""}`;
    if (!unique.has(key)) unique.set(key, form);
  }
  return [...unique.values()];
}

export async function wiktionaryOpenSearch(
  prefix: string,
  host = "en.wiktionary.org",
  limit = 10,
  parentSignal?: AbortSignal,
): Promise<string[]> {
  const q = prefix.trim();
  if (q.length < 3) return [];

  const url =
    `https://${host}/w/api.php?action=opensearch&search=${encodeURIComponent(q)}` +
    `&limit=${limit}&format=json&origin=*`;

  let response: Response;
  const requestSignal = createRequestSignal(parentSignal, 10_000);
  try {
    response = await fetch(url, { signal: requestSignal });
  } catch (error) {
    throw mapRequestError(error, requestSignal);
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

function isFinnishBlock(key: string, label?: string): boolean {
  const normalizedLabel = label?.trim().toLocaleLowerCase();
  // An explicit, non-Finnish language label always wins over a misleading key.
  if (normalizedLabel && !FINNISH_LANGUAGE_LABELS.has(normalizedLabel)) return false;
  return FINNISH_LANGUAGE_KEYS.has(key.trim().toLocaleLowerCase())
    || Boolean(normalizedLabel && FINNISH_LANGUAGE_LABELS.has(normalizedLabel));
}

function mergeFinnishEntries(
  originalQuery: string,
  entries: DictionaryEntry[],
  attempts: NonNullable<DictionaryEntry["lookupDiagnostics"]>["attempts"],
): DictionaryEntry {
  // Results from capitalization variants are the same Wiktionary page; retain first
  // (the exact spelling is queried first) and merge only unique meanings/examples.
  const preferred = entries[0];
  const meanings = new Map<string, DictionaryEntry["meanings"][number]>();
  const examples = new Map<string, NonNullable<DictionaryEntry["examples"]>[number]>();
  const forms: NonNullable<DictionaryEntry["forms"]> = [];
  for (const entry of entries) {
    for (const meaning of entry.meanings) {
      const key = meaningKey(meaning);
      if (!meanings.has(key)) meanings.set(key, meaning);
    }
    for (const example of entry.examples ?? []) {
      const key = `${example.text.normalize("NFC").toLocaleLowerCase()}:${example.translation ?? ""}`;
      if (!examples.has(key)) examples.set(key, example);
    }
    forms.push(...(entry.forms ?? []));
  }
  const diagnostics = preferred.lookupDiagnostics;
  const usedFallback = attempts.some((attempt) => attempt.status === "found" && attempt.query !== originalQuery)
    || Boolean(diagnostics?.fallbackUsed);
  return {
    ...preferred,
    word: originalQuery,
    meanings: [...meanings.values()],
    examples: examples.size ? [...examples.values()] : undefined,
    forms: forms.length ? dedupeForms(forms) : undefined,
    sourceUrl: `https://${new URL(preferred.sourceUrl ?? "https://en.wiktionary.org").host}/wiki/${encodeURIComponent(originalQuery)}`,
    lookupDiagnostics: {
      fallbackUsed: usedFallback,
      matchType: attempts.some((attempt) => attempt.status === "found" && attempt.query !== originalQuery)
        ? "case_variant" : diagnostics?.matchType ?? "exact",
      matchedLanguageKey: diagnostics?.matchedLanguageKey,
      matchedLanguageLabel: diagnostics?.matchedLanguageLabel,
      attempts,
    },
  };
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
