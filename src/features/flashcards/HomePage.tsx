import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ManualFlashcardForm } from "../../components/ManualFlashcardForm";
import { SearchBar } from "../../components/SearchBar";
import { WordCard } from "../../components/WordCard";
import { countDueFlashcards, getFlashcardByWord, saveFlashcard, saveFlashcardIfAbsent } from "../../db/database";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { DictionaryEntry } from "../../types/word";
import {
  searchDictionarySmart,
  type DictionarySearchResult,
  type DictionarySuggestion,
} from "../dictionary/dictionarySearch";
import { suggestDictionaryWords } from "../dictionary/dictionaryService";
import {
  loadRecentSearches,
  loadSettings,
  pushRecentSearch,
} from "../settings/settingsStore";
import { createFlashcard } from "./review";
import { createDictionaryFlashcard } from "../dictionary/meaningProcessing";

export function HomePage() {
  const [dueCount, setDueCount] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DictionaryEntry[]>([]);
  const [searchMeta, setSearchMeta] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DictionarySearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<DictionarySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [savingWord, setSavingWord] = useState<string | null>(null);
  const [savedWords, setSavedWords] = useState<Set<string>>(() => new Set());
  const [saveError, setSaveError] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualSaved, setManualSaved] = useState(false);
  const [metaError, setMetaError] = useState("");
  const searchRequest = useRef(0);
  const searchController = useRef<AbortController | null>(null);

  const debouncedQuery = useDebouncedValue(query, 250);
  const language = loadSettings().learningLanguage;

  const refreshMeta = useCallback(async () => {
    try {
      setDueCount(await countDueFlashcards());
      setRecent(loadRecentSearches());
      setMetaError("");
    } catch {
      setMetaError("读取本地复习数据失败；查词仍可继续使用。");
    }
  }, []);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    const prefix = debouncedQuery.trim();
    if (prefix.length < 3) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setSuggestionsLoading(true);

    void (async () => {
      try {
        const words = await suggestDictionaryWords(prefix, language, 8, controller.signal);
        if (cancelled) return;
        const base = words.map((word) => ({ word }));
        if (!cancelled) setSuggestions(base);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedQuery, language]);

  useEffect(() => () => {
    searchRequest.current++;
    searchController.current?.abort();
  }, []);

  async function handleSearch(searchQuery: string) {
    if (!searchQuery) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const requestId = ++searchRequest.current;
    setQuery(searchQuery);
    setLoading(true);
    setOutcome(null);
    setSearchMeta(null);
    setResults([]);
    setShowManualForm(false);
    setManualSaved(false);

    try {
      const result = await searchDictionarySmart(searchQuery, language, controller.signal);
      if (requestId !== searchRequest.current) return;
      setOutcome(result);

      if (result.status === "ok") {
        pushRecentSearch(searchQuery);
        setRecent(loadRecentSearches());
        setResults(result.entries);
        try {
          const savedEntries = await Promise.all(
            result.entries.map((entry) => getFlashcardByWord(entry.word, entry.language)),
          );
          if (requestId !== searchRequest.current) return;
          setSavedWords(new Set(savedEntries.flatMap((card, index) =>
            card ? [dictionaryEntryKey(result.entries[index].language, result.entries[index].word)] : [],
          )));
        } catch {
          setSearchMeta("词典结果已加载，但暂时无法读取本地已保存状态。可重试查词。 ");
        }
        if (result.matchKind === "diacritic") {
          setSearchMeta(`未找到完全相同的拼写「${searchQuery}」，已通过变音符容错匹配到「${result.queryUsed}」`);
        } else if (result.matchKind === "fuzzy" && result.queryUsed !== searchQuery) {
          setSearchMeta(`未找到「${searchQuery}」，已显示词典候选「${result.queryUsed}」`);
        }
        if (result.relatedWords?.length) {
          const relation = `词典识别到词形关系：${searchQuery} → ${result.relatedWords.join("、")}`;
          setSearchMeta((current) => current ? `${current}；${relation}` : relation);
        }
      } else if (result.status === "not_found") {
        setSuggestions(result.suggestions);
      }
    } catch (error) {
      if (requestId !== searchRequest.current) return;
      setOutcome({
        status: "error",
        query: searchQuery,
        errorKind: "provider",
        message: error instanceof Error && error.message === "TIMEOUT"
          ? "查词请求超时，请重试。"
          : "查词过程中读取数据失败，请重试。",
      });
    } finally {
      if (requestId === searchRequest.current) setLoading(false);
    }
  }

  async function handleSave(entry: DictionaryEntry) {
    const key = dictionaryEntryKey(entry.language, entry.word);
    if (savedWords.has(key) || savingWord === key) return;
    setSavingWord(key);
    setSaveError("");
    try {
      await saveFlashcardIfAbsent(createDictionaryFlashcard(entry));
      setSavedWords((current) => new Set(current).add(key));
      setDueCount(await countDueFlashcards());
    } catch {
      setSaveError(`保存「${entry.word}」失败，请稍后重试。`);
    } finally {
      setSavingWord(null);
    }
  }

  async function handleManualSave(data: {
    word: string;
    meaning: string;
    example?: string;
  }) {
    const card = createFlashcard({
      word: data.word,
      language,
      meaning: data.meaning,
      example: data.example,
      tags: ["manual"],
    });
    await saveFlashcard(card);
    setManualSaved(true);
    setDueCount(await countDueFlashcards());
    pushRecentSearch(data.word);
    setRecent(loadRecentSearches());
  }

  const notFound = outcome?.status === "not_found";
  const errored = outcome?.status === "error";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Meoini</h1>
        <p className="mt-1 text-sm text-slate-600">
          查词并保存为闪卡 · 词典语言：{language}
        </p>
        {language === "en" && (
          <p className="mt-1 text-xs text-amber-800">
            学习芬兰语请在「设置」中选择 Finnish (fi)。
          </p>
        )}
        {dueCount > 0 && (
          <Link
            to="/review"
            className="mt-3 inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800"
          >
            今日待复习 {dueCount} 张 →
          </Link>
        )}
      </header>
      {metaError && <p role="status" className="text-xs text-amber-800">{metaError}</p>}

      <SearchBar
        query={query}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        loading={loading}
        suggestions={suggestions}
        suggestionsLoading={suggestionsLoading}
      />

      {searchMeta && (
        <p className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-700">
          {searchMeta}
        </p>
      )}

      {errored && outcome.status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-medium">词典请求失败</p>
          <p className="mt-1">{outcome.message}</p>
          <p className="mt-2 text-xs text-red-800">
            这与「词库中没有该词」不同。请检查网络，或稍后再试；也可手动创建闪卡。
          </p>
          <button type="button" disabled={loading} onClick={() => void handleSearch(outcome.query)} className="mt-3 mr-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-900 ring-1 ring-red-200 disabled:opacity-50">
            重试查词
          </button>
          <button
            type="button"
            onClick={() => setShowManualForm(true)}
            className="mt-3 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-900 ring-1 ring-red-200"
          >
            手动创建闪卡
          </button>
        </div>
      )}

      {notFound && outcome.status === "not_found" && (
        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
          <div>
            <p className="font-medium text-amber-950">暂时没有找到「{outcome.query}」的释义</p>
            <p className="mt-1 text-sm text-amber-900/90">
              可尝试下方联想词，或直接创建自己的词汇卡。
            </p>
          </div>

          {outcome.suggestions.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase text-amber-900/70">
                联想结果
              </h2>
              <ul className="space-y-1">
                {outcome.suggestions.map((s) => (
                  <li key={s.word}>
                    <button
                      type="button"
                      onClick={() => handleSearch(s.word)}
                      className="flex w-full items-baseline justify-between rounded-lg bg-white px-3 py-2 text-left text-sm hover:bg-brand-50"
                    >
                      <span className="font-medium text-slate-900">{s.word}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            className="w-full rounded-xl bg-brand-700 py-2.5 text-sm font-semibold text-white"
          >
            {showManualForm ? "收起表单" : "手动创建闪卡"}
          </button>
        </div>
      )}

      {(showManualForm || manualSaved) && (
        <ManualFlashcardForm
          initialWord={
            outcome && "query" in outcome && outcome.query ? outcome.query : query
          }
          language={language}
          onSave={handleManualSave}
          onCancel={showManualForm ? () => setShowManualForm(false) : undefined}
        />
      )}

      {manualSaved && (
        <p className="text-sm text-brand-800">闪卡已保存，可在「词库」中查看。</p>
      )}

      {recent.length > 0 && results.length === 0 && !loading && !notFound && !errored && (
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
        {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
        {results.map((entry, i) => (
          <WordCard
            key={`${entry.word}-${i}`}
            entry={entry}
            onSaveEntry={() => void handleSave(entry)}
            saving={savingWord === dictionaryEntryKey(entry.language, entry.word)}
            saved={savedWords.has(dictionaryEntryKey(entry.language, entry.word))}
          />
        ))}
      </div>
    </div>
  );
}

function dictionaryEntryKey(language: string, word: string): string {
  return `${language}:${word.normalize("NFC").toLocaleLowerCase()}`;
}
