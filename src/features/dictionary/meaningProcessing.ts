import type { DictionaryEntry, Flashcard } from "../../types/word";
import { parseDictionaryExample } from "./exampleProcessing.ts";
import { createFlashcard } from "../flashcards/review.ts";

const PARTS_OF_SPEECH = /^(?:noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|proper noun|particle|numeral)\s*;\s*/i;
const FORM_DESCRIPTION = /^(?:(?:first|second|third)[ -]person|singular|plural|present|past|imperative|indicative|connegative|partitive|genitive|inessive|elative|illative|adessive|ablative|allative|essive|translative|instructive|comitative|nominative|accusative|inflection of|form of)\b/i;

/** Clean a Wiktionary gloss and reject entries that only describe an inflected form. */
export function cleanDictionaryMeaning(raw: string): string | undefined {
  if (/class=["'][^"']*\bform-of-definition\b/i.test(raw) || /\binflection of\b/i.test(raw)) return undefined;
  let text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  const cssStart = text.indexOf(".mw-parser-output");
  if (cssStart >= 0) {
    const annotationStart = text.indexOf("[", cssStart);
    text = annotationStart >= 0 ? `${text.slice(0, cssStart)}${text.slice(annotationStart)}` : text.slice(0, cssStart);
  }

  text = text.replace(PARTS_OF_SPEECH, "");
  if (!text || FORM_DESCRIPTION.test(text)) return undefined;
  return text;
}

/** Repair dictionary-backed cards created before form-of entries were filtered. */
export function repairStoredDictionaryMeaning(card: Flashcard): Flashcard {
  if (card.lookupStatus !== "found") return card;
  if (card.dictionaryEntry) {
    const repaired = applyDictionaryEntryToFlashcard(card, card.dictionaryEntry);
    if (
      repaired.meaning === card.meaning &&
      repaired.partOfSpeech === card.partOfSpeech &&
      repaired.example === card.example &&
      repaired.lookupStatus === card.lookupStatus &&
      JSON.stringify(repaired.dictionaryEntry) === JSON.stringify(card.dictionaryEntry)
    ) return card;
    return repaired;
  }

  const meanings = card.meaning.split("；")
    .map(cleanDictionaryMeaning)
    .filter((meaning): meaning is string => Boolean(meaning));
  if (!meanings.length) {
    return { ...card, meaning: "", lookupStatus: "not_found" };
  }
  const meaning = meanings.join("；");
  return meaning === card.meaning ? card : { ...card, meaning };
}

/** Build exactly what the importer persists and the review face later reads. */
export function applyDictionaryEntryToFlashcard(
  card: Flashcard,
  entry: DictionaryEntry | undefined,
): Flashcard {
  const cleanMeanings = (entry?.meanings ?? [])
    .map((meaning) => ({ ...meaning, text: cleanDictionaryMeaning(meaning.text) }))
    .filter((meaning): meaning is typeof meaning & { text: string } => Boolean(meaning.text));

  const cleanForms = entry?.forms?.filter((form) => Boolean(form.lemma && form.grammaticalForm)) ?? [];
  if (!entry || (cleanMeanings.length === 0 && cleanForms.length === 0)) {
    return {
      ...card,
      meaning: "",
      partOfSpeech: undefined,
      example: undefined,
      dictionaryEntry: undefined,
      lookupStatus: "not_found",
    };
  }

  const cleanExamples = entry.examples?.flatMap((example) => {
    const parsed = parseDictionaryExample(example.text, example.translation, cleanMeanings.map((meaning) => meaning.text));
    return parsed ? [{ ...example, ...parsed }] : [];
  });
  const cleanedEntry: DictionaryEntry = {
    ...entry,
    meanings: cleanMeanings,
    forms: cleanForms.length ? cleanForms : undefined,
    examples: cleanExamples?.length ? cleanExamples : undefined,
  };
  return {
    ...card,
    meaning: cleanMeanings.map((meaning) => meaning.text).join("；"),
    partOfSpeech: [...new Set([
      ...cleanMeanings.map((meaning) => meaning.partOfSpeech),
      ...cleanForms.map((form) => form.partOfSpeech),
    ].filter(Boolean))].join("、") || undefined,
    example: cleanExamples?.find((example) => example.kind === "sentence")?.text,
    dictionaryEntry: cleanedEntry,
    lookupStatus: "found",
  };
}

export function createDictionaryFlashcard(entry: DictionaryEntry): Flashcard {
  const meanings = entry.meanings.map((meaning) => meaning.text).filter(Boolean);
  const partOfSpeech = [...new Set(entry.meanings
    .map((meaning) => meaning.partOfSpeech)
    .concat((entry.forms ?? []).map((form) => form.partOfSpeech))
    .filter((value): value is string => Boolean(value)))];
  const sentence = entry.examples?.find((example) => example.kind === "sentence");
  return {
    ...createFlashcard({
      word: entry.word,
      language: entry.language,
      meaning: meanings.join("；"),
      example: sentence?.text,
      tags: partOfSpeech,
    }),
    partOfSpeech: partOfSpeech.join("、") || undefined,
    dictionaryEntry: entry,
    lookupStatus: meanings.length || entry.forms?.length ? "found" : "not_found",
  };
}
