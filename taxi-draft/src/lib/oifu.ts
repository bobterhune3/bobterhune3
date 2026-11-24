import { sql, tx, type Query } from "./db";
import { ready } from "./seed";
import { oifuFinal, oifuNotice, oifuPageUrl, onePerManager, sendMail } from "./mail";
import { displayName, posInfo } from "./positions";
import { passphraseConfigured } from "./auth";
import type { Board, Clock, OifuDrop, OifuPerson, OifuTeam, OifuView, PickRow, PlayerCard, SplitLine, UpcomingPick } from "./types";

type Team = OifuTeam & { email: string; sortOrder: number };

type Picture = {
  round: number;
  phase: "declare" | "pick" | "stall" | "ended";
  current?: Team;
  next?: Team;
  pending: Team[];
  joined: Team[];
  skipped: Team[];
  withdrawn: Team[];
  pickNumber: number;
  endsAfter: boolean;
  canContinue: boolean;
};

type Named = { name: string; pos: string; team: string; manager: string; pick?: number };

const PAGE = 10;

function num(value: unknown): number {
  return Number(value ?? 0);
}

function clean(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function hand(value: string): "L" | "R" | "S" {
  return value === "L" || value === "S" ? value : "R";
}

function teamOf(list: Team[], abbr: string): Team | undefined {
  return list.find((team) => team.abbr === abbr);
}

async function teamList(query: Query = sql): Promise<Team[]> {
  const rows = await query<Team>(
    `select abbr, name as team, manager, email, sort_order as "sortOrder" from teams where draft = 'taxi' order by sort_order, abbr`,
  );
  return rows.map((team) => ({ ...team, sortOrder: num(team.sortOrder) }));
}

async function activeDraft(query: Query = sql): Promise<string> {
  const rows = await query<{ active: string }>("select active from draft_settings where id = 1");
  return rows[0]?.active ?? "off";
}

async function loadState(query: Query = sql): Promise<{ round: number; finished: number } | null> {
  const rows = await query<{ round: number; finished: number }>("select round, finished from oifu_state where id = 1");
  if (!rows[0]) return null;
  return { round: num(rows[0].round), finished: num(rows[0].finished) };
}

export async function clearOifu(): Promise<void> {
  await sql("delete from oifu_drops");
  await sql("delete from oifu_actions");
  await sql("delete from oifu_withdrawn");
  await sql("delete from oifu_state");
  await sql("delete from picks where draft = 'oifu'");
  await sql("delete from email_log where draft = 'oifu'");
}

async function loadPicture(query: Query = sql): Promise<Picture | null> {
  const state = await loadState(query);
  if (!state) return null;
  const list = await teamList(query);
  const withdrawnRows = await query<{ team_abbr: string }>("select team_abbr from oifu_withdrawn");
  const withdrawnSet = new Set(withdrawnRows.map((row) => row.team_abbr));
  const withdrawn = list.filter((team) => withdrawnSet.has(team.abbr));
  const alive = list.filter((team) => !withdrawnSet.has(team.abbr));
  if (state.finished === 1) {
    const made = await query<{ n: number }>("select count(*)::int as n from picks where draft = 'oifu'");
    return {
      round: state.round,
      phase: "ended",
      pending: [],
      joined: [],
      skipped: [],
      withdrawn,
      pickNumber: num(made[0]?.n),
      endsAfter: false,
      canContinue: false,
    };
  }
  const actions = await query<{ team_abbr: string; action: string }>("select team_abbr, action from oifu_actions where round = $1", [state.round]);
  const actionOf = new Map(actions.map((row) => [row.team_abbr, row.action]));
  const pending = alive.filter((team) => !actionOf.has(team.abbr)).sort((a, b) => b.sortOrder - a.sortOrder || b.abbr.localeCompare(a.abbr));
  const joined = alive.filter((team) => actionOf.get(team.abbr) === "join").sort((a, b) => a.sortOrder - b.sortOrder || a.abbr.localeCompare(b.abbr));
  const skipped = alive.filter((team) => actionOf.get(team.abbr) === "skip");
  const made = await query<{ n: number }>("select count(*)::int as n from picks where draft = 'oifu'");
  const pickedTeams = await query<{ team_abbr: string }>("select team_abbr from picks where draft = 'oifu' and round = $1", [state.round]);
  const picked = new Set(pickedTeams.map((row) => row.team_abbr));
  const remaining = joined.filter((team) => !picked.has(team.abbr));
  const base = {
    round: state.round,
    pending,
    joined,
    skipped,
    withdrawn,
    pickNumber: num(made[0]?.n) + 1,
    canContinue: alive.length > 0,
  };
  if (pending.length > 0) {
    return { ...base, phase: "declare", current: pending[0], next: pending[1], endsAfter: false };
  }
  if (remaining.length > 0) {
    return { ...base, phase: "pick", current: remaining[0], next: remaining[1], endsAfter: remaining.length === 1 };
  }
  return { ...base, phase: "stall", endsAfter: false, pickNumber: num(made[0]?.n) };
}

function blankClock(message: string, closed = false): Clock {
  return {
    closed,
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
    message,
  };
}

function clockFor(picture: Picture | null, active: string): Clock {
  if (active !== "oifu") return blankClock("OIFU is not the selected draft.", true);
  if (!picture) return blankClock("Start OIFU in Settings.");
  if (picture.phase === "ended") {
    return { ...blankClock("The OIFU draft is over."), finished: true, started: true, round: picture.round, pick: picture.pickNumber };
  }
  if (picture.phase === "stall") {
    return { ...blankClock("No teams joined this round."), started: true, round: picture.round };
  }
  const current = picture.current;
  return {
    closed: false,
    started: true,
    finished: false,
    manager: current?.manager ?? "",
    team: current?.team ?? "",
    abbr: current?.abbr ?? "",
    league: picture.phase === "pick" ? "OIFU" : "",
    round: picture.round,
    pick: picture.phase === "pick" ? picture.pickNumber : 0,
    nextManager: picture.next?.manager ?? "",
    nextTeam: picture.next?.team ?? "",
    endsAfter: picture.endsAfter,
    message: picture.phase === "declare" ? "Drop a player to join, or skip." : "",
  };
}

function parseSplit(value: unknown): SplitLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as SplitLine;
  if (!row.avg && !row.ops && !row.hr) return null;
  return { avg: row.avg ?? "", ops: row.ops ?? "", hr: row.hr ?? "" };
}

