export interface DictionaryEntry {
  word: string;
  language: string;
  meanings: {
    text: string;
    language: string;
    definitionLanguage?: string;
    partOfSpeech?: string;
    register?: string;
    usageFrequency?: string;
  }[];
  examples?: {
    text: string;
    translation?: string;
    translationLanguage?: string;
  }[];
  pronunciation?: string;
  pronunciationSource?: string;
  pronunciationAudioUrl?: string;
  pronunciations?: Pronunciation[];
  source?: string;
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
  lookupStatus?: "pending" | "found" | "not_found" | "error";
  tags: string[];
  createdAt: number;
  dueAt: number;
  intervalDays: number;
  repetitions: number;
}

export type ReviewRating = "again" | "hard" | "good";
