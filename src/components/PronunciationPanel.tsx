import { useEffect, useRef, useState } from "react";
import {
  playPronunciation as startPronunciationPlayback,
  type PronunciationState,
} from "../features/dictionary/services/pronunciationService";
import { getFinnishPronunciationGuidance } from "../features/dictionary/pronunciationGuidance";
import type { Pronunciation } from "../types/word";

interface PronunciationPanelProps {
  word: string;
  language: string;
  ipa?: string;
  ipaSource?: string;
  audioUrl?: string;
  pronunciations?: Pronunciation[];
}

export function PronunciationPanel({
  word,
  language,
  ipa,
  ipaSource,
  audioUrl,
  pronunciations = [],
}: PronunciationPanelProps) {
  const cancelPlayback = useRef<(() => void) | undefined>(undefined);
  const [playback, setPlayback] = useState<PronunciationState | null>(null);
  const isFinnish = language === "fi";
  const speaking = playback?.status === "loading" || playback?.status === "playing";
  const guidance = isFinnish ? getFinnishPronunciationGuidance(word) : null;
  const records = pronunciations.length ? pronunciations : [{
    ipa: ipa ? [ipa] : undefined,
    audioUrl,
    source: ipaSource,
  }];
  const availableAudio = records.find((record) => record.audioUrl)?.audioUrl ?? audioUrl;

  useEffect(() => () => cancelPlayback.current?.(), [word, availableAudio]);

  function playPronunciation() {
    if (speaking) {
      cancelPlayback.current?.();
      cancelPlayback.current = undefined;
      setPlayback(null);
      return;
    }
    cancelPlayback.current = startPronunciationPlayback(
      { text: word, language, audioUrl: availableAudio },
      setPlayback,
    );
  }

  const showPanel = isFinnish || Boolean(audioUrl || ipa || pronunciations.length);
  if (!showPanel) return null;

  return (
    <section className="mt-3 rounded-xl bg-slate-50 p-3" aria-label="发音与音标">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={playPronunciation}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-600 bg-white px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50"
          aria-label={speaking ? "停止播放发音" : "播放发音"}
        >
          <SpeakerIcon />
          {speaking ? "停止播放" : "学习发音"}
        </button>
        {!records.some((record) => record.ipa?.length) && (
          <p className="text-sm text-slate-500">暂无音标</p>
        )}
      </div>

      {playback && (
        <p className="mt-2 text-xs text-slate-600" role="status" aria-live="polite">
          {playback.message}
        </p>
      )}

      {records.some((record) => record.ipa?.length || record.syllabification) && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {records.some((record) => record.ipa?.length) && (
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">IPA</p>
          )}
          {records.map((record, index) => (
            <div key={`${record.sourceUrl ?? record.source ?? "pronunciation"}-${index}`}>
              {record.ipa?.map((value) => (
                <p key={value} className="font-mono text-lg text-slate-900">{value}</p>
              ))}
              {record.syllabification && (
                <p className="text-sm text-slate-600">音节划分：<span className="font-mono">{record.syllabification}</span></p>
              )}
              {record.sourceUrl && (
                <p className="text-xs text-slate-500">
                  发音资料来源：<SourceLink href={record.sourceUrl}>{record.source ?? "词典"}</SourceLink>
                </p>
              )}
              {record.audioSourceUrl && (
                <p className="text-xs text-slate-500">
                  音频来源：<SourceLink href={record.audioSourceUrl}>{record.audioSource ?? "词典音频"}</SourceLink>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {isFinnish && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <h3 className="text-sm font-semibold text-slate-800">发音提示</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>
              {guidance?.stress.text}
              <SourceLink href={guidance!.stress.sourceUrl}>{guidance!.stress.source}</SourceLink>
            </li>
            {guidance?.tips.map((tip) => (
              <li key={tip.text}>
                {tip.text}
                <SourceLink href={tip.sourceUrl}>{tip.source}</SourceLink>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function SourceLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="ml-1 text-brand-800 underline">
      {children}
    </a>
  );
}

function SpeakerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" />
    </svg>
  );
}
