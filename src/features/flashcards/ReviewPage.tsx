import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDueFlashcards, saveFlashcard } from "../../db/database";
import type { Flashcard, ReviewRating } from "../../types/word";
import { applyReview } from "./review";

export function ReviewPage() {
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [current, setCurrent] = useState<Flashcard | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    const due = await getDueFlashcards();
    setQueue(due);
    setCurrent(due[0] ?? null);
    setRevealed(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function rate(rating: ReviewRating) {
    if (!current) return;
    const updated = applyReview(current, rating);
    await saveFlashcard(updated);
    const rest = queue.filter((c) => c.id !== current.id);
    setQueue(rest);
    setCurrent(rest[0] ?? null);
    setRevealed(false);
  }

  if (loading) {
    return <p className="text-slate-500">加载复习队列…</p>;
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-lg font-medium text-slate-800">暂无待复习卡片</p>
        <p className="text-sm text-slate-500">
          去查词并加入闪卡，或稍后再来。
        </p>
        <Link
          to="/"
          className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white"
        >
          去查词
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">复习</h1>
        <span className="text-sm text-slate-500">剩余 {queue.length} 张</span>
      </header>

      <div
        className="min-h-[280px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        onClick={() => !revealed && setRevealed(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setRevealed(true);
        }}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {current.language}
        </p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{current.word}</p>

        {!revealed ? (
          <p className="mt-8 text-center text-sm text-slate-400">
            点击显示释义
          </p>
        ) : (
          <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
            <p className="text-lg text-slate-800">{current.meaning}</p>
            {current.example && (
              <p className="text-sm italic text-slate-600">
                &ldquo;{current.example}&rdquo;
              </p>
            )}
          </div>
        )}
      </div>

      {revealed && (
        <div className="grid grid-cols-3 gap-2">
          <RatingButton label="不会" sub="稍后复习" onClick={() => rate("again")} />
          <RatingButton label="有点印象" sub="短间隔" onClick={() => rate("hard")} />
          <RatingButton label="记得" sub="延长间隔" onClick={() => rate("good")} />
        </div>
      )}
    </div>
  );
}

function RatingButton({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white py-3 text-center shadow-sm active:bg-slate-50"
    >
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <span className="block text-[10px] text-slate-400">{sub}</span>
    </button>
  );
}
