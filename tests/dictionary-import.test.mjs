import test from "node:test";
import assert from "node:assert/strict";
import { parseWordListDetailed } from "../src/features/import-export/wordListParser.ts";
import { applyDictionaryEntryToFlashcard, cleanDictionaryMeaning, createDictionaryFlashcard, repairStoredDictionaryMeaning } from "../src/features/dictionary/meaningProcessing.ts";
import { WiktionaryProvider } from "../src/features/dictionary/providers/wiktionaryProvider.ts";
import { lookupAndPersistFlashcard } from "../src/features/import-export/lookupFlashcard.ts";
import { parseDictionaryExample, parseFinnishFormRelation } from "../src/features/dictionary/exampleProcessing.ts";
import { countFallbackFound, getDictionaryLookupPercent, getDictionaryLookupStats, getLookupCardsByStatus } from "../src/features/dictionary/lookupStats.ts";
import { getVisibleReviewItems } from "../src/features/flashcards/reviewDisplay.ts";
import { getUniqueIpaSources, shouldShowPronunciationPlaybackMessage } from "../src/features/dictionary/pronunciationDisplay.ts";
import { getFinnishPronunciationGuidance } from "../src/features/dictionary/pronunciationGuidance.ts";
import { applyReview } from "../src/features/flashcards/review.ts";
import { applyEarlyPractice, getEarlyReviewCards, getEarlyReviewDiagnostics, getReviewPlanStats, limitEarlyReviewCards } from "../src/features/flashcards/reviewPlan.ts";

globalThis.DOMParser ??= class {
  parseFromString(html) {
    return { body: { textContent: html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() } };
  }
};

const baseCard = {
  id: "test-card",
  word: "hyvä",
  language: "fi",
  meaning: "",
  tags: [],
  createdAt: 1,
  dueAt: 1,
  intervalDays: 0,
  repetitions: 0,
  lookupStatus: "pending",
};

test("TXT import accepts Finnish words and skips Markdown separators and table markup", () => {
  const parsed = parseWordListDetailed("| Word |\n| --- |\n| hyvä |\r\n| haluat |\nkiitos, suomi; hyvää\n| <b>not-a-word</b> |");
  assert.deepEqual(parsed.words, ["hyvä", "haluat", "kiitos", "suomi", "hyvää"]);
  assert.equal(parsed.duplicateCount, 0);
  assert.equal(parsed.invalidLines.length, 1);
});

test("review display independently limits meanings, examples, and collocations without mutating source arrays", () => {
  const meanings = ["sense 1", "sense 2", "sense 3", "sense 4"];
  const examples = ["sentence 1", "sentence 2", "sentence 3"];
  const collocations = ["phrase 1", "phrase 2", "phrase 3", "phrase 4"];

  assert.deepEqual(getVisibleReviewItems(meanings, 3, false), meanings.slice(0, 3));
  assert.deepEqual(getVisibleReviewItems(examples, 2, false), examples.slice(0, 2));
  assert.deepEqual(getVisibleReviewItems(collocations, 3, false), collocations.slice(0, 3));
  assert.deepEqual(getVisibleReviewItems(meanings, 3, true), meanings);
  assert.deepEqual(getVisibleReviewItems(["one"], 3, false), ["one"]);
  assert.equal(meanings.length, 4);
  assert.equal(examples.length, 3);
  assert.equal(collocations.length, 4);
});

test("pronunciation sources deduplicate by label and finished playback messages stay hidden", () => {
  const sources = getUniqueIpaSources([
    { source: "Wiktionary", sourceUrl: undefined },
    { source: "IPA 来源：Wiktionary", sourceUrl: "https://en.wiktionary.org/wiki/hymyillä" },
    { source: "EURPhon", sourceUrl: "https://eurphon.info/languages/html?lang_id=27" },
  ]);
  assert.deepEqual(sources, [
    { source: "Wiktionary", sourceUrl: "https://en.wiktionary.org/wiki/hymyillä" },
    { source: "EURPhon", sourceUrl: "https://eurphon.info/languages/html?lang_id=27" },
  ]);
  assert.equal(shouldShowPronunciationPlaybackMessage("finished"), false);
  assert.equal(shouldShowPronunciationPlaybackMessage("playing"), true);
  assert.equal(shouldShowPronunciationPlaybackMessage("error"), true);
});