function card(row: { mlbid: string; first_name: string; last_name: string; kind: "P" | "PP"; sort_code: string; bats: string; stats: string }, droppedBy: string): PlayerCard {
  let field = "";
  let vsl: SplitLine | null = null;
  let vsr: SplitLine | null = null;
  let seasonTime = "";
  if (row.stats) {
    try {
      const parsed = JSON.parse(row.stats) as { field?: string; vsl?: SplitLine; vsr?: SplitLine; ab?: string; ip?: string };
      field = parsed.field ?? "";
      vsl = parseSplit(parsed.vsl);
      vsr = parseSplit(parsed.vsr);
      seasonTime = row.kind === "P" ? parsed.ip ?? "" : parsed.ab ?? "";
    } catch {
      field = "";
    }
  }
  const info = posInfo(row.sort_code);
  return {
    mlbid: row.mlbid,
    name: displayName(row.first_name, row.last_name),
    bats: hand(row.bats),
    pos: info.abbr,
    kind: row.kind,
    rating: droppedBy ? `Dropped by ${droppedBy}` : "",
    field,
    playingTime: seasonTime,
    timeLabel: row.kind === "P" ? "IP" : "AB",
    vsl,
    vsr,
  };
}

async function poolRows(): Promise<(PlayerCard & { droppedRound: number })[]> {
  const rows = await sql<{ mlbid: string; first_name: string; last_name: string; kind: "P" | "PP"; sort_code: string; bats: string; stats: string; round: number; team: string }>(
    `select d.mlbid, o.first_name, o.last_name, o.kind, o.sort_code, o.bats, o.stats, d.round, t.name as team
     from oifu_drops d
     join owned_players o on o.team_abbr = d.team_abbr and o.mlbid = d.mlbid
     join teams t on t.draft = 'taxi' and t.abbr = d.team_abbr
     where d.mlbid not in (select mlbid from picks where draft = 'oifu')
     order by o.last_name, o.first_name`,
  );
  return rows.map((row) => ({ ...card(row, row.team), droppedRound: num(row.round) }));
}

