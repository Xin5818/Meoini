import { useEffect, useState } from "react";
import { db } from "../../db/database";
import {
  getLanguageLabel,
  getSupportedDictionaryLanguages,
} from "../dictionary/dictionaryService";
import {
  downloadTextFile,
  exportFlashcardsToCsv,
} from "../import-export/csv";
import { TxtWordImporter } from "../../components/TxtWordImporter";
import { loadSettings, saveSettings, type AppSettings } from "./settingsStore";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [cardCount, setCardCount] = useState(0);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);

  useEffect(() => {
    void db.flashcards.count().then(setCardCount);
  }, []);

  function updateLanguage(learningLanguage: string) {
    setSettings(saveSettings({ learningLanguage }));
  }

  async function handleExport() {
    const csv = await exportFlashcardsToCsv();
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`meoini-flashcards-${date}.csv`, csv, "text/csv;charset=utf-8");
  }

  async function handleDeleteAllFlashcards() {
    if (!window.confirm("确定删除本地保存的全部闪卡吗？此操作无法撤销。")) return;
    setDeleteStatus(null);
    try {
      await db.flashcards.clear();
      setCardCount(0);
      setDeleteStatus("已删除全部本地闪卡。");
    } catch {
      setDeleteStatus("删除失败，请稍后重试。");
    }
  }

  const supported = getSupportedDictionaryLanguages();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">设置</h1>
        <p className="text-sm text-slate-500">本地数据与词典偏好</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">学习语言</h2>
        <p className="mt-1 text-xs text-slate-500">
          在线查词支持：{supported.map((c) => `${getLanguageLabel(c)} (${c})`).join("、")}
        </p>
        <select
          value={settings.learningLanguage}
          onChange={(e) => updateLanguage(e.target.value)}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {supported.map((code) => (
            <option key={code} value={code}>
              {getLanguageLabel(code)} ({code})
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-2xl border border-red-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-red-800">数据管理</h2>
        <p className="mt-1 text-xs text-slate-600">删除本地保存的所有闪卡，此操作无法撤销。</p>
        <button
          type="button"
          onClick={() => void handleDeleteAllFlashcards()}
          disabled={cardCount === 0}
          className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          删除全部闪卡
        </button>
        {deleteStatus && <p className="mt-2 text-sm text-slate-600" role="status">{deleteStatus}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">本地存储</h2>
        <p className="mt-2 text-sm text-slate-600">
          已保存闪卡：<strong>{cardCount}</strong> 张（IndexedDB）
        </p>
        <p className="mt-2 text-xs text-slate-500">
          断网后仍可复习已保存卡片。浏览器清除站点数据会删除本地闪卡，请定期导出备份。
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">导入 / 导出</h2>
        <button
          type="button"
          onClick={() => void handleExport()}
          className="w-full rounded-xl bg-brand-700 py-2.5 text-sm font-semibold text-white"
        >
          导出 CSV
        </button>
        <TxtWordImporter onImported={async () => setCardCount(await db.flashcards.count())} />
      </section>

      <section className="rounded-2xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">
        <h2 className="font-semibold text-slate-700">后续计划</h2>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Supabase 账户与云端同步</li>
          <li>可下载的多语言离线词库</li>
        </ul>
      </section>

      <section className="text-xs text-slate-400 space-y-2">
        <p>
          英语：{" "}
          <a
            href="https://dictionaryapi.dev/"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Free Dictionary API
          </a>
        </p>
        <p>
          芬兰语及联想：{" "}
          <a
            href="https://www.wiktionary.org/"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Wiktionary
          </a>
          （CC BY-SA）
        </p>
      </section>
    </div>
  );
}
