import { useEffect, useId, useRef, useState } from "react";
import {
  playPronunciation as startPronunciationPlayback,
  type PronunciationState,
} from "../features/dictionary/services/pronunciationService";
import { getFinnishPronunciationGuidance } from "../features/dictionary/pronunciationGuidance";
import { getUniqueIpaSources, shouldShowPronunciationPlaybackMessage } from "../features/dictionary/pronunciationDisplay";
import type { Pronunciation } from "../types/word";

interface PronunciationPanelProps {
  word: string;
  language: string;
  ipa?: string;
  ipaSource?: string;
  audioUrl?: string;
  pronunciations?: Pronunciation[];
  autoPlayOnMount?: boolean;
}

export function PronunciationPanel({
  word,
  language,
  ipa,
  ipaSource,
  audioUrl,
  pronunciations = [],
  autoPlayOnMount = false,
}: PronunciationPanelProps) {
  const cancelPlayback = useRef<(() => void) | undefined>(undefined);
  const guidanceCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const guidanceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const guidanceContainerRef = useRef<HTMLDivElement | null>(null);
  const [guidancePosition, setGuidancePosition] = useState({ top: 0, left: 0, maxHeight: 320 });
  const guidanceId = useId();
  const [playback, setPlayback] = useState<PronunciationState | null>(null);
  const [guidanceExpanded, setGuidanceExpanded] = useState(false);
  const isFinnish = language === "fi";
  const speaking = playback?.status === "loading" || playback?.status === "playing";
  const guidance = isFinnish ? getFinnishPronunciationGuidance(word) : null;
  const records = [ ...(ipa || audioUrl ? [{
    ipa: ipa ? [ipa] : undefined,
    audioUrl,
    source: ipaSource,
  }] : []), ...pronunciations ];
  const availableAudio = records.find((record) => record.audioUrl)?.audioUrl ?? audioUrl;
  const availableAudioUrls = records.find((record) => record.audioUrls?.length)?.audioUrls ?? (availableAudio ? [availableAudio] : []);
  const ipaValues = [...new Set(records.flatMap((record) => record.ipa ?? []).map((value) => value.trim()).filter(Boolean))];
  const uniqueIpaSources = getUniqueIpaSources([
    ...records.filter((record) => record.ipa?.length).map((record) => ({ source: record.source, sourceUrl: record.sourceUrl })),
    ...(ipa && ipaSource ? [{ source: ipaSource, sourceUrl: undefined }] : []),
  ]);
  const ipaSources = ipaValues.length && uniqueIpaSources.length === 0
    ? [{ source: "词典", sourceUrl: "https://en.wiktionary.org/" }]
    : uniqueIpaSources;
  const audioSources = [...new Map(records.filter((record) => record.audioSourceUrl)
    .map((record) => {
      const source = record.audioSource ?? "词典音频";
      return [source.normalize("NFC").toLocaleLowerCase(), { source, sourceUrl: record.audioSourceUrl! }] as const;
    })).values()];
  const hasGuidance = Boolean(guidance && (guidance.stress.text || guidance.tips.length));

  function keepGuidanceOpen() {
    if (guidanceCloseTimer.current) clearTimeout(guidanceCloseTimer.current);
    guidanceCloseTimer.current = undefined;
    setGuidanceExpanded(true);
  }

  function scheduleGuidanceClose() {
    if (guidanceCloseTimer.current) clearTimeout(guidanceCloseTimer.current);
    guidanceCloseTimer.current = setTimeout(() => {
      setGuidanceExpanded(false);
      guidanceCloseTimer.current = undefined;
    }, 120);
  }

  useEffect(() => {
    if (!guidanceExpanded) return;
    const positionPopover = () => {
      const trigger = guidanceTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const belowSpace = window.innerHeight - rect.bottom - 20;
      const aboveSpace = rect.top - 20;
      const below = belowSpace >= 200 || belowSpace >= aboveSpace;
      const availableHeight = Math.max(80, below ? belowSpace : aboveSpace);
      setGuidancePosition({
        top: below ? rect.bottom + 8 : Math.max(12, rect.top - availableHeight - 8),
        left: Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12),
        maxHeight: availableHeight,
      });
    };
    positionPopover();
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    return () => {
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
    };
  }, [guidanceExpanded]);

  useEffect(() => {
    if (!guidanceExpanded) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!guidanceContainerRef.current?.contains(event.target as Node)) {
        setGuidanceExpanded(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [guidanceExpanded]);

  useEffect(() => () => cancelPlayback.current?.(), [word, availableAudio]);

  useEffect(() => {
    if (!autoPlayOnMount) return;
    cancelPlayback.current = startPronunciationPlayback(
      { text: word, language, audioUrl: availableAudio, audioUrls: availableAudioUrls },
      setPlayback,
    );
  }, [autoPlayOnMount, word]);

  function playPronunciation() {
    if (speaking) {
      cancelPlayback.current?.();
      cancelPlayback.current = undefined;
      setPlayback(null);
      return;
    }
    cancelPlayback.current = startPronunciationPlayback(
      { text: word, language, audioUrl: availableAudio, audioUrls: availableAudioUrls },
      setPlayback,
    );
  }

  const showPanel = isFinnish || Boolean(audioUrl || ipa || pronunciations.length);
  if (!showPanel) return null;

  return (
    <section className="w-fit max-w-full rounded-xl bg-slate-50 p-3" aria-label="发音与音标">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={playPronunciation}
          className="inline-flex items-center justify-center rounded-lg border border-brand-600 bg-white p-2 text-brand-800 hover:bg-brand-50"
          aria-label={speaking ? "停止播放发音" : "播放发音"}
          title={speaking ? "停止播放发音" : "播放发音"}
        >
          <SpeakerIcon />
        </button>
        {ipaValues.length ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {ipaValues.map((value, index) => (
              <span key={`${value}-${index}`} className="font-mono text-base text-slate-900">{value}</span>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">暂无音标</p>}
        {records.find((record) => record.syllabification)?.syllabification && (
          <p className="text-sm text-slate-600">
            音节：{records.find((record) => record.syllabification)?.syllabification}
          </p>
        )}
        {isFinnish && hasGuidance && (
          <div
            ref={guidanceContainerRef}
            className="relative ml-auto"
            onMouseEnter={keepGuidanceOpen}
            onMouseLeave={scheduleGuidanceClose}
          >
            <button
              ref={guidanceTriggerRef}
              type="button"
              aria-label="查看发音提示"
              aria-expanded={guidanceExpanded}
              aria-controls={guidanceId}
              title="发音提示"
              onClick={(event) => {
                event.stopPropagation();
                setGuidanceExpanded((expanded) => !expanded);
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") setGuidanceExpanded(false);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <InfoIcon />
            </button>
            {guidanceExpanded && guidance && (
              <div
                id={guidanceId}
                role="dialog"
                aria-label={`${word} 发音提示`}
                onClick={(event) => event.stopPropagation()}
                onMouseEnter={keepGuidanceOpen}
                onMouseLeave={scheduleGuidanceClose}
                onKeyDown={(event) => event.stopPropagation()}
                className="fixed z-[100] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-xl"
                style={{ top: guidancePosition.top, left: guidancePosition.left, maxHeight: guidancePosition.maxHeight }}
              >
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    {guidance.stress.text}
                    <SourceLink href={guidance.stress.sourceUrl}>{guidance.stress.source}</SourceLink>
                  </li>
                  {guidance.tips.map((tip) => (
                    <li key={tip.text}>
                      {tip.text}
                      <SourceLink href={tip.sourceUrl}>{tip.source}</SourceLink>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      {shouldShowPronunciationPlaybackMessage(playback?.status) && playback && (
        <p className="mt-2 text-xs text-slate-600" role="status" aria-live="polite">
          {playback.message}
        </p>
      )}

      <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
        {ipaSources.map((source) => (
          <span key={`ipa-${source.source?.toLocaleLowerCase()}`}>
            IPA 来源：<SourceLink href={source.sourceUrl ?? "https://en.wiktionary.org/"}>{source.source ?? "词典"}</SourceLink>
          </span>
        ))}
        {audioSources.map((source) => (
          <span key={`audio-${source.source.toLocaleLowerCase()}`}>
            音频来源：<SourceLink href={source.sourceUrl}>{source.source}</SourceLink>
          </span>
        ))}
      </div>

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

function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7.25" />
      <path strokeLinecap="round" d="M10 9v4m0-6h.01" />
    </svg>
  );
}