async function pickRows(list: Team[]): Promise<PickRow[]> {
  const rows = await sql<{ pick_number: number; round: number; team_abbr: string; mlbid: string; first_name: string; last_name: string; sort_code: string; bats: string }>(
    `select k.pick_number, k.round, k.team_abbr, k.mlbid, o.first_name, o.last_name, o.sort_code, o.bats
     from picks k
     join oifu_drops d on d.mlbid = k.mlbid
     join owned_players o on o.team_abbr = d.team_abbr and o.mlbid = d.mlbid
     where k.draft = 'oifu'
     order by k.pick_number desc`,
  );
  return rows.map((row) => {
    const team = teamOf(list, row.team_abbr);
    return {
      pick: num(row.pick_number),
      round: num(row.round),
      abbr: row.team_abbr,
      team: team?.team ?? row.team_abbr,
      manager: team?.manager ?? "",
      mlbid: row.mlbid,
      name: displayName(row.first_name, row.last_name),
      bats: hand(row.bats),
      pos: posInfo(row.sort_code).abbr,
    };
  });
}

async function dropRows(list: Team[]): Promise<OifuDrop[]> {
  const rows = await sql<{ round: number; team_abbr: string; mlbid: string; first_name: string; last_name: string; sort_code: string; bats: string }>(
    `select d.round, d.team_abbr, d.mlbid, o.first_name, o.last_name, o.sort_code, o.bats
     from oifu_drops d
     join owned_players o on o.team_abbr = d.team_abbr and o.mlbid = d.mlbid
     where d.mlbid not in (select mlbid from picks where draft = 'oifu')
     order by d.round desc, d.team_abbr`,
  );
  return rows.map((row) => {
    const team = teamOf(list, row.team_abbr);
    return {
      round: num(row.round),
      abbr: row.team_abbr,
      team: team?.team ?? row.team_abbr,
      manager: team?.manager ?? "",
      mlbid: row.mlbid,
      name: displayName(row.first_name, row.last_name),
      bats: hand(row.bats),
      pos: posInfo(row.sort_code).abbr,
    };
  });
}

function matchesFilter(pos: string, filter: string): boolean {
  if (!filter || filter === "All") return true;
  if (filter === "OF") return pos === "LF" || pos === "CF" || pos === "RF";
  if (filter === "RP") return pos === "RP" || pos === "CL";
  return pos === filter;
}

function asTeam(team: Team): OifuTeam {
  return { abbr: team.abbr, team: team.team, manager: team.manager };
}

async function rosterMatches(abbr: string, q: string): Promise<OifuPerson[]> {
  const term = q.trim().toLowerCase().replace(/[%_\\]/g, "");
  if (!abbr || term.length < 1) return [];
  const rows = await sql<{ mlbid: string; first_name: string; last_name: string; sort_code: string; bats: string }>(
    `select mlbid, first_name, last_name, sort_code, bats from owned_players
     where team_abbr = $1
     and (lower(first_name) like $2 or lower(last_name) like $2 or lower(first_name || ' ' || last_name) like $2 or lower(last_name || ' ' || first_name) like $2)
     and mlbid not in (select mlbid from oifu_drops)
     and mlbid not in (select mlbid from picks where draft in ('taxi', 'oifu'))
     order by last_name, first_name
     limit 15`,
    [abbr, `%${term}%`],
  );
  return rows.map((row) => ({
    mlbid: row.mlbid,
    name: displayName(row.first_name, row.last_name),
    bats: hand(row.bats),
    pos: posInfo(row.sort_code).abbr,
  }));
}

