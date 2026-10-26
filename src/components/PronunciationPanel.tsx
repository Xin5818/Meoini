import { useEffect, useRef, useState } from "react";

interface PronunciationPanelProps {
  word: string;
  language: string;
  ipa?: string;
  ipaSource?: string;
  audioUrl?: string;
}

const FINNISH_SOURCES = {
  stress: "https://unstats.un.org/unsd/geoinfo/UNGEGN/docs/22-GEGN-Docs/wp/gegn22wp49.pdf",
  vowels: "https://eurphon.info/languages/html?lang_id=27",
};

export function PronunciationPanel({
  word,
  language,
  ipa,
  ipaSource,
  audioUrl,
}: PronunciationPanelProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fallbackStarted = useRef(false);
  const [speaking, setSpeaking] = useState(false);
  const [message, setMessage] = useState("");
  const isFinnish = language === "fi";

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function speakWithBrowser() {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setSpeaking(false);
      setMessage("词典音频不可用；当前浏览器不支持语音合成。");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = isFinnish ? "fi-FI" : language;
    const voices = window.speechSynthesis.getVoices();
    const languageVoice = voices.find((voice) =>
      voice.lang.toLocaleLowerCase().startsWith(isFinnish ? "fi" : language.toLocaleLowerCase()),
    );
    if (isFinnish && voices.length > 0 && !languageVoice) {
      setSpeaking(false);
      setMessage("当前设备没有可用的芬兰语语音；请安装 fi-FI 语音后重试。");
      return;
    }
    if (languageVoice) utterance.voice = languageVoice;
    utterance.onstart = () => {
      setSpeaking(true);
      setMessage(`正在播放浏览器语音合成（${isFinnish ? "fi-FI" : language}），不是词典原音。`);
    };
    utterance.onend = () => {
      setSpeaking(false);
      setMessage("浏览器语音合成播放完成。");
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setMessage("浏览器语音合成失败；请检查设备是否安装芬兰语语音。");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function playPronunciation() {
    if (speaking) {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      setMessage("");
      return;
    }

    fallbackStarted.current = false;
    setMessage(audioUrl ? "正在加载词典原音…" : "正在尝试浏览器语音合成…");
    if (audioUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => useSpeechFallback());
    } else {
      speakWithBrowser();
    }
  }

  function useSpeechFallback() {
    if (fallbackStarted.current) return;
    fallbackStarted.current = true;
    setSpeaking(false);
    setMessage("词典原音不可播放，正在尝试浏览器语音合成…");
    speakWithBrowser();
  }

  const showPanel = isFinnish || Boolean(audioUrl || ipa);
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
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">IPA</p>
          {ipa ? (
            <p className="font-mono text-lg text-slate-900">{ipa}</p>
          ) : (
            <p className="text-sm text-slate-500">暂无音标</p>
          )}
        </div>
        {ipa && ipaSource && (
          <p className="text-xs text-slate-500">音标来源：{ipaSource}</p>
        )}
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="none"
          className="hidden"
          onPlay={() => {
            setSpeaking(true);
            setMessage("正在播放词典原音。");
          }}
          onEnded={() => {
            setSpeaking(false);
            setMessage("词典原音播放完成。");
          }}
          onError={useSpeechFallback}
        />
      )}

      {message && (
        <p className="mt-2 text-xs text-slate-600" role="status" aria-live="polite">
          {message}
        </p>
      )}

      {isFinnish && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <h3 className="text-sm font-semibold text-slate-800">发音提示</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>
              芬兰语主重音落在第一个音节。
              <SourceLink href={FINNISH_SOURCES.stress}>UNGEGN 芬兰地名发音资料</SourceLink>
            </li>
            {word.toLocaleLowerCase().includes("y") && (
              <li>
                y 是前圆唇元音：发音时舌位靠前，同时收圆嘴唇。
                <SourceLink href={FINNISH_SOURCES.vowels}>EURPhon 芬兰语音系资料</SourceLink>
              </li>
            )}
            {word.toLocaleLowerCase().includes("ä") && (
              <li>
                ä 是独立的前元音，和 a 是不同字母、不同发音；输入时请保留 ä。
                <SourceLink href={FINNISH_SOURCES.vowels}>EURPhon 芬兰语音系资料</SourceLink>
              </li>
            )}
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