test("hymyillä pronunciation guidance links stress and front-vowel tips to references", () => {
  const guidance = getFinnishPronunciationGuidance("hymyillä");
  assert.match(guidance.stress.sourceUrl, /unstats\.un\.org.*UNGEGN/);
  assert.deepEqual(guidance.tips.map((tip) => tip.text), [
    "y 是前圆唇元音：发音时舌位靠前，同时收圆嘴唇。",
    "ä 是独立的前元音，和 a 是不同字母、不同发音；输入时请保留 ä。",
  ]);
  assert.ok(guidance.tips.every((tip) => /eurphon\.info/.test(tip.sourceUrl)));
});

test("review plan stats use saved card timestamps and local calendar days", () => {
  const now = new Date(2026, 5, 21, 12, 0, 0).getTime();
  const todayReview = new Date(2026, 5, 21, 8, 0, 0).getTime();
  const yesterdayReview = new Date(2026, 5, 20, 23, 59, 59).getTime();
  const cards = [
    { ...baseCard, id: "due", dueAt: now - 1, repetitions: 1, lastReviewedAt: todayReview },
    { ...baseCard, id: "new-due", dueAt: now, repetitions: 0 },
    { ...baseCard, id: "future-old", dueAt: now + 10_000, repetitions: 2, lastReviewedAt: yesterdayReview },
    { ...baseCard, id: "future-new", dueAt: now + 20_000, repetitions: 0 },
  ];
  assert.deepEqual(getReviewPlanStats(cards, now), {
    dueToday: 2,
    completedToday: 1,
    notDue: 2,
    newCards: 2,
    earlyAvailable: 3,
  });
  const early = getEarlyReviewCards(cards, now);
  assert.deepEqual(early.map((card) => card.id), ["new-due", "future-new", "future-old"]);
  assert.deepEqual(limitEarlyReviewCards(early, 2).map((card) => card.id), ["new-due", "future-new"]);
  assert.equal(limitEarlyReviewCards(early, "all").length, 3);
});

test("early practice preserves spaced-repetition schedule and counts a card once per local day", () => {
  const now = new Date(2026, 5, 21, 12, 0, 0).getTime();
  const card = { ...baseCard, id: "early", dueAt: now + 86_400_000, intervalDays: 7, repetitions: 3, earlyReviewCount: 1 };
  const first = applyEarlyPractice(card, now);
  const second = applyEarlyPractice(first, now + 1_000);
  assert.equal(second.dueAt, card.dueAt);
  assert.equal(second.intervalDays, card.intervalDays);
  assert.equal(second.repetitions, card.repetitions);
  assert.equal(second.earlyReviewCount, 3);
  assert.equal(getReviewPlanStats([second], now + 2_000).completedToday, 1);

  const scheduled = applyReview(card, "good", now);
  assert.equal(scheduled.lastReviewedAt, now);
  assert.equal(scheduled.lastReviewMode, "scheduled");
  assert.equal(scheduled.repetitions, card.repetitions + 1);
});

test("early-practiced new cards remain available for a fresh early session after reload", () => {
  const now = new Date(2026, 9, 26, 12, 0, 0).getTime();
  const newCard = { ...baseCard, id: "early-new", dueAt: now, intervalDays: 0, repetitions: 0 };
  const practiced = applyEarlyPractice(newCard, now);

  assert.equal(practiced.dueAt, newCard.dueAt);
  assert.equal(practiced.intervalDays, newCard.intervalDays);
  assert.equal(practiced.repetitions, newCard.repetitions);
  assert.deepEqual(getEarlyReviewCards([practiced], now + 1_000).map((card) => card.id), [newCard.id]);
  assert.equal(getReviewPlanStats([practiced], now + 1_000).completedToday, 1);
});

test("reloaded IndexedDB cards generate a new early-review candidate list", async () => {
  await import("fake-indexeddb/auto");
  const { db, getFlashcards } = await import("../src/db/database.ts");
  const now = Date.now();
  const card = { ...baseCard, id: "reload-early", dueAt: now - 1, repetitions: 0 };
  await db.flashcards.put(applyEarlyPractice(card, now));

  const reloadedCards = await getFlashcards();
  const candidates = getEarlyReviewCards(reloadedCards, now + 1_000);
  assert.deepEqual(candidates.map((item) => item.id), [card.id]);
  assert.equal(candidates[0].dueAt, card.dueAt);
  assert.equal(candidates[0].intervalDays, card.intervalDays);
  assert.equal(candidates[0].repetitions, card.repetitions);
  await db.flashcards.delete(card.id);
});

