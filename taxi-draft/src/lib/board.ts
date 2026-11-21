import { sql, tx } from "./db";
import { ready } from "./seed";
import { schedule, type Slot, type SlotTeam } from "./order";
import { displayName, posInfo } from "./positions";
import { draftPageUrl, messageFor, onePerManager, sendMail } from "./mail";
import { fetchStats, mergeStats } from "./mlb";
import { decodeRoster, playersFromCsv } from "./roster";
import type { Board, Clock, PickRow, PlayerCard, SettingsPayload, SplitLine, TeamRow } from "./types";
import { passphraseConfigured } from "./auth";

type Settings = {
  active: string;
  season: number;
  rounds_national: number;
  rounds_american: number;
  rounds_federal: number;
  started: number;
};

type TeamRecord = TeamRow & { sortOrder: number };

type PlayerRecord = {
  mlbid: string;
  first_name: string;
  last_name: string;
  kind: "P" | "PP";
  sort_code: string;
  playing_time: string;
  est_ab: string;
  avl_ab: string;
  som: string;
  stats: string;
};

const PAGE = 10;
let cacheRunning = false;

function num(value: unknown): number {
  return Number(value ?? 0);
}

async function settings(): Promise<Settings> {
  const rows = await sql<Settings>("select active, season, rounds_national, rounds_american, rounds_federal, started from draft_settings where id = 1");
  return rows[0] ?? { active: "off", season: 2026, rounds_national: 4, rounds_american: 3, rounds_federal: 2, started: 0 };
}

async function teams(): Promise<TeamRecord[]> {
  const rows = await sql<TeamRecord>(
    "select abbr, name, manager, league, email, logo_url as \"logoUrl\", sort_order as \"sortOrder\" from teams where draft = 'taxi' order by sort_order, abbr",
  );
  return rows.map((row) => ({ ...row, sortOrder: num(row.sortOrder) }));
}

function capsOf(row: Settings) {
  return { national: num(row.rounds_national), american: num(row.rounds_american), federal: num(row.rounds_federal) };
}

function slotsFor(list: TeamRecord[], row: Settings): Slot[] {
  const teamsForOrder: SlotTeam[] = list.map((team) => ({
    abbr: team.abbr,
    name: team.name,
    manager: team.manager,
    league: team.league,
    sortOrder: team.sortOrder,
  }));
  return schedule(teamsForOrder, capsOf(row));
}

function parseSplit(value: unknown): SplitLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as SplitLine;
  if (!row.avg && !row.ops && !row.hr) return null;
  return { avg: row.avg ?? "", ops: row.ops ?? "", hr: row.hr ?? "" };
}

function card(player: PlayerRecord): PlayerCard {
  let field = "";
  let vsl: SplitLine | null = null;
  let vsr: SplitLine | null = null;
  if (player.stats) {
    try {
      const parsed = JSON.parse(player.stats) as { field?: string; vsl?: SplitLine; vsr?: SplitLine };
      field = parsed.field ?? "";
      vsl = parseSplit(parsed.vsl);
      vsr = parseSplit(parsed.vsr);
    } catch {
      field = "";
    }
  }
  const info = posInfo(player.sort_code);
  const time = player.est_ab && player.avl_ab ? `EST ${player.est_ab} · AVL ${player.avl_ab}` : player.playing_time;
  return {
    mlbid: player.mlbid,
    name: displayName(player.first_name, player.last_name),
    pos: info.abbr,
    kind: player.kind,
    rating: player.som,
    field,
    playingTime: time,
    timeLabel: player.kind === "P" ? "IP" : "AB",
    vsl,
    vsr,
  };
}