export async function getOifuBoard(input: { q: string; filter: string; page: number }): Promise<Board> {
  await ready();
  const active = await activeDraft();
  const list = await teamList();
  const picture = active === "oifu" ? await loadPicture() : null;
  const picks = picture ? await pickRows(list) : [];
  const drops = picture && picture.phase !== "ended" ? await dropRows(list) : [];
  const searching = input.q.trim().length >= 3;
  let players: PlayerCard[] = [];
  let matchCount = 0;
  let page = 1;
  let pageCount = 1;
  if (picture?.phase === "pick") {
    const pool = await poolRows();
    const q = input.q.trim().toLowerCase();
    const filtered = pool.filter((player) => {
      if (searching) return player.name.toLowerCase().includes(q);
      return matchesFilter(player.pos, input.filter);
    });
    filtered.sort((a, b) => a.name.localeCompare(b.name, "en"));
    matchCount = filtered.length;
    pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
    page = Math.min(Math.max(1, input.page), pageCount);
    players = filtered.slice((page - 1) * PAGE, page * PAGE);
  }
  const roster = picture?.phase === "declare" && picture.current ? await rosterMatches(picture.current.abbr, input.q) : [];
  const view: OifuView = {
    round: picture?.round ?? 1,
    phase: !picture ? "idle" : picture.phase,
    roster,
    drops,
    waiting: (picture?.pending ?? []).filter((team) => team.abbr !== picture?.current?.abbr).map(asTeam),
    openTeams: (picture?.pending ?? []).map(asTeam),
    skipped: (picture?.skipped ?? []).map(asTeam),
    withdrawn: (picture?.withdrawn ?? []).map(asTeam),
    canEnd: picture?.phase === "stall",
    canContinue: picture?.phase === "stall" && picture.canContinue,
  };
  const upcoming: UpcomingPick[] = picture?.phase === "pick"
    ? picture.joined.filter((team) => team.abbr !== picture.current?.abbr && !picks.some((pick) => pick.round === picture.round && pick.abbr === team.abbr)).slice(0, 5).map((team, index) => ({
        pick: picture.pickNumber + index + 1,
        round: picture.round,
        abbr: team.abbr,
        team: team.team,
        manager: team.manager,
      }))
    : [];
  const mail = await sql<{ n: number }>("select count(*)::int as n from email_log where draft = 'oifu' and error <> ''");
  const poolCount = drops.length;
  return {
    active,
    passphraseConfigured: passphraseConfigured(),
    availableCount: poolCount,
    matchCount: picture?.phase === "pick" ? matchCount : roster.length,
    page,
    pageCount,
    filter: searching ? "All" : input.filter || "All",
    q: input.q,
    clock: clockFor(picture, active),
    players,
    picks,
    upcoming,
    mailProblem: num(mail[0]?.n) > 0,
    oifu: view,
  };
}

async function recipients(): Promise<{ manager: string; email: string }[]> {
  const rows = await sql<{ manager: string; email: string }>("select manager, email from teams where draft = 'taxi' and email <> '' order by sort_order, abbr");
  return onePerManager(rows);
}

async function recordMail(pickNumber: number, error: string): Promise<void> {
  await sql(
    `insert into email_log (draft, pick_number, sent_at, error) values ('oifu', $1, $2, $3)
     on conflict (draft, pick_number) do update set sent_at = excluded.sent_at, error = excluded.error`,
    [pickNumber, error ? "" : new Date().toISOString(), error],
  );
}

async function sendEach(logId: number, build: (manager: string) => { subject: string; text: string }): Promise<string> {
  const already = await sql<{ error: string }>("select error from email_log where draft = 'oifu' and pick_number = $1", [logId]);
  if (already[0] && already[0].error === "") return "";
  const errors: string[] = [];
  for (const person of await recipients()) {
    const note = build(person.manager);
    const error = await sendMail([person.email], note.subject, note.text);
    if (error) errors.push(error);
  }
  const error = errors.join(" ").slice(0, 300);
  await recordMail(logId, error);
  return error;
}

function turnCopy(picture: Picture): { turn: string; detail: string; subject: string } {
  if (picture.phase === "stall") {
    return {
      turn: "No other team joined this round.",
      detail: "Confirm the draft is over on the OIFU page, or open another round.",
      subject: `OIFU draft round ${picture.round}`,
    };
  }
  if (!picture.current) return { turn: "", detail: "", subject: "OIFU draft" };
  const turn = `Now its ${picture.current.manager}'s turn: ${picture.current.team}.`;
  if (picture.phase === "pick") {
    return { turn, detail: `Pick ${picture.pickNumber}, Round ${picture.round} of the OIFU draft`, subject: `${picture.current.manager}'s turn to pick in the OIFU Draft` };
  }
  return { turn, detail: `Declaring for Round ${picture.round}`, subject: `${picture.current.manager}'s turn in the OIFU Draft` };
}