test("early review diagnostics explain why expired scheduled cards are excluded", () => {
  const now = 1_000_000;
  const dueScheduled = { ...baseCard, id: "due-scheduled", dueAt: now - 1, repetitions: 2, lastReviewMode: "scheduled", lastReviewedAt: now - 50_000 };
  const eligibleNew = { ...baseCard, id: "new", dueAt: now - 10_000, repetitions: 0 };
  const eligibleFuture = { ...baseCard, id: "future", dueAt: now + 10_000, repetitions: 2, lastReviewMode: "scheduled" };

  assert.deepEqual(getEarlyReviewDiagnostics([dueScheduled, eligibleNew, eligibleFuture], now).map((item) => ({
    id: item.id,
    eligible: item.eligible,
    reason: item.reason,
  })), [
    { id: "due-scheduled", eligible: false, reason: "排除：已经到期且不是待首次正式复习的新卡，应进入今日复习" },
    { id: "new", eligible: true, reason: "候选：尚未进入正式间隔复习" },
    { id: "future", eligible: true, reason: "候选：尚未到期" },
  ]);
});

test("ordinary gloss stays clean and mixed form-of content is rejected", () => {
  assert.equal(cleanDictionaryMeaning("<a>good</a>"), "good");
  assert.equal(
    cleanDictionaryMeaning("Verb; to want, desire, wish, crave; inflection of haluttaa: present active indicative connegative"),
    undefined,
  );
});

test("Wiktionary provider parses ordinary Finnish entries and keeps form-only entries", () => {
  const provider = new WiktionaryProvider();
  const regular = provider.parsePayload("hyvä", "fi", {
    fi: [{
      partOfSpeech: "Adjective",
      language: "Finnish",
      definitions: [
        { definition: "<a>good</a>" },
        { definition: "<a>good</a> <span>(useful for a particular purpose)</span>" },
        { definition: "<a>good</a> <style>.mw-parser-output .object-usage-tag{font-style:italic}</style><span>[with inessive or illative of third infinitive ‘at’]</span>" },
      ],
    }],
  });
  assert.deepEqual(regular.meanings.map((meaning) => meaning.text), [
    "good", "good (useful for a particular purpose)", "good",
  ]);
  assert.equal(regular.meanings[2].grammaticalForm, "with inessive or illative of third infinitive ‘at’");

  const inflectionOnly = provider.parsePayload("haluat", "fi", {
    fi: [{
      partOfSpeech: "Verb",
      language: "Finnish",
      definitions: [{ definition: "<span class=\"form-of-definition\">second-person singular present indicative of haluta</span>" }],
    }],
  });
  assert.equal(inflectionOnly.forms.length, 1);
  assert.deepEqual(inflectionOnly.forms[0], {
    lemma: "haluta",
    grammaticalForm: "second-person singular present indicative",
    grammaticalNumber: "singular",
    gloss: undefined,
    word: "haluat",
    partOfSpeech: "Verb",
    sourceUrl: "https://en.wiktionary.org/wiki/haluat#Finnish",
  });
});

