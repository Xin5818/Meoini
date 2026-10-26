import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { DictionarySuggestion } from "../features/dictionary/dictionarySearch";

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  loading?: boolean;
  suggestions?: DictionarySuggestion[];
  suggestionsLoading?: boolean;
  placeholder?: string;
}

export function SearchBar({
  query,
  onQueryChange,
  onSearch,
  loading,
  suggestions = [],
  suggestionsLoading,
  placeholder = "输入单词…",
}: SearchBarProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const matchingSuggestions = suggestions.filter((item) =>
    item.word.toLocaleLowerCase().startsWith(query.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  function submitSearch(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setOpen(false);
    onSearch(trimmed);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (activeIndex >= 0 && matchingSuggestions[activeIndex]) {
      submitSearch(matchingSuggestions[activeIndex].word);
      return;
    }
    submitSearch(query);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || matchingSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matchingSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList =
    open && query.trim().length >= 3 && (matchingSuggestions.length > 0 || suggestionsLoading);

  return (
    <div ref={rootRef} className="relative">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm outline-none ring-brand-600 focus:ring-2"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {loading ? "查询中…" : "搜索"}
        </button>
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestionsLoading && matchingSuggestions.length === 0 && (
            <li className="px-4 py-2 text-sm text-slate-400">联想中…</li>
          )}
          {matchingSuggestions.map((item, index) => (
            <li key={item.word} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submitSearch(item.word)}
                className={[
                  "flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-brand-50",
                  index === activeIndex ? "bg-brand-50" : "",
                ].join(" ")}
              >
                <span className="font-medium text-slate-900">{item.word}</span>
                {item.hint && (
                  <span className="text-xs text-slate-500 line-clamp-1">{item.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
