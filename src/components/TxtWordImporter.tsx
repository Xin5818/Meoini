import { useState } from "react";
import { getLanguageLabel, getSupportedDictionaryLanguages } from "../features/dictionary/dictionaryService";
import { getExistingWordKeys, importWordsAsFlashcards, lookupAndUpdateFlashcard, parseWordListDetailed } from "../features/import-export/txt";
import { loadSettings } from "../features/settings/settingsStore";
import { importFlashcardsFromCsv, parseFlashcardsFromCsv } from "../features/import-export/csv";
import type { Flashcard } from "../types/word";
import { DictionaryLookupProgress } from "./DictionaryLookupProgress";

const LOOKUP_CONCURRENCY = 2;

interface BatchProgress {
  total: number;
  pending: number;
  querying: number;
  found: number;
  notFound: number;
  failed: number;
}

export function TxtWordImporter({ onImported }: { onImported: () => Promise<void> }) {
  const [language, setLanguage] = useState(() => loadSettings().learningLanguage);
  const [words, setWords] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState(0);
  const [invalidLines, setInvalidLines] = useState<string[]>([]);
  const [existingCount, setExistingCount] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Flashcard[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  async function handleFile(file?: File) {
    setError("");
    setStatus("");
    setCsvPreview(null);
    setWords([]);
    setSelectedFile(file ?? null);
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "csv") {
      try {
        const cards = parseFlashcardsFromCsv(await file.text());
        setCsvPreview(cards);
        if (!cards.length) setError("CSV 中没有可导入的闪卡，请检查文件格式。");
      } catch {
        setError("读取 CSV 失败，请检查文件格式。");
      }
      return;
    }
    if (extension !== "txt") {
      setError("请选择 .csv 或 .txt 文件。");
      return;
    }
    if (!file.name.toLocaleLowerCase().endsWith(".txt") && file.type !== "text/plain") {
      setError("请选择 TXT 文本文件。");
      return;
    }
    try {
      const parsed = parseWordListDetailed(await file.text());
      setWords(parsed.words);
      setDuplicates(parsed.duplicateCount);
      setInvalidLines(parsed.invalidLines);
      const existing = await getExistingWordKeys(language);
      setExistingCount(parsed.words.filter((word) => existing.has(word.normalize("NFC").toLocaleLowerCase())).length);
      if (parsed.words.length === 0) setError("没有找到有效单词，请检查 TXT 文件内容或编码。");
    } catch {
      setWords([]);
      setError("读取 TXT 文件失败，请尝试使用 UTF-8 编码保存。");
    }
  }

  async function handleImport() {
    if ((!words.length && !csvPreview?.length) || busy) return;
    setBusy(true);
    setError("");
    try {
      if (selectedFile && csvPreview) {
        const count = await importFlashcardsFromCsv(await selectedFile.text());
        setStatus(`成功导入 ${count} 张 CSV 闪卡；同 ID 卡片按原有逻辑覆盖。`);
        setCsvPreview(null);
        setSelectedFile(null);
        await onImported();
        return;
      }
      const result = await importWordsAsFlashcards(words, language);
      setWords([]);
      setSelectedFile(null);
      setStatus("");
      await onImported();
      const initial: BatchProgress = {
        total: result.cards.length,
        pending: result.cards.length,
        querying: 0,
        found: 0,
        notFound: 0,
        failed: 0,
      };
      setBatchProgress(initial);
      let cursor = 0;
      let found = 0;
      let notFound = 0;
      let failed = 0;
      const worker = async () => {
        while (cursor < result.cards.length) {
          const card = result.cards[cursor++];
          setBatchProgress((current) => current ? {
            ...current,
            pending: Math.max(0, current.pending - 1),
            querying: current.querying + 1,
          } : current);
          let outcome: "found" | "not_found" | "error" = "error";
          try {
            outcome = await lookupAndUpdateFlashcard(card.id);
          } catch {
            outcome = "error";
          } finally {
            if (outcome === "found") found++;
            else if (outcome === "not_found") notFound++;
            else failed++;
            setBatchProgress((current) => current ? {
              ...current,
              querying: Math.max(0, current.querying - 1),
              found,
              notFound,
              failed,
            } : current);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, result.cards.length) }, worker));
      const remaining = result.cards.length - found - notFound - failed;
      setBatchProgress({ total: result.cards.length, pending: remaining, querying: 0, found, notFound, failed });
      setStatus(`本次导入报告：新增 ${result.imported} 张，跳过已有 ${result.existing} 个；成功 ${found}，查无释义 ${notFound}，失败 ${failed}，仍待查询 ${remaining}。`);
      await onImported();
    } catch {
      setError("保存闪卡失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function changeLanguage(next: string) {
    setLanguage(next);
    setStatus("");
    const existing = await getExistingWordKeys(next);
    setExistingCount(words.filter((word) => existing.has(word.normalize("NFC").toLocaleLowerCase())).length);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-800">导入 CSV / TXT</h2>
      <p className="mt-1 text-xs text-slate-500">CSV 还原完整闪卡；TXT 支持每行一个单词、Markdown 单列表格、逗号或分号分隔。TXT 导入后会逐个查询词典并保存释义。</p>
      <div className="mt-4"><DictionaryLookupProgress /></div>
      <label className="mt-3 block text-sm">
        <span className="text-slate-600">目标语言</span>
        <select value={language} onChange={(event) => void changeLanguage(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2">
          {getSupportedDictionaryLanguages().map((code) => <option key={code} value={code}>{getLanguageLabel(code)} ({code})</option>)}
        </select>
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-slate-600">选择 .csv 或 .txt 文件</span>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void handleFile(event.target.files?.[0])} className="w-full text-sm" />
      </label>

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {status && <p role="status" className="mt-3 text-sm text-brand-800">{status}</p>}
      {batchProgress && batchProgress.total > 0 && (
        <BatchProgressView progress={batchProgress} />
      )}
      {words.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">识别到 {words.length} 个不同单词</p>
          <p className="mt-1 text-xs text-slate-500">文件内重复 {duplicates} 个 · 词库已有 {existingCount} 个 · 无效行 {invalidLines.length} 行</p>
          <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {words.map((word) => <li key={word}>{word}</li>)}
          </ul>
          {invalidLines.length > 0 && (
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer">查看无效行</summary>
              <ul className="mt-1 list-inside list-disc">{invalidLines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul>
            </details>
          )}
          <button type="button" disabled={busy || words.length <= existingCount} onClick={() => void handleImport()} className="mt-3 w-full rounded-xl bg-brand-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "正在导入…" : `确认导入 ${words.length - existingCount} 张新闪卡`}
          </button>
        </div>
      )}
      {csvPreview && csvPreview.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">预览 {csvPreview.length} 张 CSV 闪卡</p>
          <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {csvPreview.slice(0, 30).map((card) => <li key={card.id}>{card.word} <span className="text-slate-500">({card.language}) — {card.meaning}</span></li>)}
          </ul>
          {csvPreview.length > 30 && <p className="mt-1 text-xs text-slate-500">另有 {csvPreview.length - 30} 张未显示</p>}
          <p className="mt-1 text-xs text-slate-500">CSV 保留文件中的语言和卡片内容，目标语言由 CSV 数据决定。</p>
          <button type="button" disabled={busy} onClick={() => void handleImport()} className="mt-3 w-full rounded-xl bg-brand-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "正在导入…" : `确认导入 ${csvPreview.length} 张闪卡`}
          </button>
        </div>
      )}
    </section>
  );
}

function BatchProgressView({ progress }: { progress: BatchProgress }) {
  const completed = progress.found + progress.notFound + progress.failed;
  const percent = Math.round((completed / progress.total) * 100);
  return (
    <div className="mt-4 rounded-xl bg-brand-50 p-3" aria-label="本次导入查询进度">
      <div className="flex justify-between text-xs font-medium text-brand-900"><span>本次导入查询</span><span>{percent}%</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} /></div>
      <p className="mt-2 text-xs text-brand-900">总数 {progress.total} · 待查询 {progress.pending} · 查询中 {progress.querying} · 成功 {progress.found} · 查无释义 {progress.notFound} · 失败 {progress.failed}</p>
    </div>
  );
}