test("real Wiktionary Finnish non-lemma payloads preserve form, lemma, grammar and gloss", () => {
  const provider = new WiktionaryProvider();
  const maanantaina = provider.parsePayload("maanantaina", "fi", {
    fi: [{ partOfSpeech: "Noun", language: "Finnish", definitions: [
      { definition: '<span class="form-of-definition use-with-mention"><a>essive</a> <a>singular</a> of <span class="form-of-definition-link"><i><a href="/wiki/maanantai#Finnish" title="maanantai">maanantai</a></i></span></span>: on <a>Monday</a>' },
      { definition: '<span class="form-of-definition use-with-mention"><a>essive</a> <a>plural</a> of <span class="form-of-definition-link"><i><a href="/wiki/maanantai#Finnish" title="maanantai">maanantai</a></i></span></span>' },
    ] }],
  });
  assert.equal(maanantaina.meanings[0].text, "on Monday");
  assert.equal(maanantaina.meanings[0].formOf, "maanantai");
  assert.deepEqual(maanantaina.forms.map(({ lemma, grammaticalForm, grammaticalNumber, gloss }) => ({ lemma, grammaticalForm, grammaticalNumber, gloss })), [
    { lemma: "maanantai", grammaticalForm: "essive singular", grammaticalNumber: "singular", gloss: "on Monday" },
    { lemma: "maanantai", grammaticalForm: "essive plural", grammaticalNumber: "plural", gloss: undefined },
  ]);

  const talossa = provider.parsePayload("talossa", "fi", {
    ca: [{ partOfSpeech: "Adjective", language: "Catalan", definitions: [{ definition: "feminine singular of talòs" }] }],
    fi: [{ partOfSpeech: "Noun", language: "Finnish", definitions: [
      { definition: '<span class="form-of-definition"><a>inessive</a> <a>singular</a> of <span class="form-of-definition-link"><a href="/wiki/talo#Finnish">talo</a></span></span>' },
    ] }],
  });
  assert.equal(talossa.meanings.length, 0);
  assert.equal(talossa.forms[0].lemma, "talo");
  assert.equal(talossa.forms[0].grammaticalForm, "inessive singular");

  const plainForm = provider.parsePayload("talossa", "fi", {
    fi: [{ partOfSpeech: "Noun", language: "Finnish", definitions: [{ definition: "inessive singular of talo" }] }],
  });
  assert.equal(plainForm.forms[0].lemma, "talo");
  assert.equal(plainForm.forms[0].grammaticalNumber, "singular");

  const puhun = provider.parsePayload("puhun", "fi", {
    fi: [{ partOfSpeech: "Verb", language: "Finnish", definitions: [{
      definition: '<span class="form-of-definition"><a>first-person</a> <a>singular</a> <a>present</a> <a>indicative</a> of <span class="form-of-definition-link"><a href="/wiki/puhua#Finnish">puhua</a></span></span>',
      parsedExamples: [{ example: "<b>Puhun</b> vähän suomea.", translation: "I speak a little Finnish." }],
    }] }],
    other: [{ partOfSpeech: "Noun", language: "Brunei Malay", definitions: [{ definition: "a tree" }] }],
  });
  assert.equal(puhun.forms[0].lemma, "puhua");
  assert.equal(puhun.forms[0].grammaticalForm, "first-person singular present indicative");
  assert.equal(puhun.examples[0].text, "Puhun vähän suomea.");
  assert.equal(puhun.examples[0].translation, "I speak a little Finnish.");
});

test("non-lemma lookup enriches with lemma meanings without replacing the queried form", async () => {
  const provider = new WiktionaryProvider();
  provider.fetchFinnishPronunciations = async () => [];
  const formEntry = provider.parsePayload("maanantaina", "fi", {
    fi: [{ partOfSpeech: "Noun", language: "Finnish", definitions: [{
      definition: '<span class="form-of-definition"><a>essive</a> <a>singular</a> of <span class="form-of-definition-link"><a href="/wiki/maanantai#Finnish">maanantai</a></span></span>: on Monday',
    }] }],
  });
  const lemmaEntry = provider.parsePayload("maanantai", "fi", {
    fi: [{ partOfSpeech: "Noun", language: "Finnish", definitions: [{ definition: "Monday" }] }],
  });
  const calls = [];
  provider.fetchEntry = async (word) => {
    calls.push(word);
    return word === "maanantaina" ? formEntry : word === "maanantai" ? lemmaEntry : null;
  };

  const [result] = await provider.search("maanantaina", "fi");
  assert.deepEqual(calls, ["maanantaina", "maanantai"]);
  assert.equal(result.word, "maanantaina");
  assert.ok(result.meanings.some((meaning) => meaning.text === "on Monday" && meaning.formOf === "maanantai"));
  assert.ok(result.meanings.some((meaning) => meaning.text === "Monday"));
  assert.equal(result.forms[0].lemma, "maanantai");
});

test("Wiktionary Finnish parser accepts Finnish aliases and rejects same-spelling other languages", () => {
  const provider = new WiktionaryProvider();
  const suomi = provider.parsePayload("suomi", "fi", {
    fi: [{ partOfSpeech: "Noun", language: "Finnish", definitions: [{ definition: "Finland" }] }],
  });
  assert.equal(suomi.meanings[0].text, "Finland");
  assert.equal(suomi.lookupDiagnostics.matchedLanguageKey, "fi");
  assert.equal(suomi.lookupDiagnostics.matchedLanguageLabel, "Finnish");

  const alternate = provider.parsePayload("hyvä", "fi", {
    suomi: [{ partOfSpeech: "Adjective", language: "suomi", definitions: [{ definition: "good" }] }],
    other: [{ partOfSpeech: "Adjective", language: "Ingrian", definitions: [{ definition: "pleasant" }] }],
  });
  assert.deepEqual(alternate.meanings.map((meaning) => meaning.text), ["good"]);
  assert.equal(alternate.lookupDiagnostics.fallbackUsed, true);
  assert.equal(provider.parsePayload("hyvä", "fi", {
    other: [{ partOfSpeech: "Adjective", language: "Ingrian", definitions: [{ definition: "pleasant" }] }],
  }), null);

  const oikein = provider.parsePayload("oikein", "fi", {
    fi: [{ partOfSpeech: "Adverb", language: "Finnish", definitions: [
      { definition: "correctly" }, { definition: "properly" },
    ] }],
  });
  assert.deepEqual(oikein.meanings.map((meaning) => meaning.text), ["correctly", "properly"]);
});

