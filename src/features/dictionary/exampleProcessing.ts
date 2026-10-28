import type { DictionaryEntry } from "../../types/word";

function stripExampleMarkup(value: string): string {
  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDictionaryExample(
  rawExample: string,
  rawTranslation?: string,
  meanings: string[] = [],
): NonNullable<DictionaryEntry["examples"]>[number] | undefined {
  if (/class=["'][^"']*\bform-of-definition\b/i.test(rawExample) || /\.mw-parser-output|<style\b|<script\b/i.test(rawExample)) {
    return undefined;
  }

  let text = stripExampleMarkup(rawExample);
  if (!text || /^(?:examples?|definitions?|verb|noun|adjective|inflection of|form of|(?:(?:first|second|third)[ -]person|singular|plural|present|past|imperative|indicative|connegative|partitive|genitive|inessive|elative|illative|adessive|ablative|allative|essive|translative|instructive|comitative|nominative|accusative)\b)/i.test(text)) {
    return undefined;
  }

  let translation = rawTranslation ? stripExampleMarkup(rawTranslation) : undefined;
  if (!translation) {
    const separator = text.match(/^(.*?)\s+[―—]\s+(.+)$/);
    if (separator) {
      text = separator[1].trim();
      translation = separator[2].trim();
    }
  }

  const normalizedText = text.toLocaleLowerCase().normalize("NFC");
  if (meanings.some((meaning) => meaning.toLocaleLowerCase().normalize("NFC") === normalizedText)) {
    return undefined;
  }

  const kind = isCompleteExampleSentence(text) ? "sentence" : "collocation";
  return {
    text,
    translation: translation || undefined,
    translationLanguage: translation ? "en" : undefined,
    kind,
  };
}

export function parseFinnishFormRelation(rawDefinition: string): {
  formOf: string;
  grammaticalForm: string;
} | undefined {
  if (!/class=["'][^"']*\bform-of-definition\b/i.test(rawDefinition)) return undefined;
  const text = stripExampleMarkup(rawDefinition);
  const chunks = text.split(/\bof\b/i);
  if (chunks.length < 2) return undefined;
  const last = chunks.at(-1)?.trim() ?? "";
  const lemma = last.match(/^([\p{L}\p{M}][\p{L}\p{M}'’\-]*)/u)?.[1];
  const grammaticalForm = chunks.slice(0, -1).map((chunk) => chunk.trim()).filter(Boolean).join(" of ");
  if (!lemma || !grammaticalForm) return undefined;
  return { formOf: lemma.normalize("NFC"), grammaticalForm };
}

export function isCompleteExampleSentence(text: string): boolean {
  return /[.!?…]["'”’)}\]]*$/.test(text.trim());
}
