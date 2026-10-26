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
  source?: string;
  sourceUrl?: string;
}

export interface Flashcard {
  id: string;
  word: string;
  language: string;
  meaning: string;
  example?: string;
  tags: string[];
  createdAt: number;
  dueAt: number;
  intervalDays: number;
  repetitions: number;
}

export type ReviewRating = "again" | "hard" | "good";