test("Wiktionary casing fallback only runs after exact miss and preserves failure versus empty", async () => {
  const provider = new WiktionaryProvider();
  provider.fetchFinnishPronunciations = async () => [];
  const calls = [];
  provider.fetchEntry = async (word) => {
    calls.push(word);
    if (word === "Hyvä") return null;
    if (word === "hyvä") return provider.parsePayload(word, "fi", {
      fi: [{ partOfSpeech: "Adjective", language: "Finnish", definitions: [{ definition: "good" }] }],
    });
    return null;
  };
  const entries = await provider.search("Hyvä", "fi");
  assert.deepEqual(calls, ["Hyvä", "hyvä"]);
  assert.equal(entries[0].meanings[0].text, "good");
  assert.equal(entries[0].lookupDiagnostics.fallbackUsed, true);
  assert.equal(entries[0].word, "Hyvä");

  provider.fetchEntry = async () => { throw new Error("NETWORK"); };
  await assert.rejects(provider.search("unknown", "fi"), /NETWORK/);
});

test("nukkua phrases are stored as collocations with dictionary translations, not sentences", () => {
  const provider = new WiktionaryProvider();
  const entry = provider.parsePayload("nukkua", "fi", {
    fi: [{
      partOfSpeech: "Verb",
      language: "Finnish",
      definitions: [
        {
          definition: "<span class=\"usage-label-sense\"></span> to <a>sleep</a>",
          parsedExamples: [
            { example: "laittaa <b>nukkumaan</b>", translation: "to put to bed, put to sleep" },
            { example: "mennä <b>nukkumaan</b>", translation: "to go to bed" },
          ],
          examples: ["laittaa <b>nukkumaan</b>", "mennä <b>nukkumaan</b>"],
        },
        {
          definition: "<span class=\"form-of-definition\">synonym of nukahtaa</span>",
          parsedExamples: [{ example: "present active indicative", translation: "grammar label" }],
        },
      ],
    }],
  });
  assert.deepEqual(entry.meanings.map((meaning) => meaning.text), ["to sleep"]);
  assert.deepEqual(entry.examples, [
    { text: "laittaa nukkumaan", translation: "to put to bed, put to sleep", translationLanguage: "en", kind: "collocation" },
    { text: "mennä nukkumaan", translation: "to go to bed", translationLanguage: "en", kind: "collocation" },
  ]);
  assert.equal(parseDictionaryExample("Hän meni nukkumaan.")?.kind, "sentence");
  assert.equal(parseDictionaryExample("Hän meni nukkumaan.")?.translation, undefined);
  assert.equal(parseDictionaryExample("to sleep", undefined, ["to sleep"]), undefined);
  assert.equal(parseDictionaryExample("<span class=\"form-of-definition\">present indicative of nukkua</span>"), undefined);
  assert.equal(parseDictionaryExample("third-person singular present indicative of nukkua"), undefined);
});

test("Wiktionary confirms nukkumaan as a form of nukkua before showing the relation", () => {
  const relation = parseFinnishFormRelation('<span class="form-of-definition">illative of third active infinitive of <a href="/wiki/nukkua#Finnish" title="nukkua">nukkua</a></span>');
  assert.deepEqual(relation, { formOf: "nukkua", grammaticalForm: "illative of third active infinitive" });
});

test("multiple valid senses are joined without grammatical form-only entries", () => {
  const entry = {
    word: "hyvä",
    language: "fi",
    meanings: [
      { text: "good", language: "fi", partOfSpeech: "Adjective" },
      { text: "useful for a particular purpose", language: "fi", partOfSpeech: "Adjective" },
      { text: "second-person singular present indicative of haluta", language: "fi", partOfSpeech: "Verb" },
    ],
  };
  const saved = applyDictionaryEntryToFlashcard(baseCard, entry);
  assert.equal(saved.meaning, "good；useful for a particular purpose");
  assert.equal(saved.dictionaryEntry.meanings.length, 2);
  assert.equal(saved.lookupStatus, "found");
});