async function pickedRows(list: TeamRecord[]): Promise<PickRow[]> {
  const picks = await sql<{ pick_number: number; round: number; team_abbr: string; mlbid: string; first_name: string; last_name: string; sort_code: string }>(
    `select k.pick_number, k.round, k.team_abbr, k.mlbid, p.first_name, p.last_name, p.sort_code
     from picks k join players p on p.draft = k.draft and p.mlbid = k.mlbid
     where k.draft = 'taxi' order by k.pick_number desc`,
  );
  const byAbbr = new Map(list.map((team) => [team.abbr, team]));
  return picks.map((pick) => {
    const team = byAbbr.get(pick.team_abbr);
    return {
      pick: num(pick.pick_number),
      round: num(pick.round),
      abbr: pick.team_abbr,
      team: team?.name ?? pick.team_abbr,
      manager: team?.manager ?? "",
      mlbid: pick.mlbid,
      name: displayName(pick.first_name, pick.last_name),
      pos: posInfo(pick.sort_code).abbr,
    };
  });
}

function clockFor(row: Settings, slots: Slot[], made: number, list: TeamRecord[]): Clock {
  const closed = row.active !== "taxi";
  const current = slots[made];
  const next = slots[made + 1];
  if (closed) {
    return {
      closed: true,
      started: false,
      finished: false,
      manager: "",
      team: "",
      abbr: "",
      league: "",
      round: 0,
      pick: 0,
      nextManager: "",
      nextTeam: "",
      endsAfter: false,
      message: row.active === "oifu" ? "OIFU is not part of this build. The Taxi Squad draft is closed." : "The Taxi Squad draft is closed.",
    };
  }
  if (!current && row.started !== 1) {
    const ordered = list.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.abbr.localeCompare(b.abbr));
    const first = ordered[0];
    const second = ordered[1];
    if (first) {
      return {
        closed: false,
        started: false,
        finished: false,
        manager: first.manager,
        team: first.name,
        abbr: first.abbr,
        league: first.league,
        round: 1,
        pick: 1,
        nextManager: second?.manager ?? "",
        nextTeam: second?.name ?? "",
        endsAfter: !second,
        message: "Not started",
      };
    }
  }
  if (!current) {
    return {
      closed: false,
      started: row.started === 1,
      finished: true,
      manager: "",
      team: "",
      abbr: "",
      league: "",
      round: 0,
      pick: made,
      nextManager: "",
      nextTeam: "",
      endsAfter: false,
      message: "The draft is complete.",
    };
  }
  return {
    closed: false,
    started: row.started === 1,
    finished: false,
    manager: current.team.manager,
    team: current.team.name,
    abbr: current.team.abbr,
    league: current.team.league,
    round: current.round,
    pick: current.pick,
    nextManager: next?.team.manager ?? "",
    nextTeam: next?.team.name ?? "",
    endsAfter: !next,
    message: row.started === 1 ? "" : "Not started",
  };
}

export async function getBoard(input: { q: string; filter: string; page: number }): Promise<Board> {
  await ready();
  const row = await settings();
  const list = await teams();
  const slots = slotsFor(list, row);
  const madeRows = await pickedRows(list);
  const made = madeRows.length;
  const players = await sql<PlayerRecord>(
    `select mlbid, first_name, last_name, kind, sort_code, playing_time, est_ab, avl_ab, som, stats
     from players where draft = 'taxi' and mlbid not in (select mlbid from picks where draft = 'taxi')`,
  );
  const q = input.q.trim().toLowerCase();
  const searching = q.length >= 3;
  const filtered = players.filter((player) => {
    if (searching) {
      const first = player.first_name.toLowerCase();
      const last = player.last_name.toLowerCase();
      return `${first} ${last}`.includes(q) || `${last} ${first}`.includes(q);
    }
    if (!input.filter || input.filter === "All") return true;
    return posInfo(player.sort_code).filters.includes(input.filter);
  });
  filtered.sort((a, b) => a.last_name.localeCompare(b.last_name, "en") || a.first_name.localeCompare(b.first_name, "en"));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(Math.max(1, input.page), pageCount);
  const slice = filtered.slice((page - 1) * PAGE, page * PAGE);
  const mail = await sql<{ n: number }>("select count(*)::int as n from email_log where draft = 'taxi' and error <> ''");
  return {
    active: row.active,
    passphraseConfigured: passphraseConfigured(),
    availableCount: players.length,
    matchCount: filtered.length,
    page,
    pageCount,
    filter: searching ? "All" : input.filter || "All",
    q: input.q,
    clock: clockFor(row, slots, made, list),
    players: slice.map(card),
    picks: madeRows,
    mailProblem: num(mail[0]?.n) > 0,
  };
}

