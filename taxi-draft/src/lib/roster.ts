export type RosterPlayer = {
  mlbid: string;
  first: string;
  last: string;
  kind: "P" | "PP";
  sortCode: string;
  playingTime: string;
  estAb: string;
  avlAb: string;
  som: string;
  org: string;
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function splitName(raw: string): { first: string; last: string } {
  const idx = raw.indexOf(",");
  if (idx < 0) return { first: "", last: raw.trim() };
  return { last: raw.slice(0, idx).trim(), first: raw.slice(idx + 1).trim() };
}

function headerIndex(header: string[], pattern: RegExp): number {
  return header.findIndex((cell) => pattern.test(cell.trim()));
}

export function playersFromCsv(text: string): RosterPlayer[] {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  let header: string[] | null = null;
  const players: RosterPlayer[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const cells = row.map((cell) => cell.trim());
    const looksLikeHeader = cells.some((cell) => /mlbid|mlb id/i.test(cell)) || cells[0]?.toLowerCase() === "kind";
    if (looksLikeHeader && cells[0]?.toUpperCase() !== "P" && cells[0]?.toUpperCase() !== "PP") {
      header = cells;
      continue;
    }
    let kind = "";
    let code = "";
    let org = "";
    let name = "";
    let playingTime = "";
    let sortCode = "";
    let mlbid = "";
    let estAb = "";
    let avlAb = "";
    let som = "";
    if (header) {
      const columns = header;
      const at = (pattern: RegExp) => {
        const index = headerIndex(columns, pattern);
        return index >= 0 ? cells[index] ?? "" : "";
      };
      kind = at(/^kind$|^type$|^a$/i) || cells[0] || "";
      code = at(/^code$|^roster/i) || cells[1] || "";
      org = at(/^org$/i);
      name = at(/^name$/i);
      playingTime = at(/playing/i);
      sortCode = at(/sort/i);
      mlbid = at(/mlbid|mlb id/i);
      estAb = at(/est ab/i);
      avlAb = at(/avl ab/i);
      som = at(/som/i);
    } else if (cells[0] === "P" || cells[0] === "PP") {
      kind = cells[0] ?? "";
      code = cells[1] ?? "";
      org = cells[2] ?? "";
      name = cells[3] ?? "";
      playingTime = cells[7] ?? "";
      sortCode = cells[9] ?? "";
      mlbid = cells[10] ?? "";
    } else continue;
    if ((kind !== "P" && kind !== "PP") || !/^\d+$/.test(mlbid)) continue;
    if (!code || "MBGN".includes(code.slice(-1))) continue;
    if (seen.has(mlbid)) continue;
    seen.add(mlbid);
    const { first, last } = splitName(name);
    if (!last || last === "AA" || last === "ZZZ") continue;
    players.push({
      mlbid,
      first,
      last,
      kind,
      sortCode,
      playingTime,
      estAb,
      avlAb,
      som,
      org,
    });
  }
  return players;
}

export function decodeRoster(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}