test("one dictionary flashcard contains all senses and shared part-of-speech metadata", () => {
  const entry = {
    word: "oikein",
    language: "fi",
    meanings: [
      { text: "correctly", language: "fi", partOfSpeech: "Adverb" },
      { text: "rightly", language: "fi", partOfSpeech: "Adverb" },
      { text: "properly", language: "fi", partOfSpeech: "Adverb" },
    ],
  };
  const card = createDictionaryFlashcard(entry);
  assert.equal(card.meaning, "correctly；rightly；properly");
  assert.equal(card.partOfSpeech, "Adverb");
  assert.equal(card.dictionaryEntry.meanings.length, 3);
});

test("lookup task transitions through querying to success, no-result, and failure distinctly", async () => {
  const card = { ...baseCard, id: "state-test" };
  let stored = card;
  const storage = {
    get: async () => stored,
    lookup: async () => {
      assert.equal(stored.lookupStatus, "querying");
      return undefined;
    },
    put: async (next) => { stored = next; },
  };
  assert.equal(await lookupAndPersistFlashcard(card.id, storage), "not_found");
  assert.equal(stored.lookupStatus, "not_found");
  assert.equal(stored.meaning, "");

  storage.lookup = async () => { throw new Error("RATE_LIMIT"); };
  assert.equal(await lookupAndPersistFlashcard(card.id, storage), "error");
  assert.equal(stored.lookupStatus, "error");
  assert.equal(stored.lookupError, "RATE_LIMIT");

  storage.lookup = () => new Promise(() => {});
  assert.equal(await lookupAndPersistFlashcard(card.id, storage, 5), "error");
  assert.equal(stored.lookupError, "LOOKUP_TIMEOUT");
});

test("lookup statistics count unique saved cards by terminal state", () => {
  const stats = getDictionaryLookupStats([
    { ...baseCard, id: "p", word: "pending", lookupStatus: "pending" },
    { ...baseCard, id: "q", word: "querying", lookupStatus: "querying" },
    { ...baseCard, id: "f", word: "found", lookupStatus: "found" },
    { ...baseCard, id: "n", word: "notfound", lookupStatus: "not_found" },
    { ...baseCard, id: "e", word: "error", lookupStatus: "error" },
    { ...baseCard, id: "manual", word: "manual", lookupStatus: undefined, meaning: "manually entered" },
  ]);
  assert.deepEqual(stats, { total: 5, pending: 1, querying: 1, found: 1, notFound: 1, failed: 1 });
  assert.equal(getDictionaryLookupPercent(stats), 60);
});

test("lookup statistics do not count duplicate cards for the same language and word twice", () => {
  const duplicateFound = { ...baseCard, id: "duplicate-found", word: "hyvä", lookupStatus: "found" };
  const duplicatePending = { ...baseCard, id: "duplicate-pending", word: "HYVA\u0308", lookupStatus: "pending" };
  const stats = getDictionaryLookupStats([duplicateFound, duplicatePending]);
  assert.deepEqual(stats, { total: 1, pending: 0, querying: 0, found: 1, notFound: 0, failed: 0 });
  assert.equal(countFallbackFound([duplicateFound, {
    ...duplicatePending,
    lookupStatus: "found",
    dictionaryEntry: { lookupDiagnostics: { fallbackUsed: true } },
  }]), 1);
  assert.equal(getLookupCardsByStatus([duplicateFound, duplicatePending], "pending").length, 0);
});

test("form-only entries remain found and keep grammatical information without fabricated glosses", () => {
  const parsed = parseWordListDetailed("haluat");
  const importedCard = { ...baseCard, word: parsed.words[0] };
  const response = {
    word: "haluat",
    language: "fi",
    meanings: [{
      text: "<span class=\"form-of-definition\">second-person singular present indicative of haluta</span>",
      language: "fi",
      partOfSpeech: "Verb",
    }],
    forms: [{ word: "haluat", lemma: "haluta", grammaticalForm: "second-person singular present indicative", grammaticalNumber: "singular", partOfSpeech: "Verb" }],
  };
  const saved = applyDictionaryEntryToFlashcard(importedCard, response);
  assert.equal(saved.word, "haluat");
  assert.equal(saved.meaning, "");
  assert.equal(saved.lookupStatus, "found");
  assert.equal(saved.dictionaryEntry.forms[0].lemma, "haluta");
  const reviewFace = saved.meaning || (saved.dictionaryEntry.forms.length ? "词形条目（见下方词形信息）" : "暂未找到释义");
  assert.equal(reviewFace, "词形条目（见下方词形信息）");
});