function clean(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function cleanLogo(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return url.toString().slice(0, 400);
  } catch {
    return "";
  }
}

function pageUrl(): string {
  return draftPageUrl();
}

async function recipients(): Promise<{ manager: string; email: string }[]> {
  const rows = await sql<{ manager: string; email: string }>(
    "select manager, email from teams where draft = 'taxi' and email <> '' order by sort_order, abbr",
  );
  return onePerManager(rows);
}

async function recordMail(pickNumber: number, error: string): Promise<void> {
  await sql(
    `insert into email_log (draft, pick_number, sent_at, error) values ('taxi', $1, $2, $3)
     on conflict (draft, pick_number) do update set sent_at = excluded.sent_at, error = excluded.error`,
    [pickNumber, error ? "" : new Date().toISOString(), error],
  );
}

async function sendForSlot(slot: Slot | undefined, history: PickRow[], _request: Request, logPick: number): Promise<string> {
  if (!slot) return "";
  const already = await sql<{ error: string }>("select error from email_log where draft = 'taxi' and pick_number = $1", [logPick]);
  if (already[0] && already[0].error === "") return "";
  const link = pageUrl();
  const errors: string[] = [];
  for (const person of await recipients()) {
    const note = messageFor(slot, history, link, person.manager);
    const error = await sendMail([person.email], note.subject, note.text);
    if (error) errors.push(error);
  }
  const error = errors.join(" ").slice(0, 300);
  await recordMail(logPick, error);
  return error;
}

export async function confirmPick(mlbid: string, request: Request): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  await ready();
  const id = clean(mlbid, 12);
  if (!/^\d+$/.test(id)) return { ok: false, error: "Choose a player.", status: 400 };
  const row = await settings();
  if (row.active !== "taxi") return { ok: false, error: "The Taxi Squad draft is closed.", status: 409 };
  if (row.started !== 1) return { ok: false, error: "The draft has not started.", status: 409 };
  const list = await teams();
  const slots = slotsFor(list, row);
  let saved: Slot;
  try {
    saved = await tx(async (query) => {
      const made = await query<{ n: number }>("select count(*)::int as n from picks where draft = 'taxi'");
      const slot = slots[num(made[0]?.n)];
      if (!slot) throw new Error("complete");
      const player = await query<{ mlbid: string }>(
        "select mlbid from players where draft = 'taxi' and mlbid = $1 and mlbid not in (select mlbid from picks where draft = 'taxi')",
        [id],
      );
      if (!player[0]) throw new Error("gone");
      await query(
        "insert into picks (draft, pick_number, round, team_abbr, mlbid, picked_at) values ('taxi', $1, $2, $3, $4, $5)",
        [slot.pick, slot.round, slot.team.abbr, id, new Date().toISOString()],
      );
      return slot;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "complete") return { ok: false, error: "The draft is complete.", status: 409 };
    if (message === "gone") return { ok: false, error: "That player is no longer available.", status: 409 };
    return { ok: false, error: "That pick was not saved. The board has been refreshed.", status: 409 };
  }
  const history = await pickedRows(list);
  const next = slots[saved.pick];
  const mailError = await sendForSlot(next, history, request, saved.pick);
  return { ok: true, mailError };
}

