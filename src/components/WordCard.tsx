import type { DictionaryEntry } from "../types/word";

interface WordCardProps {
  entry: DictionaryEntry;
  onSaveMeaning: (meaningIndex: number) => void;
  savingIndex?: number | null;
}

export function WordCard({ entry, onSaveMeaning, savingIndex }: WordCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-2xl font-bold text-slate-900">{entry.word}</h2>
          {entry.pronunciation && (
            <span className="text-sm text-slate-500">{entry.pronunciation}</span>
          )}
        </div>
        {entry.source && (
          <p className="mt-1 text-xs text-slate-400">
            来源：{" "}
            {entry.sourceUrl ? (
              <a
                href={entry.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {entry.source}
              </a>
            ) : (
              entry.source
            )}
          </p>
        )}
      </header>

      <ul className="space-y-4">
        {entry.meanings.map((meaning, index) => (
          <li key={index} className="flex gap-3">
            <div className="min-w-0 flex-1">
              {meaning.partOfSpeech && (
                <span className="mb-1 inline-block rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
                  {meaning.partOfSpeech}
                </span>
              )}
              <p className="text-slate-800">{meaning.text}</p>
            </div>
            <button
              type="button"
              onClick={() => onSaveMeaning(index)}
              disabled={savingIndex === index}
              className="shrink-0 self-start rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              {savingIndex === index ? "已保存" : "加入闪卡"}
            </button>
          </li>
        ))}
      </ul>

      {entry.examples && entry.examples.length > 0 && (
        <section className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            例句
          </h3>
          <ul className="space-y-2 text-sm text-slate-600">
            {entry.examples.slice(0, 3).map((ex, i) => (
              <li key={i} className="italic">&ldquo;{ex.text}&rdquo;</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