test("legacy contaminated cards are repaired when loaded for review", () => {
  const legacy = {
    ...baseCard,
    word: "haluat",
    meaning: "Verb; to want, desire, wish, crave; inflection of haluttaa: present active indicative connegative",
    lookupStatus: "found",
    dictionaryEntry: {
      word: "haluat",
      language: "fi",
      meanings: [{
        text: "<span class=\"form-of-definition\">second-person singular present indicative of haluta</span>",
        language: "fi",
        partOfSpeech: "Verb",
      }],
    },
  };
  const repaired = repairStoredDictionaryMeaning(legacy);
  assert.equal(repaired.meaning, "");
  assert.equal(repaired.lookupStatus, "not_found");
  const reviewFace = repaired.meaning || (repaired.lookupStatus === "not_found" ? "暂未找到释义" : "待补充释义");
  assert.equal(reviewFace, "暂未找到释义");
});

test("TXT-imported Finnish entries persist clean meanings in the actual Dexie table", async () => {
  await import("fake-indexeddb/auto");
  const { db, saveFlashcardIfAbsent, getFlashcardByWord, recoverExpiredDictionaryLookups } = await import("../src/db/database.ts");
  await db.flashcards.clear();
  const provider = new WiktionaryProvider();
  const parsedWord = parseWordListDetailed("hyvä").words[0];
  const imported = { ...baseCard, id: "integration-hyva", word: parsedWord };
  await db.flashcards.put(imported);

  // This mirrors the Wiktionary REST shape: multiple lexical definitions and a grammatical usage note.
  const entry = provider.parsePayload("hyvä", "fi", {
    fi: [{
      partOfSpeech: "Adjective",
      language: "Finnish",
      definitions: [
        { definition: "<a>good</a>" },
        { definition: "<a>good</a> <span>(useful for a particular purpose)</span>" },
        { definition: "<a>good</a> <style>.mw-parser-output .object-usage-tag{font-style:italic}</style><span>[with inessive or illative of third infinitive ‘at’]</span>" },
      ],
    }],
  });
  const outcome = await lookupAndPersistFlashcard(imported.id, {
    get: (id) => db.flashcards.get(id),
    lookup: async () => entry ?? undefined,
    put: (card) => db.flashcards.put(card),
  });
  const saved = await db.flashcards.get(imported.id);
  const reviewFace = saved.meaning || (saved.lookupStatus === "not_found" ? "暂未找到释义" : "待补充释义");

  assert.equal(outcome, "found");
  assert.equal(saved.meaning, "good；good (useful for a particular purpose)；good");
  assert.equal(saved.meaning, reviewFace);
  assert.equal(saved.dictionaryEntry.meanings.length, 3);
  assert.equal(saved.dictionaryEntry.meanings[2].grammaticalForm, "with inessive or illative of third infinitive ‘at’");

  const inflectedWord = { ...baseCard, id: "integration-haluat", word: "haluat" };
  await db.flashcards.put(inflectedWord);
  const inflectionEntry = provider.parsePayload("haluat", "fi", {
    fi: [{
      partOfSpeech: "Verb",
      language: "Finnish",
      definitions: [{ definition: "<span class=\"form-of-definition use-with-mention\">second-person singular present indicative of haluta</span>" }],
    }],
  });
  assert.equal(inflectionEntry.forms[0].lemma, "haluta");
  const inflectionOutcome = await lookupAndPersistFlashcard(inflectedWord.id, {
    get: (id) => db.flashcards.get(id),
    lookup: async () => inflectionEntry ?? undefined,
    put: (card) => db.flashcards.put(card),
  });
  const savedInflection = await db.flashcards.get(inflectedWord.id);
  assert.equal(inflectionOutcome, "found");
  assert.equal(savedInflection.meaning, "");
  assert.equal(savedInflection.lookupStatus, "found");
  assert.equal(savedInflection.dictionaryEntry.forms[0].grammaticalForm, "second-person singular present indicative");

  const maanantainaCard = { ...baseCard, id: "integration-maanantaina", word: "maanantaina" };
  await db.flashcards.put(maanantainaCard);
  const maanantainaEntry = provider.parsePayload("maanantaina", "fi", {
    fi: [{ partOfSpeech: "Noun", language: "Finnish", definitions: [
      { definition: '<span class="form-of-definition"><a>essive</a> <a>singular</a> of <span class="form-of-definition-link"><a href="/wiki/maanantai#Finnish">maanantai</a></span></span>: on Monday' },
      { definition: '<span class="form-of-definition"><a>essive</a> <a>plural</a> of <span class="form-of-definition-link"><a href="/wiki/maanantai#Finnish">maanantai</a></span></span>' },
    ] }],
  });
  const maanantainaOutcome = await lookupAndPersistFlashcard(maanantainaCard.id, {
    get: (id) => db.flashcards.get(id),
    lookup: async () => maanantainaEntry ?? undefined,
    put: (card) => db.flashcards.put(card),
  });
  const savedMaanantaina = await db.flashcards.get(maanantainaCard.id);
  assert.equal(maanantainaOutcome, "found");
  assert.equal(savedMaanantaina.meaning, "on Monday");
  assert.equal(savedMaanantaina.dictionaryEntry.forms.length, 2);
  assert.equal(savedMaanantaina.dictionaryEntry.forms[0].lemma, "maanantai");

  const allMeanings = {
    word: "oikein",
    language: "fi",
    meanings: [
      { text: "correctly", language: "fi", partOfSpeech: "Adverb" },
      { text: "rightly", language: "fi", partOfSpeech: "Adverb" },
      { text: "properly", language: "fi", partOfSpeech: "Adverb" },
    ],
  };
  const firstSave = await saveFlashcardIfAbsent(createDictionaryFlashcard(allMeanings));
  const duplicateSave = await saveFlashcardIfAbsent(createDictionaryFlashcard(allMeanings));
  const savedOikein = await getFlashcardByWord("OIKEIN", "fi");
  assert.equal(firstSave.inserted, true);
  assert.equal(duplicateSave.inserted, false);
  assert.equal(savedOikein.meaning, "correctly；rightly；properly");

  const interrupted = { ...baseCard, id: "interrupted-lookup", lookupStatus: "querying", lookupStartedAt: 1 };
  await db.flashcards.put(interrupted);
  assert.equal(await recoverExpiredDictionaryLookups(200_000, 60_000), 1);
  assert.equal((await db.flashcards.get(interrupted.id)).lookupStatus, "pending");
});