async function namedDrops(round: number): Promise<Named[]> {
  const rows = await sql<{ team: string; manager: string; first_name: string; last_name: string; sort_code: string }>(
    `select t.name as team, t.manager, o.first_name, o.last_name, o.sort_code
     from oifu_drops d
     join owned_players o on o.team_abbr = d.team_abbr and o.mlbid = d.mlbid
     join teams t on t.draft = 'taxi' and t.abbr = d.team_abbr
     where d.round = $1
     order by t.sort_order`,
    [round],
  );
  return rows.map((row) => ({ team: row.team, manager: row.manager, name: displayName(row.first_name, row.last_name), pos: posInfo(row.sort_code).abbr }));
}

async function namedPicks(): Promise<Named[]> {
  const rows = await sql<{ pick_number: number; team: string; manager: string; first_name: string; last_name: string; sort_code: string }>(
    `select k.pick_number, t.name as team, t.manager, o.first_name, o.last_name, o.sort_code
     from picks k
     join oifu_drops d on d.mlbid = k.mlbid
     join owned_players o on o.team_abbr = d.team_abbr and o.mlbid = d.mlbid
     join teams t on t.draft = 'taxi' and t.abbr = k.team_abbr
     where k.draft = 'oifu'
     order by k.pick_number`,
    [],
  );
  return rows.map((row) => ({
    pick: num(row.pick_number),
    team: row.team,
    manager: row.manager,
    name: displayName(row.first_name, row.last_name),
    pos: posInfo(row.sort_code).abbr,
  }));
}

async function mailTurn(headline: string, picture: Picture, logId: number, listTitle = "Players dropped this round"): Promise<string> {
  const copy = turnCopy(picture);
  const drops = picture.phase === "ended" ? [] : await namedDrops(picture.round);
  const lines = drops.map((drop) => `${drop.team}, ${drop.manager}, ${drop.name}, ${drop.pos}`);
  const page = oifuPageUrl();
  return sendEach(logId, (manager) => oifuNotice({
    recipient: manager,
    subject: copy.subject,
    headline,
    turn: copy.turn,
    detail: copy.detail,
    pageUrl: page,
    listTitle: lines.length ? listTitle : "",
    lines,
  }));
}

function fail(error: unknown): { ok: false; error: string; status: number } {
  const message = error instanceof Error ? error.message : "";
  if (message === "closed") return { ok: false, error: "OIFU is not the selected draft.", status: 409 };
  if (message === "idle") return { ok: false, error: "The OIFU draft has not started.", status: 409 };
  if (message === "over") return { ok: false, error: "The OIFU draft is over.", status: 409 };
  if (message === "turn") return { ok: false, error: "It is not this team's turn.", status: 409 };
  if (message === "roster") return { ok: false, error: "That player is not on this team's roster.", status: 409 };
  if (message === "gone") return { ok: false, error: "That player is already in the pool or has been picked.", status: 409 };
  if (message === "stall") return { ok: false, error: "This round is still open.", status: 409 };
  if (message === "empty") return { ok: false, error: "Choose a team that has not declared.", status: 400 };
  return { ok: false, error: "That was not saved. The board has been refreshed.", status: 409 };
}

async function requireLive(query: Query): Promise<Picture> {
  if ((await activeDraft(query)) !== "oifu") throw new Error("closed");
  const picture = await loadPicture(query);
  if (!picture) throw new Error("idle");
  if (picture.phase === "ended") throw new Error("over");
  return picture;
}

export async function actOifu(body: {
  action?: string;
  mlbid?: string;
  abbrs?: string[];
}): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  await ready();
  try {
    if (body.action === "start") return await startOifu();
    if (body.action === "join") return await joinRound(clean(body.mlbid, 12));
    if (body.action === "skip") return await declare("skip");
    if (body.action === "withdraw") return await declare("withdraw");
    if (body.action === "skip-many") return await skipMany(Array.isArray(body.abbrs) ? body.abbrs.map((abbr) => clean(abbr, 8)) : []);
    if (body.action === "pick") return await pickPlayer(clean(body.mlbid, 12));
    if (body.action === "continue") return await continueRound();
    if (body.action === "end") return await endDraft();
    return { ok: false, error: "Unknown action.", status: 400 };
  } catch (error) {
    return fail(error);
  }
}