export async function getSettings(): Promise<SettingsPayload> {
  await ready();
  const row = await settings();
  const list = await teams();
  const picks = await sql<{ n: number }>("select count(*)::int as n from picks where draft = 'taxi'");
  const counts = await sql<{ cached: number; missing: number }>(
    "select count(*) filter (where stats <> '')::int as cached, count(*) filter (where stats = '')::int as missing from players where draft = 'taxi'",
  );
  const mail = await sql<{ pick_number: number; error: string }>(
    "select pick_number, error from email_log where draft = 'taxi' and error <> '' order by pick_number",
  );
  return {
    active: row.active,
    season: num(row.season),
    roundsNational: num(row.rounds_national),
    roundsAmerican: num(row.rounds_american),
    roundsFederal: num(row.rounds_federal),
    started: row.started === 1,
    frozen: num(picks[0]?.n) > 0,
    teams: list,
    cached: num(counts[0]?.cached),
    missing: num(counts[0]?.missing),
    mailFailures: mail.map((item) => ({ pickNumber: num(item.pick_number), error: item.error })),
  };
}

const LEAGUES = new Set(["", "National", "American", "Federal"]);

export async function saveSettings(body: {
  active?: string;
  season?: number;
  roundsNational?: number;
  roundsAmerican?: number;
  roundsFederal?: number;
  teams?: TeamRow[];
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await ready();
  const active = body.active === "taxi" || body.active === "oifu" || body.active === "off" ? body.active : "off";
  const season = Math.min(2100, Math.max(1990, Math.floor(Number(body.season) || 2026)));
  const round = (value: number | undefined, fallback: number) => {
    const n = Math.floor(Number(value));
    return n >= 1 && n <= 4 ? n : fallback;
  };
  const current = await settings();
  const picks = await sql<{ n: number }>("select count(*)::int as n from picks where draft = 'taxi'");
  const frozen = num(picks[0]?.n) > 0;
  const rounds = frozen
    ? capsOf(current)
    : {
        national: round(body.roundsNational, 4),
        american: round(body.roundsAmerican, 3),
        federal: round(body.roundsFederal, 2),
      };
  await sql(
    "update draft_settings set active = $1, season = $2, rounds_national = $3, rounds_american = $4, rounds_federal = $5 where id = 1",
    [active, season, rounds.national, rounds.american, rounds.federal],
  );
  if (!Array.isArray(body.teams)) return { ok: true };
  const known = new Map((await teams()).map((team) => [team.abbr, team]));
  const incoming = body.teams.filter((team) => known.has(team.abbr));
  const emailByManager = new Map<string, string>();
  for (const team of incoming) {
    const email = clean(team.email, 120);
    const manager = frozen ? known.get(team.abbr)!.manager : clean(team.manager, 40) || known.get(team.abbr)!.manager;
    if (email) emailByManager.set(manager, email);
  }
  for (let i = 0; i < incoming.length; i += 1) {
    const team = incoming[i];
    const prior = known.get(team.abbr)!;
    const manager = frozen ? prior.manager : clean(team.manager, 40) || prior.manager;
    const league = frozen ? prior.league : LEAGUES.has(team.league) ? team.league : "";
    const email = emailByManager.get(manager) ?? clean(team.email, 120);
    await sql(
      "update teams set name = $1, manager = $2, league = $3, email = $4, logo_url = $5, sort_order = $6 where draft = 'taxi' and abbr = $7",
      [clean(team.name, 80) || prior.name, manager, league, email, cleanLogo(clean(team.logoUrl, 400)), frozen ? prior.sortOrder : i + 1, team.abbr],
    );
  }
  return { ok: true };
}

export async function startDraft(request: Request): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  await ready();
  const row = await settings();
  if (row.active !== "taxi") return { ok: false, error: "Set the active draft to Taxi Squad before starting.", status: 409 };
  if (row.started === 1) {
    const existing = await sql<{ error: string }>("select error from email_log where draft = 'taxi' and pick_number = 0");
    if (existing[0] && existing[0].error === "") return { ok: false, error: "The draft has already started.", status: 409 };
  }
  const list = await teams();
  if (list.some((team) => !team.league || !team.email)) {
    return { ok: false, error: "Every team needs a league and an email before the draft starts.", status: 409 };
  }
  const pool = await sql<{ n: number }>("select count(*)::int as n from players where draft = 'taxi'");
  if (num(pool[0]?.n) === 0) return { ok: false, error: "The player pool is empty.", status: 409 };
  await sql("update draft_settings set started = 1 where id = 1");
  const slots = slotsFor(list, row);
  const mailError = await sendForSlot(slots[0], [], request, 0);
  return { ok: true, mailError };
}

