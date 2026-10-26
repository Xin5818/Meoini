import { db, saveFlashcard } from "../../db/database";
import type { Flashcard } from "../../types/word";

const CSV_HEADERS = [
  "id",
  "word",
  "language",
  "meaning",
  "example",
  "tags",
  "createdAt",
  "dueAt",
  "intervalDays",
  "repetitions",
] as const;

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    rows.push(parseCsvLine(line));
  }
  return rows;
}

export async function exportFlashcardsToCsv(): Promise<string> {
  const cards = await db.flashcards.toArray();
  const header = CSV_HEADERS.join(",");
  const lines = cards.map((card) =>
    [
      card.id,
      card.word,
      card.language,
      card.meaning,
      card.example ?? "",
      card.tags.join("|"),
      String(card.createdAt),
      String(card.dueAt),
      String(card.intervalDays),
      String(card.repetitions),
    ]
      .map(escapeCsvField)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importFlashcardsFromCsv(text: string): Promise<number> {
  const rows = parseCsv(text);
  if (rows.length === 0) return 0;

  const header = rows[0].map((h) => h.trim());
  const hasHeader = header[0] === "id" || header[0] === "word";
  const dataRows = hasHeader ? rows.slice(1) : rows;

  let imported = 0;
  for (const row of dataRows) {
    const card = rowToFlashcard(row, header, hasHeader);
    if (!card) continue;
    await saveFlashcard(card);
    imported++;
  }
  return imported;
}

function rowToFlashcard(
  row: string[],
  header: string[],
  hasHeader: boolean,
): Flashcard | null {
  const get = (name: string, index: number) => {
    if (hasHeader) {
      const idx = header.indexOf(name);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    }
    return (row[index] ?? "").trim();
  };

  const word = get("word", 0);
  const meaning = get("meaning", 2);
  if (!word || !meaning) return null;

  const now = Date.now();
  const id = get("id", 0) || crypto.randomUUID();
  const language = get("language", 1) || "en";
  const example = get("example", 3) || undefined;
  const tagsRaw = get("tags", 4);
  const tags = tagsRaw ? tagsRaw.split("|").filter(Boolean) : [];

  const createdAt = Number(get("createdAt", 5)) || now;
  const dueAt = Number(get("dueAt", 6)) || now;
  const intervalDays = Number(get("intervalDays", 7)) || 0;
  const repetitions = Number(get("repetitions", 8)) || 0;

  return {
    id,
    word,
    language,
    meaning,
    example,
    tags,
    createdAt,
    dueAt,
    intervalDays,
    repetitions,
  };
}
