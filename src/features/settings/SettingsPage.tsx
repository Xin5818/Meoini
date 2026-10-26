import { useEffect, useState } from "react";
import { db } from "../../db/database";
import { getSupportedDictionaryLanguages } from "../dictionary/dictionaryService";
import {
  downloadTextFile,
  exportFlashcardsToCsv,
  importFlashcardsFromCsv,
} from "../import-export/csv";
import { loadSettings, saveSettings, type AppSettings } from "./settingsStore";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [cardCount, setCardCount] = useState(0);
  const [importStatus, setImportStatus] = useState<string | null>(null);

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

  async function handleImport(file: File | null) {
    if (!file) return;
    setImportStatus(null);
    try {
      const text = await file.text();
      const count = await importFlashcardsFromCsv(text);
      setCardCount(await db.flashcards.count());
      setImportStatus(`已导入 ${count} 张闪卡`);
    } catch {
      setImportStatus("导入失败，请检查 CSV 格式");
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
          第一版在线查词目前支持：{supported.join(", ")}
        </p>
        <select
          value={settings.learningLanguage}
          onChange={(e) => updateLanguage(e.target.value)}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="en">English (en)</option>
        </select>
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
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">从 CSV 导入（合并/覆盖同 id）</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleImport(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </label>
        {importStatus && (
          <p className="text-sm text-brand-800">{importStatus}</p>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">
        <h2 className="font-semibold text-slate-700">后续计划</h2>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Supabase 账户与云端同步</li>
          <li>可下载的多语言离线词库</li>
        </ul>
      </section>

      <section className="text-xs text-slate-400">
        <p>
          英语释义数据来自{" "}
          <a
            href="https://dictionaryapi.dev/"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Free Dictionary API
          </a>
          ，仅供学习用途，请遵守其服务条款。
        </p>
      </section>
    </div>
  );
}
