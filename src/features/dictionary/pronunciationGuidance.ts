export interface PronunciationTip {
  text: string;
  source: string;
  sourceUrl: string;
}

export interface PronunciationGuidance {
  stress: PronunciationTip;
  tips: PronunciationTip[];
}

const STRESS_SOURCE = "https://unstats.un.org/unsd/geoinfo/UNGEGN/docs/22-GEGN-Docs/wp/gegn22wp49.pdf";
const PHONETICS_SOURCE = "https://eurphon.info/languages/html?lang_id=27";

/** General Finnish pronunciation facts only; this never generates word-level IPA. */
export function getFinnishPronunciationGuidance(word: string): PronunciationGuidance {
  const lower = word.toLocaleLowerCase();
  const tips: PronunciationTip[] = [];

  if (lower.includes("y")) {
    tips.push({
      text: "y 是前圆唇元音：发音时舌位靠前，同时收圆嘴唇。",
      source: "EURPhon 芬兰语音系资料",
      sourceUrl: PHONETICS_SOURCE,
    });
  }
  if (lower.includes("ä")) {
    tips.push({
      text: "ä 是独立的前元音，和 a 是不同字母、不同发音；输入时请保留 ä。",
      source: "EURPhon 芬兰语音系资料",
      sourceUrl: PHONETICS_SOURCE,
    });
  }
  if (lower.includes("v")) {
    tips.push({
      text: "芬兰语 v 常用唇齿近音 [ʋ] 描写，发音可以比英语 v 少一些摩擦。",
      source: "EURPhon 芬兰语音系资料",
      sourceUrl: PHONETICS_SOURCE,
    });
  }

  return {
    stress: {
      text: "芬兰语主重音落在第一个音节。",
      source: "UNGEGN 芬兰地名发音资料",
      sourceUrl: STRESS_SOURCE,
    },
    tips,
  };
}
