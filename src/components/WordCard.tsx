import type { DictionaryEntry } from "../types/word";
import { PronunciationPanel } from "./PronunciationPanel";

interface WordCardProps {
  entry: DictionaryEntry;
  onSaveMeaning: (meaningIndex: number) => void;
  savingIndex?: number | null;
}

export function WordCard({ entry, onSaveMeaning, savingIndex }: WordCardProps) {
  const languageName = entry.language === "fi" ? "芬兰语" : entry.language;
  const partOfSpeech = [...new Set(entry.meanings.map((m) => m.partOfSpeech).filter(Boolean))];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-2xl font-bold text-slate-900">{entry.word}</h2>
          <span className="text-sm text-slate-500">
            {languageName}{partOfSpeech.length ? ` · ${partOfSpeech.map(localizePartOfSpeech).join("、")}` : ""}
          </span>
        </div>
        <PronunciationPanel
          word={entry.word}
          language={entry.language}
          ipa={entry.pronunciation}
          ipaSource={entry.pronunciationSource}
          audioUrl={entry.pronunciationAudioUrl}
        />
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
              <p className="mb-1 text-xs font-medium text-slate-500">
                {meaning.definitionLanguage === "en" ? "英文释义" : "释义"}
              </p>
              <p className="text-slate-800">{meaning.text}</p>
              {(meaning.register || meaning.usageFrequency) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {meaning.register && <EvidenceTag label={meaning.register} />}
                  {meaning.usageFrequency && <EvidenceTag label={meaning.usageFrequency} />}
                </div>
              )}
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
              <li key={i}>
                <p className="italic text-slate-800">&ldquo;{ex.text}&rdquo;</p>
                {ex.translation && (
                  <p className="mt-1 text-slate-600">
                    {ex.translationLanguage === "en" ? "英文翻译：" : "翻译："}
                    {ex.translation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function EvidenceTag({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
      {label}
    </span>
  );
}

function localizePartOfSpeech(value: string | undefined): string {
  if (!value) return "";
  const labels: Record<string, string> = {
    Adjective: "形容词",
    Adverb: "副词",
    Noun: "名词",
    Verb: "动词",
    Pronoun: "代词",
    Preposition: "介词",
    Conjunction: "连词",
    Interjection: "感叹词",
  };
  return labels[value] ?? value;
}
