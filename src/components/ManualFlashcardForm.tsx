import { useState, type FormEvent } from "react";

interface ManualFlashcardFormProps {
  initialWord: string;
  language: string;
  onSave: (data: { word: string; meaning: string; example?: string }) => void;
  onCancel?: () => void;
}

export function ManualFlashcardForm({
  initialWord,
  language,
  onSave,
  onCancel,
}: ManualFlashcardFormProps) {
  const [word, setWord] = useState(initialWord);
  const [meaning, setMeaning] = useState("");
  const [example, setExample] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!word.trim() || !meaning.trim()) return;
    onSave({
      word: word.trim(),
      meaning: meaning.trim(),
      example: example.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="font-semibold text-slate-900">手动创建闪卡</h3>
      <p className="mt-1 text-xs text-slate-500">
        语言：{language} · 词典未收录时也可继续学习
      </p>
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="text-slate-600">单词</span>
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">释义</span>
          <textarea
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">例句（可选）</span>
          <input
            value={example}
            onChange={(e) => setExample(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 py-2 text-sm"
          >
            取消
          </button>
        )}
        <button
          type="submit"
          className="flex-1 rounded-xl bg-brand-700 py-2 text-sm font-semibold text-white"
        >
          保存闪卡
        </button>
      </div>
    </form>
  );
}
