import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFlashcards, recoverExpiredDictionaryLookups } from "../db/database";
import { countFallbackFound, getDictionaryLookupPercent, getDictionaryLookupStats, getLookupCardsByStatus } from "../features/dictionary/lookupStats";
import { lookupAndUpdateFlashcard } from "../features/import-export/txt";
import type { Flashcard } from "../types/word";
import { withTimeout } from "../utils/withTimeout";

type RetryStatus = "pending" | "error" | "not_found";

export function DictionaryLookupProgress() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [running, setRunning] = useState<RetryStatus | null>(null);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      await withTimeout(recoverExpiredDictionaryLookups(), 8_000, "LOOKUP_RECOVERY_TIMEOUT");
      setCards(await withTimeout(getFlashcards(), 8_000, "LOOKUP_STATS_TIMEOUT"));
      setError("");
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => setError("读取本地词库状态失败。"));
    const timer = window.setInterval(() => {
      void refresh().catch(() => setError("读取本地词库状态失败。"));
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const stats = useMemo(() => getDictionaryLookupStats(cards), [cards]);
  const percent = getDictionaryLookupPercent(stats);
  const failedCards = useMemo(() => getLookupCardsByStatus(cards, "error"), [cards]);
  const notFoundCards = useMemo(() => getLookupCardsByStatus(cards, "not_found"), [cards]);
  const pendingCards = useMemo(() => getLookupCardsByStatus(cards, "pending"), [cards]);
  const queryingCards = useMemo(() => getLookupCardsByStatus(cards, "querying"), [cards]);
  const stalledCards = useMemo(() => queryingCards.filter((card) => card.lookupStartedAt && Date.now() - card.lookupStartedAt >= 30_000), [queryingCards]);

  async function retry(status: RetryStatus) {
    if (running) return;
    const candidates = getLookupCardsByStatus(cards, status);
    if (!candidates.length) return;
    setRunning(status);
    setReport("");
    setError("");
    let cursor = 0;
    let found = 0;
    let notFound = 0;
    let failed = 0;
    const worker = async () => {
      while (cursor < candidates.length) {
        const card = candidates[cursor++];
        try {
          const result = await lookupAndUpdateFlashcard(card.id);
          if (result === "found") found++;
          else if (result === "not_found") notFound++;
          else failed++;
        } catch {
          failed++;
        }
        await refresh().catch(() => undefined);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(2, candidates.length) }, worker));
      await refresh();
      setReport(`重试完成：成功 ${found}，查无释义 ${notFound}，失败 ${failed}。`);
    } catch {
      setError("重试任务未能完整完成；未完成的卡片仍保留原状态，可再次重试。");
    } finally {
      setRunning(null);
    }
  }

  async function copyWords(group: "error" | "not_found") {
    const items = group === "error" ? failedCards : notFoundCards;
    const content = items.map((card) => `${card.word}${card.lookupError ? `\t${lookupErrorLabel(card.lookupError)}` : ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(content);
      setReport(`已复制 ${items.length} 个${group === "error" ? "失败" : "查无释义"}单词。`);
    } catch {
      setError("无法访问剪贴板，请手动复制下方列表。");
    }
  }

  function downloadWords(group: "error" | "not_found") {
    const items = group === "error" ? failedCards : notFoundCards;
    const content = items.map((card) => `${card.word}${card.lookupError ? `\t${lookupErrorLabel(card.lookupError)}` : ""}`).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dictionary-${group}-words.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="词典查询进度">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">释义查询统计（本地词库）</h2>
        <span className="text-sm font-semibold text-slate-700">{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`查询完成 ${percent}%`}>
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="总数" value={stats.total} />
        <Stat label="待查询" value={stats.pending} />
        <Stat label="查询中" value={stats.querying} />
        <Stat label="查询成功" value={stats.found} />
        <Stat label="备用路径命中" value={countFallbackFound(cards)} />
        <Stat label="查无释义" value={stats.notFound} />
        <Stat label="查询失败" value={stats.failed} />
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <RetryButton label={`继续待查询 (${stats.pending})`} disabled={!stats.pending || Boolean(running)} busy={running === "pending"} onClick={() => void retry("pending")} />
        <RetryButton label={`重试失败 (${stats.failed})`} disabled={!stats.failed || Boolean(running)} busy={running === "error"} onClick={() => void retry("error")} />
        <RetryButton label={`重试未查到 (${stats.notFound})`} disabled={!stats.notFound || Boolean(running)} busy={running === "not_found"} onClick={() => void retry("not_found")} />
      </div>

      {report && <p role="status" className="mt-2 text-xs text-brand-800">{report}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error} <button type="button" disabled={refreshing} onClick={() => void refresh().catch(() => setError("读取本地词库状态失败或超时，请重试。"))} className="underline disabled:opacity-50">重试</button></p>}
      {stalledCards.length > 0 && <p className="mt-2 text-xs text-amber-800">有 {stalledCards.length} 个单词查询超过 30 秒；超过 2 分钟会自动恢复为待查询。</p>}
      {(failedCards.length > 0 || notFoundCards.length > 0 || pendingCards.length > 0 || queryingCards.length > 0) && (
        <details className="mt-3 text-xs text-slate-600">
          <summary className="cursor-pointer">查看待处理、查询中、失败与查无释义单词</summary>
          {pendingCards.length > 0 && <WordList title="待查询" cards={pendingCards} />}
          {queryingCards.length > 0 && <QueryingList cards={queryingCards} />}
          {failedCards.length > 0 && <ReportList title="查询失败" cards={failedCards} onCopy={() => void copyWords("error")} onDownload={() => downloadWords("error")} />}
          {notFoundCards.length > 0 && <ReportList title="查无释义" cards={notFoundCards} onCopy={() => void copyWords("not_found")} onDownload={() => downloadWords("not_found")} />}
        </details>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-2"><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 text-base font-semibold text-slate-900">{value}</dd></div>;
}

function RetryButton({ label, disabled, busy, onClick }: { label: string; disabled: boolean; busy: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "处理中…" : label}</button>;
}

function WordList({ title, cards }: { title: string; cards: Flashcard[] }) {
  return <div className="mt-2"><h3 className="font-semibold">{title}（{cards.length}）</h3><ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto">{cards.map((card) => <li key={card.id}>{card.word}{card.lookupError ? ` — ${lookupErrorLabel(card.lookupError)}` : ""}</li>)}</ul></div>;
}

function QueryingList({ cards }: { cards: Flashcard[] }) {
  return <div className="mt-2"><h3 className="font-semibold">查询中（{cards.length}）</h3><ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto">{cards.map((card) => {
    const elapsed = card.lookupStartedAt ? Math.max(0, Math.floor((Date.now() - card.lookupStartedAt) / 1000)) : 0;
    return <li key={card.id}>{card.word} — {elapsed} 秒</li>;
  })}</ul></div>;
}

function ReportList({ title, cards, onCopy, onDownload }: { title: string; cards: Flashcard[]; onCopy: () => void; onDownload: () => void }) {
  return <div className="mt-2"><div className="flex items-center gap-2"><h3 className="font-semibold">{title}（{cards.length}）</h3><button type="button" onClick={onCopy} className="text-brand-800 underline">复制</button><button type="button" onClick={onDownload} className="text-brand-800 underline">导出 TXT</button></div><ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto">{cards.map((card) => <li key={card.id}>{card.word}{card.lookupError ? ` — ${lookupErrorLabel(card.lookupError)}` : ""}</li>)}</ul></div>;
}

function lookupErrorLabel(error: string): string {
  if (error === "NETWORK") return "网络连接失败";
  if (error === "TIMEOUT" || error === "LOOKUP_TIMEOUT") return "请求超时";
  if (error === "RATE_LIMIT") return "词典限流";
  if (error === "PROVIDER_INVALID_RESPONSE") return "词典响应解析失败";
  if (error.startsWith("PROVIDER_")) return `词典服务异常（${error.replace("PROVIDER_", "HTTP ")}）`;
  return error;
}
