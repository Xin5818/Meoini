export interface DictionaryEntry {
  word: string;
  language: string;
  meanings: {
    text: string;
    language: string;
    definitionLanguage?: string;
    partOfSpeech?: string;
    grammaticalForm?: string;
    formOf?: string;
    register?: string;
    usageFrequency?: string;
  }[];
  examples?: {
    text: string;
    translation?: string;
    translationLanguage?: string;
    kind?: "sentence" | "collocation";
    formOf?: string;
    formSourceUrl?: string;
    grammaticalForm?: string;
    register?: string;
    usageFrequency?: string;
  }[];
  pronunciation?: string;
  pronunciationSource?: string;
  pronunciationAudioUrl?: string;
  pronunciations?: Pronunciation[];
  source?: string;
  sourceUrl?: string;
  forms?: WordForm[];
  lookupDiagnostics?: {
    fallbackUsed: boolean;
    matchType: "exact" | "case_variant" | "language_alias";
    matchedLanguageKey?: string;
    matchedLanguageLabel?: string;
    attempts: { query: string; languageKey?: string; languageLabel?: string; status: "found" | "empty" | "failed"; reason?: string }[];
  };
}

export interface WordForm {
  word: string;
  lemma: string;
  partOfSpeech?: string;
  grammaticalForm: string;
  grammaticalNumber?: "singular" | "plural";
  gloss?: string;
  sourceUrl?: string;
}

export interface Pronunciation {
  ipa?: string[];
  audioUrl?: string;
  audioUrls?: string[];
  audioSource?: string;
  audioSourceUrl?: string;
  syllabification?: string;
  source?: string;
  sourceUrl?: string;
}

export interface Flashcard {
  id: string;
  word: string;
  language: string;
  meaning: string;
  partOfSpeech?: string;
  example?: string;
  dictionaryEntry?: DictionaryEntry;
  lookupStatus?: "pending" | "querying" | "found" | "not_found" | "error";
  lookupStartedAt?: number;
  lookupCompletedAt?: number;
  lookupError?: string;
  lastReviewedAt?: number;
  lastReviewMode?: "scheduled" | "early";
  earlyReviewCount?: number;
  tags: string[];
  createdAt: number;
  dueAt: number;
  intervalDays: number;
  repetitions: number;
}

export type ReviewRating = "again" | "hard" | "good";
