export type PronunciationState =
  | { status: "loading"; message: string }
  | { status: "playing"; source: "dictionary" | "speech"; message: string }
  | { status: "finished"; message: string }
  | { status: "error"; message: string };

export interface PronunciationRequest {
  text: string;
  language: string;
  audioUrl?: string;
}

type OnStateChange = (state: PronunciationState) => void;

let cancelCurrent: (() => void) | undefined;

/** Plays dictionary audio first, then tries a matching system voice. */
export function playPronunciation(
  request: PronunciationRequest,
  onState: OnStateChange,
): () => void {
  cancelCurrent?.();

  let cancelled = false;
  let audio: HTMLAudioElement | undefined;
  let utterance: SpeechSynthesisUtterance | undefined;
  let voiceTimer: number | undefined;
  let playbackTimer: number | undefined;
  let voiceListener: (() => void) | undefined;
  let resolveVoiceWait: (() => void) | undefined;
  let usedSpeech = false;

  const emit = (state: PronunciationState) => {
    if (!cancelled) onState(state);
  };
  const cleanup = () => {
    resolveVoiceWait?.();
    resolveVoiceWait = undefined;
    if (voiceTimer !== undefined) window.clearTimeout(voiceTimer);
    if (playbackTimer !== undefined) window.clearTimeout(playbackTimer);
    if (voiceListener && "speechSynthesis" in window) {
      window.speechSynthesis.removeEventListener("voiceschanged", voiceListener);
    }
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (utterance && "speechSynthesis" in window) {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      window.speechSynthesis.cancel();
    }
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    cleanup();
    if (cancelCurrent === cancel) cancelCurrent = undefined;
  };
  cancelCurrent = cancel;

  const finish = (state: PronunciationState) => {
    emit(state);
    cancelled = true;
    cleanup();
    if (cancelCurrent === cancel) cancelCurrent = undefined;
  };

  const resolveFinnishVoice = async (
    synth: SpeechSynthesis,
  ): Promise<SpeechSynthesisVoice | undefined> => {
    let voices = synth.getVoices();
    if (voices.length === 0) {
      await new Promise<void>((resolve) => {
        resolveVoiceWait = resolve;
        voiceListener = () => resolve();
        synth.addEventListener("voiceschanged", voiceListener, { once: true });
        voiceTimer = window.setTimeout(resolve, 1_000);
      });
      if (cancelled) return undefined;
      if (voiceTimer !== undefined) window.clearTimeout(voiceTimer);
      if (voiceListener) synth.removeEventListener("voiceschanged", voiceListener);
      voiceListener = undefined;
      resolveVoiceWait = undefined;
      voiceTimer = undefined;
      voices = synth.getVoices();
    }

    const normalized = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().replaceAll("_", "-");
    return voices.find((voice) => normalized(voice) === "fi-fi") ??
      voices.find((voice) => normalized(voice) === "fi" || normalized(voice).startsWith("fi-"));
  };

  const speak = async (audioFailed: boolean) => {
    if (cancelled || usedSpeech) return;
    usedSpeech = true;
    if (audioFailed && audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    emit({
      status: "loading",
      message: audioFailed ? "词典原音不可用，正在准备芬兰语语音…" : "正在准备芬兰语语音…",
    });

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      finish({ status: "error", message: audioFailed ? "词典音频无法播放，当前浏览器也不支持系统语音。" : "当前浏览器不支持系统语音。" });
      return;
    }

    const synth = window.speechSynthesis;
    const isFinnish = request.language === "fi";
    let voice: SpeechSynthesisVoice | undefined;
    if (isFinnish) {
      voice = await resolveFinnishVoice(synth);
      if (cancelled) return;
      // If the platform lists voices but none is Finnish, do not pronounce the word
      // with an unrelated language voice. An empty list may still populate later,
      // so we make one fi-FI synthesis attempt after waiting for voiceschanged.
      if (synth.getVoices().length > 0 && !voice) {
        finish({ status: "error", message: "暂无可用的芬兰语系统语音。" });
        return;
      }
    } else {
      voice = synth.getVoices().find((item) => item.lang.toLowerCase().startsWith(request.language.toLowerCase()));
    }

    utterance = new SpeechSynthesisUtterance(request.text);
    utterance.lang = isFinnish ? "fi-FI" : request.language;
    utterance.rate = 0.85;
    if (voice) utterance.voice = voice;
    utterance.onstart = () => emit({
      status: "playing",
      source: "speech",
      message: `正在播放浏览器语音合成（${utterance?.lang}），不是词典原音。`,
    });
    utterance.onend = () => finish({ status: "finished", message: "语音播放完成。" });
    utterance.onerror = (event) => {
      const noVoice = event.error === "voice-unavailable" || event.error === "language-unavailable";
      finish({
        status: "error",
        message: noVoice ? "暂无可用的芬兰语系统语音。" : "语音播放失败，请重试。",
      });
    };
    playbackTimer = window.setTimeout(() => {
      finish({ status: "error", message: "语音播放超时，请重试。" });
    }, 20_000);
    synth.cancel();
    try {
      synth.speak(utterance);
    } catch {
      finish({ status: "error", message: "语音播放失败，请重试。" });
    }
  };

  if (request.audioUrl) {
    emit({ status: "loading", message: "正在加载词典原音…" });
    try {
      audio = new Audio(request.audioUrl);
    } catch {
      void speak(true);
      return cancel;
    }
    audio.preload = "none";
    audio.onplay = () => emit({ status: "playing", source: "dictionary", message: "正在播放词典原音。" });
    audio.onended = () => finish({ status: "finished", message: "词典原音播放完成。" });
    audio.onerror = () => void speak(true);
    playbackTimer = window.setTimeout(() => void speak(true), 12_000);
    void audio.play().catch(() => void speak(true));
  } else {
    void speak(false);
  }

  return cancel;
}

export function cancelPronunciation(): void {
  cancelCurrent?.();
}
