import { useState } from "react";
import type { DictionaryEntry } from "../types/word";
import { PronunciationPanel } from "./PronunciationPanel";

interface WordCardProps {
  entry: DictionaryEntry;
  onSaveEntry: () => void;
  saving?: boolean;
  saved?: boolean;
}

export function WordCard({ entry, onSaveEntry, saving = false, saved = false }: WordCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const languageName = entry.language === "fi" ? "芬兰语" : entry.language;
  const partOfSpeech = [...new Set([
    ...entry.meanings.map((m) => m.partOfSpeech),
    ...(entry.forms ?? []).map((form) => form.partOfSpeech),
  ].filter(Boolean))];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 border-b border-slate-100 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="text-2xl font-bold text-slate-900">{entry.word}</h2>
              <button
                type="button"
                onClick={() => setDetailsOpen((open) => !open)}
                aria-expanded={detailsOpen}
                className="text-xs text-brand-700"
              >
                {detailsOpen ? "收起详情" : "查看词形与例句"}
              </button>
            </div>
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
            pronunciations={entry.pronunciations}
          />
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

      {entry.forms?.length ? (
        <section className="mb-4 rounded-xl bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-800">词形信息</h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {entry.forms.map((form, index) => (
              <li key={`${form.lemma}-${form.grammaticalForm}-${index}`}>
                <span className="font-medium">{form.grammaticalForm}</span>
                {form.grammaticalNumber && <span> · {form.grammaticalNumber === "singular" ? "单数" : "复数"}</span>}
                <span> · {form.lemma} 的词形</span>
                {form.gloss && <span>：{form.gloss}</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {entry.meanings.length ? <ul className="space-y-4">
        <li>
          <p className="mb-2 text-xs font-medium text-slate-500">
            {entry.meanings.some((meaning) => meaning.definitionLanguage === "en") ? "英文释义" : "释义"}
          </p>
          <ol className="list-decimal space-y-3 pl-5">
            {entry.meanings.map((meaning, index) => (
              <li key={index}>
              <p className="text-slate-800">{meaning.text}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <EvidenceTag label={`语体：${meaning.register ? localizeRegister(meaning.register) : "未知"}`} />
                {meaning.usageFrequency && <EvidenceTag label={`频率：${localizeFrequency(meaning.usageFrequency)}`} />}
                {meaning.grammaticalForm && <EvidenceTag label={`语法形式：${meaning.grammaticalForm}`} />}
              </div>
              </li>
            ))}
          </ol>
        </li>
      </ul> : <p className="text-sm text-slate-600">该条目提供词形信息，暂无独立释义。</p>}

      <button
        type="button"
        onClick={onSaveEntry}
        disabled={saving || saved}
        className="mt-4 rounded-xl border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-default disabled:opacity-70"
      >
        {saving ? "正在加入…" : saved ? "已加入闪卡" : "＋ 加入闪卡"}
      </button>

      {detailsOpen && (
        <section className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            词形、例句与用法
          </h3>
          {entry.meanings.some((meaning) => meaning.grammaticalForm) && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {entry.meanings.filter((meaning) => meaning.grammaticalForm).map((meaning, index) => (
                <EvidenceTag key={`${meaning.grammaticalForm}-${index}`} label={`语法形式：${meaning.grammaticalForm}`} />
              ))}
            </div>
          )}
          <h4 className="mb-1 text-sm font-semibold text-slate-800">例句</h4>
          {entry.examples?.some((example) => example.kind === "sentence") ? (
            <ul className="space-y-3 text-sm">
              {entry.examples.filter((example) => example.kind === "sentence").slice(0, 5).map((ex, i) => (
                <li key={`sentence-${i}`}>
                  <p className="italic text-slate-950">&ldquo;{ex.text}&rdquo;</p>
                  {ex.translation && <p className="mt-1 text-slate-700">英文翻译：{ex.translation}</p>}
                  {ex.formOf && (
                    <p className="mt-1 text-xs text-slate-600">
                      词形关系：{ex.formOf} 是 {entry.word} 的 {ex.grammaticalForm ?? "词形变化"}
                      {ex.formSourceUrl && <a href={ex.formSourceUrl} target="_blank" rel="noreferrer" className="ml-1 text-brand-800 underline">词典来源</a>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">暂无例句</p>}
          {entry.examples?.some((example) => example.kind === "collocation") && (
            <div className="mt-4">
              <h4 className="mb-1 text-sm font-semibold text-slate-800">相关搭配</h4>
              <ul className="space-y-3 text-sm">
                {entry.examples.filter((example) => example.kind === "collocation").slice(0, 8).map((ex, i) => (
                  <li key={`collocation-${i}`}>
                    <p className="text-slate-950">{ex.text}</p>
                    {ex.translation && <p className="mt-1 text-slate-700">英文翻译：{ex.translation}</p>}
                    {ex.formOf && (
                      <p className="mt-1 text-xs text-slate-600">
                        词形关系：{ex.formOf} 是 {entry.word} 的 {ex.grammaticalForm ?? "词形变化"}
                        {ex.formSourceUrl && <a href={ex.formSourceUrl} target="_blank" rel="noreferrer" className="ml-1 text-brand-800 underline">词典来源</a>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </article>
  );
}

function localizeRegister(value: string): string {
  const key = value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, " ");
  const labels: Record<string, string> = {
    formal: "Formal · 正式",
    neutral: "Neutral · 中性",
    casual: "Casual · 非正式",
    informal: "Informal · 非正式",
    "casual / informal": "Casual / Informal · 非正式",
    slang: "Slang · 俚语",
    regional: "Regional · 地区性",
    literary: "Literary · 文学/书面",
    rare: "Rare · 罕见",
    archaic: "Archaic · 古旧",
    "rare / archaic": "Rare / Archaic · 罕见/古旧",
  };
  return labels[key] ?? value;
}

function localizeFrequency(value: string): string {
  const key = value.trim().toLocaleLowerCase();
  const labels: Record<string, string> = {
    everyday: "日常",
    common: "常用",
    frequent: "高频",
    uncommon: "不常见",
    rare: "罕见",
  };
  return labels[key] ?? value;
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
