import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteFlashcard,
  getFlashcards,
  saveFlashcard,
} from "../../db/database";
import type { Flashcard } from "../../types/word";

export function LibraryPage() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [query, setQuery] = useState("");
  const [langFilter, setLangFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Flashcard | null>(null);

  const load = useCallback(async () => {
    setCards(await getFlashcards());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const languages = useMemo(() => {
    return [...new Set(cards.map((c) => c.language))].sort();
  }, [cards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (langFilter !== "all" && c.language !== langFilter) return false;
      if (!q) return true;
      return (
        c.word.toLowerCase().includes(q) ||
        c.meaning.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [cards, query, langFilter]);

  async function handleDelete(id: string) {
    if (!confirm("确定删除这张闪卡？")) return;
    await deleteFlashcard(id);
    await load();
  }

  async function handleSaveEdit(form: Flashcard) {
    await saveFlashcard(form);
    setEditing(null);
    await load();
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">我的词库</h1>
        <p className="text-sm text-slate-500">共 {cards.length} 张闪卡</p>
      </header>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索单词或释义…"
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none ring-brand-600 focus:ring-2"
      />

      {languages.length > 1 && (
        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">全部语言</option>
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      )}

      <ul className="space-y-3">
        {filtered.map((card) => (
          <li
            key={card.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{card.word}</p>
                <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                  {card.meaning}
                </p>
                {card.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {card.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(card)}
                  className="rounded-lg px-2 py-1 text-xs text-brand-700"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(card.id)}
                  className="rounded-lg px-2 py-1 text-xs text-red-600"
                >
                  删除
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">没有匹配的卡片</p>
      )}

      {editing && (
        <EditModal
          card={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}

function EditModal({
  card,
  onClose,
  onSave,
}: {
  card: Flashcard;
  onClose: () => void;
  onSave: (c: Flashcard) => void;
}) {
  const [form, setForm] = useState(card);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold">编辑闪卡</h2>
        <div className="mt-4 space-y-3">
          <Field
            label="单词"
            value={form.word}
            onChange={(word) => setForm({ ...form, word })}
          />
          <Field
            label="释义"
            value={form.meaning}
            onChange={(meaning) => setForm({ ...form, meaning })}
          />
          <Field
            label="例句"
            value={form.example ?? ""}
            onChange={(example) => setForm({ ...form, example: example || undefined })}
          />
          <Field
            label="标签（用 | 分隔）"
            value={form.tags.join("|")}
            onChange={(raw) =>
              setForm({
                ...form,
                tags: raw
                  .split("|")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            className="flex-1 rounded-xl bg-brand-700 py-2.5 text-sm font-semibold text-white"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
      />
    </label>
  );
}
