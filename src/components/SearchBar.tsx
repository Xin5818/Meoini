import { useState, type FormEvent } from "react";

interface SearchBarProps {
  initialQuery?: string;
  placeholder?: string;
  onSearch: (query: string) => void;
  loading?: boolean;
}

export function SearchBar({
  initialQuery = "",
  placeholder = "输入单词…",
  onSearch,
  loading,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSearch(query.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
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
  );
}
