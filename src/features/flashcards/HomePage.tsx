import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SearchBar } from "../../components/SearchBar";
import { WordCard } from "../../components/WordCard";
import { countDueFlashcards, saveFlashcard } from "../../db/database";
import type { DictionaryEntry } from "../../types/word";
import { searchDictionary } from "../dictionary/dictionaryService";
import {
  loadRecentSearches,
  loadSettings,
  pushRecentSearch,
} from "../settings/settingsStore";
import { createFlashcard } from "./review";

export function HomePage() {
  const [dueCount, setDueCount] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [results, setResults] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const refreshMeta = useCallback(async () => {
    setDueCount(await countDueFlashcards());
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  async function handleSearch(query: string) {
    if (!query) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const lang = loadSettings().learningLanguage;
      const entries = await searchDictionary(query, lang);
      pushRecentSearch(query);
      setRecent(loadRecentSearches());
      setResults(entries);
      if (entries.length === 0) {
        setError("未找到释义，请换一个词试试。");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(entry: DictionaryEntry, meaningIndex: number) {
    const meaning = entry.meanings[meaningIndex];
    if (!meaning) return;
    setSavingIndex(meaningIndex);
    const example = entry.examples?.[0]?.text;
    const card = createFlashcard({
      word: entry.word,
      language: entry.language,
      meaning: meaning.text,
      example,
      tags: meaning.partOfSpeech ? [meaning.partOfSpeech] : [],
    });
    await saveFlashcard(card);
    setDueCount(await countDueFlashcards());
    setTimeout(() => setSavingIndex(null), 600);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Meoini</h1>
        <p className="mt-1 text-sm text-slate-600">查词并保存为闪卡</p>
        {dueCount > 0 && (
          <Link
            to="/review"
            className="mt-3 inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800"
          >
            今日待复习 {dueCount} 张 →
          </Link>
        )}
      </header>

      <SearchBar onSearch={handleSearch} loading={loading} />

      {error && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </p>
      )}

      {recent.length > 0 && results.length === 0 && !loading && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-slate-500">
            最近搜索
          </h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => handleSearch(word)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700"
              >
                {word}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-4">
        {results.map((entry, i) => (
          <WordCard
            key={`${entry.word}-${i}`}
            entry={entry}
            onSaveMeaning={(idx) => handleSave(entry, idx)}
            savingIndex={savingIndex}
          />
        ))}
      </div>
    </div>
  );
}
