export type CsvScreening = {
  name: string;
  email: string | null;
  matchPercent: number | null;
  status: string;
  summary: string | null;
  strengths: string[];
  gaps: string[];
};

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

function joinNotes(notes: string[]): string {
  return notes.join(" | ");
}

export function shortlistCsv(rows: CsvScreening[]): string {
  const header = ["Name", "Email", "Match %", "Status", "Summary", "Strengths", "Gaps"];
  const lines = [
    header.join(","),
    ...rows.map((row) => [
      row.name,
      row.email ?? "",
      row.matchPercent === null ? "" : String(row.matchPercent),
      row.status,
      row.summary ?? "",
      joinNotes(row.strengths),
      joinNotes(row.gaps),
    ].map(csvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
