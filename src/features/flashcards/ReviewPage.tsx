import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getDueFlashcards, getFlashcards, saveFlashcard } from "../../db/database";
import type { Flashcard, ReviewRating } from "../../types/word";
import { applyReview } from "./review";
import { PronunciationPanel } from "../../components/PronunciationPanel";
import { getVisibleReviewItems } from "./reviewDisplay";
import { applyEarlyPractice, getEarlyReviewCards, getEarlyReviewDiagnostics, getReviewPlanStats, limitEarlyReviewCards, type EarlyReviewDiagnostic, type ReviewPlanStats } from "./reviewPlan";
import { withTimeout } from "../../utils/withTimeout";

type ReviewMode = "scheduled" | "early";
type EarlyLimit = 5 | 10 | 20 | "all";

export function ReviewPage() {
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [current, setCurrent] = useState<Flashcard | null>(null);
  const [revealed, setRevealed] = useState(false);
  // This flag is only for starting a review session. Initial plan loading has
  // its own state (`planLoading`); starting it as true disabled both entry buttons.
  const [loading, setLoading] = useState(false);
  const [showAllMeanings, setShowAllMeanings] = useState(false);
  const [showAllExamples, setShowAllExamples] = useState(false);
  const [showAllCollocations, setShowAllCollocations] = useState(false);
  const [planStats, setPlanStats] = useState<ReviewPlanStats>({ dueToday: 0, completedToday: 0, notDue: 0, newCards: 0, earlyAvailable: 0 });
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState("");
  const [sessionMode, setSessionMode] = useState<ReviewMode | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [earlyDiagnostics, setEarlyDiagnostics] = useState<EarlyReviewDiagnostic[]>([]);
  const [showEarlyOptions, setShowEarlyOptions] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const planRefreshInFlight = useRef(false);

  const refreshPlan = useCallback(async () => {
    if (planRefreshInFlight.current) return;
    planRefreshInFlight.current = true;
    setPlanLoading(true);
    try {
      const cards = await withTimeout(getFlashcards(), 10_000, "REVIEW_PLAN_TIMEOUT");
      setPlanStats(getReviewPlanStats(cards));
      setEarlyDiagnostics(getEarlyReviewDiagnostics(cards));
      setPlanError("");
    } catch (error) {
      setPlanError(error instanceof Error && error.message === "REVIEW_PLAN_TIMEOUT" ? "读取复习计划超时。" : "读取复习计划失败，请重试。");
    } finally {
      setPlanLoading(false);
      planRefreshInFlight.current = false;
    }
  }, []);

  function collapseReviewContent() {
    setShowAllMeanings(false);
    setShowAllExamples(false);
    setShowAllCollocations(false);
  }

  useEffect(() => {
    void refreshPlan();
    const timer = window.setInterval(() => void refreshPlan(), 5_000);
    const onFocus = () => void refreshPlan();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshPlan]);

  async function startScheduledReview() {
    setLoading(true);
    setSessionMessage("");
    try {
      const due = await withTimeout(getDueFlashcards(), 10_000, "REVIEW_LOAD_TIMEOUT");
      if (due.length) beginSession(due, "scheduled", crypto.randomUUID());
      else setSessionMessage("今天没有待复习的单词。");
    } catch (error) {
      setPlanError(error instanceof Error && error.message === "REVIEW_LOAD_TIMEOUT" ? "加载今日待复习单词超时，请重试。" : "加载今日待复习单词失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  async function startEarlyReview(limit: EarlyLimit) {
    setLoading(true);
    setSessionMessage("");
    try {
      const cards = await withTimeout(getFlashcards(), 10_000, "REVIEW_LOAD_TIMEOUT");
      setPlanStats(getReviewPlanStats(cards));
      const diagnostics = getEarlyReviewDiagnostics(cards);
      setEarlyDiagnostics(diagnostics);
      const candidates = getEarlyReviewCards(cards);
      const selected = limitEarlyReviewCards(candidates, limit);
      const nextSessionId = crypto.randomUUID();
      const candidateIds = new Set(candidates.map((card) => card.id));
      const selectedIds = new Set(selected.map((card) => card.id));
      console.info("[Meoini early review selection]", {
        sessionId: nextSessionId,
        totalCards: cards.length,
        candidateCount: candidates.length,
        selectedCount: selected.length,
        limit,
        cards: diagnostics.map((item) => ({
          ...item,
          dueAtLocal: new Date(item.dueAt).toLocaleString(),
          lastReviewedAtLocal: item.lastReviewedAt === undefined ? undefined : new Date(item.lastReviewedAt).toLocaleString(),
          reason: !item.eligible
            ? item.reason
            : selectedIds.has(item.id)
              ? item.reason
              : candidateIds.has(item.id)
                ? `候选但未选中：本轮数量限制为 ${limit}`
                : item.reason,
        })),
      });
      if (!selected.length) {
        setSessionMessage("目前没有可提前练习的单词。");
        return;
      }
      beginSession(selected, "early", nextSessionId);
      setShowEarlyOptions(false);
    } catch (error) {
      setPlanError(error instanceof Error && error.message === "REVIEW_LOAD_TIMEOUT" ? "加载提前复习单词超时，请重试。" : "加载提前复习单词失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  function beginSession(cards: Flashcard[], mode: ReviewMode, nextSessionId: string) {
    setQueue(cards);
    setCurrent(cards[0] ?? null);
    setSessionMode(mode);
    setSessionId(nextSessionId);
    setShowEarlyOptions(false);
    setSessionMessage("");
    setRevealed(false);
    collapseReviewContent();
  }

  async function returnToPlan() {
    setSessionMode(null);
    setSessionId(null);
    setQueue([]);
    setCurrent(null);
    setRevealed(false);
    setSessionMessage("");
    await refreshPlan();
  }

  async function rate(rating: ReviewRating) {
    if (!current || savingReview) return;
    const updated = sessionMode === "early" ? applyEarlyPractice(current) : applyReview(current, rating);
    setSavingReview(true);
    setReviewError("");
    try {
      await withTimeout(saveFlashcard(updated), 10_000, "REVIEW_SAVE_TIMEOUT");
      const rest = queue.filter((c) => c.id !== current.id);
      setQueue(rest);
      setCurrent(rest[0] ?? null);
      setRevealed(false);
      collapseReviewContent();
      await refreshPlan();
    } catch (error) {
      setReviewError(error instanceof Error && error.message === "REVIEW_SAVE_TIMEOUT" ? "保存复习结果超时，当前卡片保留，可重试评分。" : "保存复习结果失败，当前卡片保留，可重试评分。");
    } finally {
      setSavingReview(false);
    }
  }

  if (planLoading && planStats.dueToday === 0 && planStats.notDue === 0 && planStats.newCards === 0) return <div><p role="status" className="text-slate-500">加载复习计划…</p>{planError && <p role="alert" className="mt-2 text-sm text-red-700">{planError} <button type="button" onClick={() => void refreshPlan()} className="underline">重试</button></p>}</div>;

  const dictionaryEntry = current?.dictionaryEntry;
  const meanings: { text: string; grammaticalForm?: string }[] = dictionaryEntry?.meanings.length
    ? dictionaryEntry.meanings
    : current?.meaning ? current.meaning.split("；").filter(Boolean).map((text) => ({ text })) : [];
  const dictionarySentences = dictionaryEntry?.examples?.filter((example) => example.kind === "sentence") ?? [];
  const sentences = dictionarySentences.length ? dictionarySentences : current?.example ? [{ text: current.example, kind: "sentence" as const }] : [];
  const collocations = dictionaryEntry?.examples?.filter((example) => example.kind === "collocation") ?? [];
  const visibleMeanings = getVisibleReviewItems(meanings, 3, showAllMeanings);
  const visibleSentences = getVisibleReviewItems(sentences, 2, showAllExamples);
  const visibleCollocations = getVisibleReviewItems(collocations, 3, showAllCollocations);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{sessionMode ? "复习中" : "复习计划"}</h1>
        {sessionMode && <button type="button" onClick={() => void returnToPlan()} className="text-sm font-medium text-brand-700 underline">返回计划</button>}
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="复习计划概览">
        <h2 className="text-sm font-semibold text-slate-800">复习统计</h2>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PlanStat label="今日待复习" value={planStats.dueToday} />
          <PlanStat label="今日已完成" value={planStats.completedToday} />
          <PlanStat label="未到期单词" value={planStats.notDue} />
          <PlanStat label="待首次复习" value={planStats.newCards} />
        </dl>
        {!sessionMode && !planLoading && (
          <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium">
              提前复习筛选诊断：候选 {earlyDiagnostics.filter((item) => item.eligible).length} / {earlyDiagnostics.length} 张
            </summary>
            {earlyDiagnostics.length ? (
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {earlyDiagnostics.map((item) => (
                  <li key={item.id} className="border-t border-slate-200 pt-2">
                    <span className="font-medium text-slate-800">{item.word}</span> — {item.reason}
                    <span className="block text-[11px] text-slate-500">
                      dueAt {new Date(item.dueAt).toLocaleString()} · repetitions {item.repetitions} · lastReviewMode {item.lastReviewMode ?? "无"} · lastReviewedAt {item.lastReviewedAt === undefined ? "无" : new Date(item.lastReviewedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2">IndexedDB 中没有闪卡。</p>}
          </details>
        )}

        {!sessionMode && (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              disabled={loading || planStats.dueToday === 0}
              onClick={() => void startScheduledReview()}
              className="w-full rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "正在加载…" : `开始今日复习（${planStats.dueToday}）`}
            </button>
            <div>
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowEarlyOptions((open) => !open)}
                className="w-full rounded-xl border border-brand-700 px-4 py-3 text-sm font-semibold text-brand-800 disabled:opacity-50"
              >
                {showEarlyOptions ? "收起提前复习" : `提前复习（可选 ${planStats.earlyAvailable} 个）`}
              </button>
              {showEarlyOptions && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([5, 10, 20, "all"] as const).map((limit) => (
                    <button
                      key={limit}
                      type="button"
                      disabled={loading || planStats.earlyAvailable === 0}
                      onClick={() => void startEarlyReview(limit)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {limit === "all" ? `全部（${planStats.earlyAvailable}）` : `${limit} 个`}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">自由练习优先选择未复习的新单词，再选择未到期卡片；不会改变原定复习计划。</p>
            </div>
          </div>
        )}
      </section>

      {planError && <p role="alert" className="text-sm text-red-700">{planError} <button type="button" onClick={() => void refreshPlan()} className="font-medium underline">重试读取复习计划</button></p>}
      {reviewError && <p role="alert" className="text-sm text-red-700">{reviewError}</p>}
      {sessionMessage && !sessionMode && <p role="status" className="text-sm text-slate-600">{sessionMessage}</p>}
      {!sessionMode && planStats.dueToday === 0 && (
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <p className="font-medium text-slate-800">今天没有待复习的单词</p>
          <Link to="/" className="mt-2 inline-block text-sm text-brand-700 underline">去查词添加单词</Link>
        </div>
      )}

      {sessionId && sessionMode && !current && (
        <section key={sessionId} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center" role="status">
          <h2 className="font-semibold text-emerald-900">{sessionMode === "early" ? "提前练习完成" : "今日复习完成"}</h2>
          <p className="mt-1 text-sm text-emerald-800">复习统计已更新。</p>
          <button type="button" onClick={() => void returnToPlan()} className="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-900">返回复习计划</button>
        </section>
      )}
      {sessionMode && !current && sessionMessage && <p role="status" className="text-sm text-slate-600">{sessionMessage}</p>}

      {sessionMode && current && (
        <>
          <div className={`rounded-lg px-3 py-2 text-sm ${sessionMode === "early" ? "bg-sky-50 text-sky-900" : "bg-amber-50 text-amber-900"}`}>
            {sessionMode === "early" ? "提前复习 · 自由练习，不调整间隔计划" : "今日到期复习 · 评分将更新间隔计划"} · 剩余 {queue.length} 张
          </div>

      <div
        className="min-h-[280px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        onClick={() => !revealed && setRevealed(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) setRevealed(true);
        }}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {current.language}
        </p>
        <div className="mt-2">
          <p className="text-3xl font-bold text-slate-900">{current.word}</p>
        </div>

        {revealed && current.language === "fi" && (
          <div className="mt-3" onClick={(event) => event.stopPropagation()}>
            <PronunciationPanel
              word={current.word}
              language={current.language}
              ipa={current.dictionaryEntry?.pronunciation}
              ipaSource={current.dictionaryEntry?.pronunciationSource}
              audioUrl={current.dictionaryEntry?.pronunciationAudioUrl}
              pronunciations={current.dictionaryEntry?.pronunciations}
              autoPlayOnMount
            />
          </div>
        )}

        {!revealed ? (
          <p className="mt-8 text-center text-sm text-slate-400">
            点击显示释义
          </p>
        ) : (
          <div className="mt-6 max-h-[55vh] space-y-3 overflow-y-auto overscroll-contain border-t border-slate-100 pt-4 pr-1">
            {current.partOfSpeech && <p className="text-xs text-slate-500">{current.partOfSpeech}</p>}
            {meanings.length ? (
              <section aria-label="英文释义">
                <h3 className="text-sm font-semibold text-slate-800">英文释义</h3>
                <ol className="mt-1 list-decimal space-y-2 pl-5 text-sm text-slate-900 dark:text-slate-950">
                  {visibleMeanings.map((meaning, index) => (
                    <li key={`review-meaning-${index}`}>
                      <span>{meaning.text}</span>
                      {meaning.grammaticalForm && <span className="ml-1 text-xs text-slate-500">（{meaning.grammaticalForm}）</span>}
                    </li>
                  ))}
                </ol>
                {meanings.length > 3 && (
                  <ExpandButton
                    expanded={showAllMeanings}
                    expandLabel="展开全部释义"
                    collapseLabel="收起释义"
                    onClick={() => setShowAllMeanings((value) => !value)}
                  />
                )}
              </section>
            ) : (
              <p className="text-sm text-slate-500">
                {current.dictionaryEntry?.forms?.length ? "词形条目（见下方词形信息）" : current.lookupStatus === "not_found" ? "暂未找到释义" : current.lookupStatus === "error" ? "查询暂时失败，可稍后在词库重试" : current.lookupStatus === "querying" ? "释义查询中…" : current.lookupStatus === "pending" ? "待查询" : "待补充释义"}
              </p>
            )}
            {dictionaryEntry ? (
              <section className="space-y-3 border-t border-slate-100 pt-3">
                {dictionaryEntry.forms?.length ? (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">词形信息</h3>
                    <ul className="mt-1 space-y-1 text-sm text-slate-700">
                      {dictionaryEntry.forms.map((form, index) => (
                        <li key={`review-form-${index}`}>
                          {form.grammaticalForm}{form.grammaticalNumber ? ` · ${form.grammaticalNumber === "singular" ? "单数" : "复数"}` : ""} · {form.lemma} 的词形{form.gloss ? `：${form.gloss}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">例句</h3>
                  {sentences.length ? (
                    <ul className="mt-1 space-y-2">
                      {visibleSentences.map((example, index) => (
                        <li key={`review-sentence-${index}`}>
                          <p className="text-sm italic text-black dark:text-slate-950">&ldquo;{example.text}&rdquo;</p>
                          {example.translation && <p className="mt-1 text-sm text-slate-700 dark:text-slate-700">英文翻译：{example.translation}</p>}
                          {example.formOf && <p className="mt-1 text-xs text-slate-600">词形关系：{example.formOf} 是 {current.word} 的 {example.grammaticalForm ?? "词形变化"}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm text-slate-500">暂无例句</p>}
                  {sentences.length > 2 && (
                    <ExpandButton expanded={showAllExamples} expandLabel="查看全部例句" collapseLabel="收起例句" onClick={() => setShowAllExamples((value) => !value)} />
                  )}
                </div>
                {collocations.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">相关搭配</h3>
                    <ul className="mt-1 space-y-2">
                      {visibleCollocations.map((example, index) => (
                        <li key={`review-collocation-${index}`}>
                          <p className="text-sm text-black dark:text-slate-950">{example.text}</p>
                          {example.translation && <p className="mt-1 text-sm text-slate-700 dark:text-slate-700">英文释义：{example.translation}</p>}
                          {example.formOf && <p className="mt-1 text-xs text-slate-600">词形关系：{example.formOf} 是 {current.word} 的 {example.grammaticalForm ?? "词形变化"}</p>}
                        </li>
                      ))}
                    </ul>
                    {collocations.length > 3 && (
                      <ExpandButton expanded={showAllCollocations} expandLabel="查看全部搭配" collapseLabel="收起搭配" onClick={() => setShowAllCollocations((value) => !value)} />
                    )}
                  </div>
                )}
              </section>
            ) : current.example ? (
              <div className="border-t border-slate-100 pt-3">
                <h3 className="text-sm font-semibold text-slate-800">例句</h3>
                <p className="mt-1 text-sm italic text-black dark:text-slate-950">&ldquo;{current.example}&rdquo;</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {revealed && (
        <div className="grid grid-cols-3 gap-2">
          <RatingButton label={savingReview ? "保存中…" : "不会"} sub={sessionMode === "early" ? "只记录练习" : "稍后复习"} disabled={savingReview} onClick={() => void rate("again")} />
          <RatingButton label={savingReview ? "保存中…" : "有点印象"} sub={sessionMode === "early" ? "只记录练习" : "短间隔"} disabled={savingReview} onClick={() => void rate("hard")} />
          <RatingButton label={savingReview ? "保存中…" : "记得"} sub={sessionMode === "early" ? "只记录练习" : "延长间隔"} disabled={savingReview} onClick={() => void rate("good")} />
        </div>
      )}
        </>
      )}
    </div>
  );
}

function ExpandButton({
  expanded,
  expandLabel,
  collapseLabel,
  onClick,
}: {
  expanded: boolean;
  expandLabel: string;
  collapseLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className="mt-2 min-h-10 rounded-lg px-2 text-sm font-medium text-brand-700 underline underline-offset-2 dark:text-brand-700"
    >
      {expanded ? collapseLabel : expandLabel}
    </button>
  );
}

function PlanStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

function RatingButton({
  label,
  sub,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white py-3 text-center shadow-sm active:bg-slate-50 disabled:opacity-50"
    >
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <span className="block text-[10px] text-slate-400">{sub}</span>
    </button>
  );
}
