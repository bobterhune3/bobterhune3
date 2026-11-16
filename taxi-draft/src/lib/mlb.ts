type Split = { avg: string; ops: string; hr: string };
type StoredStats = { field: string; vsl: Split | null; vsr: Split | null };

type RawSplit = {
  numTeams?: number;
  team?: { name?: string };
  position?: { abbreviation?: string };
  split?: { code?: string };
  stat?: Record<string, unknown>;
};

function combined(splits: RawSplit[]): RawSplit | undefined {
  const combinedRow = splits.find((split) => split.numTeams && !split.team);
  if (combinedRow) return combinedRow;
  if (splits.length === 0) return undefined;
  return splits
    .slice()
    .sort(
      (a, b) =>
        Number(b.stat?.atBats ?? b.stat?.inningsPitched ?? 0) - Number(a.stat?.atBats ?? a.stat?.inningsPitched ?? 0),
    )[0];
}

function line(stat: Record<string, unknown> | undefined): Split | null {
  if (!stat) return null;
  const avg = stat.avg;
  const ops = stat.ops;
  const hr = stat.homeRuns;
  if (avg == null && ops == null && hr == null) return null;
  return {
    avg: avg == null || avg === "" ? "" : String(avg),
    ops: ops == null || ops === "" ? "" : String(ops),
    hr: hr == null || hr === "" ? "" : String(hr),
  };
}

function positionOf(split: RawSplit): string {
  const fromSplit = split.position?.abbreviation;
  const raw = split.stat?.position;
  if (fromSplit) return fromSplit;
  if (raw && typeof raw === "object" && "abbreviation" in raw) {
    const abbr = (raw as { abbreviation?: string }).abbreviation;
    if (abbr) return abbr;
  }
  if (typeof raw === "string") return raw;
  return "";
}

function fieldingLine(splits: RawSplit[]): string {
  const use = splits.some((split) => split.numTeams) ? splits.filter((split) => split.numTeams && !split.team) : splits;
  const totals = new Map<string, { games: number; errors: number }>();
  for (const split of use) {
    const pos = positionOf(split);
    if (!pos) continue;
    const games = Number(split.stat?.gamesPlayed ?? split.stat?.games ?? 0);
    const errors = Number(split.stat?.errors ?? 0);
    const current = totals.get(pos) ?? { games: 0, errors: 0 };
    current.games += Number.isFinite(games) ? games : 0;
    current.errors += Number.isFinite(errors) ? errors : 0;
    totals.set(pos, current);
  }
  return [...totals.entries()]
    .filter(([, value]) => value.games > 0)
    .sort((a, b) => b[1].games - a[1].games || a[0].localeCompare(b[0]))
    .map(([pos, value]) => `${pos} ${value.games}e${value.errors}`)
    .join(" · ");
}

type Person = { id?: number; stats?: { group?: { displayName?: string }; splits?: RawSplit[] }[] };

export function readPeople(payload: { people?: Person[] }, ids: string[]): Map<string, StoredStats> {
  const out = new Map<string, StoredStats>();
  for (const id of ids) out.set(id, { field: "", vsl: null, vsr: null });
  for (const person of payload.people ?? []) {
    const id = String(person.id ?? "");
    if (!out.has(id)) continue;
    const current = out.get(id)!;
    for (const group of person.stats ?? []) {
      const name = group.group?.displayName ?? "";
      const splits = group.splits ?? [];
      if (name === "fielding") {
        const field = fieldingLine(splits);
        if (field) current.field = field;
        continue;
      }
      if (name !== "hitting" && name !== "pitching") continue;
      for (const code of ["vl", "vr"] as const) {
        const matches = splits.filter((split) => split.split?.code === code);
        const chosen = combined(matches);
        const parsed = line(chosen?.stat);
        if (!parsed) continue;
        if (code === "vl") current.vsl = parsed;
        else current.vsr = parsed;
      }
    }
  }
  return out;
}

export async function fetchStats(ids: string[], season: number): Promise<Map<string, StoredStats>> {
  const joined = ids.join(",");
  const splitsUrl = `https://statsapi.mlb.com/api/v1/people?personIds=${joined}&hydrate=stats(group=[hitting,pitching],type=statSplits,sitCodes=[vl,vr],season=${season})`;
  const fieldUrl = `https://statsapi.mlb.com/api/v1/people?personIds=${joined}&hydrate=stats(group=[fielding],type=season,season=${season})`;
  const [splitsRes, fieldRes] = await Promise.all([fetch(splitsUrl), fetch(fieldUrl)]);
  if (!splitsRes.ok || !fieldRes.ok) throw new Error("MLB stats were not available.");
  const splits = readPeople((await splitsRes.json()) as { people?: Person[] }, ids);
  const fielding = readPeople((await fieldRes.json()) as { people?: Person[] }, ids);
  for (const [id, row] of fielding) {
    const target = splits.get(id);
    if (target && row.field) target.field = row.field;
  }
  return splits;
}

export function mergeStats(base: StoredStats | undefined, extra: StoredStats | undefined): string {
  const field = extra?.field || base?.field || "";
  const vsl = extra?.vsl || base?.vsl || null;
  const vsr = extra?.vsr || base?.vsr || null;
  if (!field && !vsl && !vsr) return "";
  return JSON.stringify({ field, vsl, vsr });
}