test("nukkua examples and translations persist in Dexie for offline review", async () => {
  await import("fake-indexeddb/auto");
  const { db } = await import("../src/db/database.ts");
  await db.flashcards.clear();
  const provider = new WiktionaryProvider();
  const word = parseWordListDetailed("nukkua").words[0];
  const card = { ...baseCard, id: "integration-nukkua", word };
  await db.flashcards.put(card);
  const entry = provider.parsePayload("nukkua", "fi", {
    fi: [{
      partOfSpeech: "Verb",
      language: "Finnish",
      definitions: [{
        definition: "to sleep",
        parsedExamples: [{ example: "laittaa <b>nukkumaan</b>", translation: "to put to bed, put to sleep" }],
        examples: ["laittaa <b>nukkumaan</b>"],
      }],
    }],
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    fi: [{
      language: "Finnish",
      definitions: [{
        definition: '<span class="form-of-definition">illative of third active infinitive of <a href="/wiki/nukkua#Finnish">nukkua</a></span>',
      }],
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    await provider.enrichFinnishExampleForms(entry);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const result = await lookupAndPersistFlashcard(card.id, {
    get: (id) => db.flashcards.get(id),
    lookup: async () => entry ?? undefined,
    put: (updated) => db.flashcards.put(updated),
  });
  const saved = await db.flashcards.get(card.id);
  assert.equal(result, "found");
  assert.equal(saved.meaning, "to sleep");
  assert.equal(saved.example, undefined);
  assert.equal(saved.dictionaryEntry.examples[0].text, "laittaa nukkumaan");
  assert.equal(saved.dictionaryEntry.examples[0].kind, "collocation");
  assert.equal(saved.dictionaryEntry.examples[0].translation, "to put to bed, put to sleep");
  assert.equal(saved.dictionaryEntry.examples[0].formOf, "nukkua");
  assert.equal(saved.dictionaryEntry.examples[0].grammaticalForm, "illative of third active infinitive");
  await db.delete();
});