export async function resetDraft(): Promise<void> {
  await ready();
  await sql("delete from picks where draft = 'taxi'");
  await sql("delete from email_log where draft = 'taxi'");
  await sql("update draft_settings set started = 0 where id = 1");
}

export async function replaceRoster(buf: Buffer, replace: boolean): Promise<{ ok: true; count: number } | { ok: false; error: string; status: number }> {
  await ready();
  if (buf.length > 1_500_000) return { ok: false, error: "That roster file is too large.", status: 400 };
  const parsed = playersFromCsv(decodeRoster(buf));
  if (parsed.length === 0) return { ok: false, error: "No eligible players were found in that file.", status: 400 };
  const picks = await sql<{ n: number }>("select count(*)::int as n from picks where draft = 'taxi'");
  if (num(picks[0]?.n) > 0 && !replace) {
    return { ok: false, error: "The draft already has picks. Confirm replace to wipe picks and load this file.", status: 409 };
  }
  if (replace) await resetDraft();
  await sql("delete from players where draft = 'taxi'");
  for (let i = 0; i < parsed.length; i += 80) {
    const chunk = parsed.slice(i, i + 80);
    const values: unknown[] = [];
    const tuples = chunk.map((player, index) => {
      const base = index * 10;
      values.push(player.mlbid, player.first, player.last, player.kind, player.sortCode, player.playingTime, player.estAb, player.avlAb, player.som, player.org);
      return `('taxi', $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, '')`;
    });
    await sql(
      `insert into players (draft, mlbid, first_name, last_name, kind, sort_code, playing_time, est_ab, avl_ab, som, org, stats) values ${tuples.join(", ")} on conflict (draft, mlbid) do nothing`,
      values,
    );
  }
  return { ok: true, count: parsed.length };
}

export async function refreshCache(): Promise<{ ok: true; cached: number; missing: number } | { ok: false; error: string; status: number }> {
  await ready();
  if (cacheRunning) return { ok: false, error: "A stats refresh is already running.", status: 409 };
  cacheRunning = true;
  try {
    const row = await settings();
    const missing = await sql<{ mlbid: string; stats: string }>("select mlbid, stats from players where draft = 'taxi' and stats = ''");
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50).map((player) => player.mlbid);
      const stats = await fetchStats(chunk, num(row.season) || 2026);
      for (const id of chunk) {
        const json = mergeStats(undefined, stats.get(id));
        if (!json) continue;
        await sql("update players set stats = $1 where draft = 'taxi' and mlbid = $2", [json, id]);
      }
    }
    const counts = await sql<{ cached: number; missing: number }>(
      "select count(*) filter (where stats <> '')::int as cached, count(*) filter (where stats = '')::int as missing from players where draft = 'taxi'",
    );
    return { ok: true, cached: num(counts[0]?.cached), missing: num(counts[0]?.missing) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "MLB stats were not available.", status: 502 };
  } finally {
    cacheRunning = false;
  }
}

export async function resendEmail(pickNumber: number, request: Request): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await ready();
  const row = await settings();
  const list = await teams();
  const slots = slotsFor(list, row);
  const history = await pickedRows(list);
  const n = Math.floor(Number(pickNumber));
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Unknown email.", status: 400 };
  const slot = n === 0 ? slots[0] : slots[n];
  const prior = n === 0 ? [] : history.filter((pick) => pick.pick <= n);
  if (!slot) return { ok: false, error: "There is no message to send for that pick.", status: 404 };
  await sql("update email_log set error = 'retry' where draft = 'taxi' and pick_number = $1", [n]);
  const error = await sendForSlot(slot, prior, request, n);
  if (error) return { ok: false, error, status: 502 };
  return { ok: true };
}