async function startOifu(): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  if ((await activeDraft()) !== "oifu") return { ok: false, error: "Choose OIFU before starting.", status: 409 };
  const state = await loadState();
  if (state?.finished === 1) return { ok: false, error: "Reset the draft before starting OIFU again.", status: 409 };
  if (state) return { ok: true, mailError: "" };
  const list = await teamList();
  if (list.length === 0) return { ok: false, error: "No teams are loaded.", status: 409 };
  if (list.some((team) => !team.email.includes("@"))) return { ok: false, error: "Every team needs an email before OIFU starts.", status: 409 };
  const owned = await sql<{ n: number }>("select count(*)::int as n from owned_players");
  if (num(owned[0]?.n) === 0) return { ok: false, error: "Team rosters are not loaded. Upload the NoDice roster file.", status: 409 };
  await sql("insert into oifu_state (id, round, phase, finished) values (1, 1, 'declare', 0)");
  const picture = await loadPicture();
  if (!picture) return { ok: true, mailError: "" };
  const mailError = await mailTurn("", picture, 1_000_000 + picture.round * 100);
  return { ok: true, mailError };
}

async function joinRound(mlbid: string): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  if (!/^\d+$/.test(mlbid)) return { ok: false, error: "Choose a player from this roster.", status: 400 };
  const saved = await tx(async (query) => {
    const picture = await requireLive(query);
    if (picture.phase !== "declare" || !picture.current) throw new Error("turn");
    const team = picture.current;
    const player = await query<{ first_name: string; last_name: string; sort_code: string }>(
      `select first_name, last_name, sort_code from owned_players
       where team_abbr = $1 and mlbid = $2
       and mlbid not in (select mlbid from oifu_drops)
       and mlbid not in (select mlbid from picks where draft in ('taxi', 'oifu'))`,
      [team.abbr, mlbid],
    );
    if (!player[0]) throw new Error("roster");
    await query("insert into oifu_actions (round, team_abbr, action) values ($1, $2, 'join')", [picture.round, team.abbr]);
    await query("insert into oifu_drops (round, team_abbr, mlbid) values ($1, $2, $3)", [picture.round, team.abbr, mlbid]);
    await query("update oifu_state set phase = 'declare' where id = 1");
    return {
      round: picture.round,
      sortOrder: team.sortOrder,
      team: team.team,
      manager: team.manager,
      name: displayName(player[0].first_name, player[0].last_name),
      pos: posInfo(player[0].sort_code).abbr,
    };
  });
  const picture = await loadPicture();
  if (!picture) return { ok: true, mailError: "" };
  const headline = `${saved.team}, ${saved.manager} joined Round ${saved.round} of the OIFU draft by dropping ${saved.name}, ${saved.pos}.`;
  const mailError = await mailTurn(headline, picture, 1_000_000 + saved.round * 100 + saved.sortOrder);
  return { ok: true, mailError };
}

async function declare(action: "skip" | "withdraw"): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  const saved = await tx(async (query) => {
    const picture = await requireLive(query);
    if (picture.phase !== "declare" || !picture.current) throw new Error("turn");
    const team = picture.current;
    await query("insert into oifu_actions (round, team_abbr, action) values ($1, $2, $3)", [picture.round, team.abbr, action]);
    if (action === "withdraw") await query("insert into oifu_withdrawn (team_abbr) values ($1)", [team.abbr]);
    return { round: picture.round, sortOrder: team.sortOrder, team: team.team, manager: team.manager };
  });
  const picture = await loadPicture();
  if (!picture) return { ok: true, mailError: "" };
  const headline = action === "skip"
    ? `${saved.team}, ${saved.manager} skipped Round ${saved.round} of the OIFU draft.`
    : `${saved.team}, ${saved.manager} withdrew from the OIFU draft.`;
  const mailError = await mailTurn(headline, picture, 1_000_000 + saved.round * 100 + saved.sortOrder);
  return { ok: true, mailError };
}

async function skipMany(abbrs: string[]): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  const unique = [...new Set(abbrs.filter(Boolean))];
  const saved = await tx(async (query) => {
    const picture = await requireLive(query);
    if (picture.phase !== "declare") throw new Error("turn");
    const pending = new Set(picture.pending.map((team) => team.abbr));
    if (picture.current) pending.add(picture.current.abbr);
    const chosen = unique.filter((abbr) => pending.has(abbr));
    if (chosen.length === 0) throw new Error("empty");
    const names: string[] = [];
    for (const abbr of chosen) {
      const team = teamOf(await teamList(query), abbr);
      await query("insert into oifu_actions (round, team_abbr, action) values ($1, $2, 'skip')", [picture.round, abbr]);
      if (team) names.push(`${team.team} (${team.manager})`);
    }
    return { round: picture.round, names };
  });
  const picture = await loadPicture();
  if (!picture) return { ok: true, mailError: "" };
  const prior = await sql<{ n: number }>("select count(*)::int as n from email_log where draft = 'oifu' and pick_number >= 2000000 and pick_number < 3000000");
  const headline = `These teams will sit out Round ${saved.round}: ${saved.names.join(", ")}.`;
  const mailError = await mailTurn(headline, picture, 2_000_000 + num(prior[0]?.n) + 1);
  return { ok: true, mailError };
}

async function pickPlayer(mlbid: string): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  if (!/^\d+$/.test(mlbid)) return { ok: false, error: "Choose a player.", status: 400 };
  const saved = await tx(async (query) => {
    const picture = await requireLive(query);
    if (picture.phase !== "pick" || !picture.current) throw new Error("turn");
    const player = await query<{ first_name: string; last_name: string; sort_code: string }>(
      `select o.first_name, o.last_name, o.sort_code
       from oifu_drops d
       join owned_players o on o.team_abbr = d.team_abbr and o.mlbid = d.mlbid
       where d.mlbid = $1 and d.mlbid not in (select mlbid from picks where draft = 'oifu')`,
      [mlbid],
    );
    if (!player[0]) throw new Error("gone");
    await query(
      "insert into picks (draft, pick_number, round, team_abbr, mlbid, picked_at) values ('oifu', $1, $2, $3, $4, $5)",
      [picture.pickNumber, picture.round, picture.current.abbr, mlbid, new Date().toISOString()],
    );
    const pickedTeams = await query<{ team_abbr: string }>("select team_abbr from picks where draft = 'oifu' and round = $1", [picture.round]);
    const picked = new Set(pickedTeams.map((row) => row.team_abbr));
    const remaining = picture.joined.filter((team) => !picked.has(team.abbr));
    if (remaining.length === 0) await query("update oifu_state set round = round + 1, phase = 'declare' where id = 1");
    else await query("update oifu_state set phase = 'pick' where id = 1");
    return {
      pick: picture.pickNumber,
      round: picture.round,
      team: picture.current.team,
      manager: picture.current.manager,
      name: displayName(player[0].first_name, player[0].last_name),
      pos: posInfo(player[0].sort_code).abbr,
    };
  });
  const picture = await loadPicture();
  if (!picture) return { ok: true, mailError: "" };
  const picks = await namedPicks();
  const copy = turnCopy(picture);
  const page = oifuPageUrl();
  const mailError = await sendEach(saved.pick, (manager) => oifuNotice({
    recipient: manager,
    subject: copy.subject,
    headline: `${saved.team} (${saved.manager}) picked: ${saved.name}, ${saved.pos}`,
    turn: copy.turn,
    detail: copy.detail,
    pageUrl: page,
    listTitle: "Picks so far",
    lines: picks.map((pick) => `${pick.pick}. ${pick.team}, ${pick.manager}, ${pick.name}, ${pick.pos}`),
  }));
  return { ok: true, mailError };
}

async function continueRound(): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  const round = await tx(async (query) => {
    const picture = await requireLive(query);
    if (picture.phase !== "stall") throw new Error("stall");
    if (!picture.canContinue) throw new Error("over");
    const next = picture.round + 1;
    await query("update oifu_state set round = $1, phase = 'declare' where id = 1", [next]);
    return next;
  });
  const picture = await loadPicture();
  if (!picture) return { ok: true, mailError: "" };
  const mailError = await mailTurn("", picture, 1_000_000 + round * 100);
  return { ok: true, mailError };
}

async function endDraft(): Promise<{ ok: true; mailError: string } | { ok: false; error: string; status: number }> {
  await tx(async (query) => {
    const picture = await requireLive(query);
    if (picture.phase !== "stall") throw new Error("stall");
    await query("update oifu_state set phase = 'ended', finished = 1 where id = 1");
  });
  const picks = await namedPicks();
  const page = oifuPageUrl();
  const mailError = await sendEach(0, (manager) => oifuFinal(manager, page, picks.map((pick) => `${pick.pick}. ${pick.team}, ${pick.manager}, ${pick.name}, ${pick.pos}`)));
  return { ok: true, mailError };
}
