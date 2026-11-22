import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "./db";
import { playersFromCsv } from "./roster";

export async function applyHands(): Promise<void> {
  const file = JSON.parse(await readFile(path.join(process.cwd(), "data", "hands.json"), "utf8")) as Record<string, string>;
  const entries = Object.entries(file).filter((entry): entry is [string, "L" | "R" | "S"] => entry[1] === "L" || entry[1] === "R" || entry[1] === "S");
  for (let i = 0; i < entries.length; i += 80) {
    const chunk = entries.slice(i, i + 80);
    const values: unknown[] = [];
    const tuples = chunk.map(([id, hand], index) => {
      values.push(id, hand);
      return `($${index * 2 + 1}::text, $${index * 2 + 2}::text)`;
    });
    await sql(
      `update players as p set bats = v.hand from (values ${tuples.join(", ")}) as v(mlbid, hand) where p.draft = 'taxi' and p.mlbid = v.mlbid and p.bats = ''`,
      values,
    );
  }
  await sql("update players set bats = 'R' where draft = 'taxi' and bats = ''");
}

const TEAMS: [string, string, string][] = [
  ["ANM", "Anaheim Angels", "Marshal"],
  ["AZB", "Arizona Diamondbacks", "Bob"],
  ["ATM", "Atlanta Braves", "Marshal"],
  ["BLN", "Baltimore Orioles", "Nate"],
  ["BSM", "Boston Red Sox", "Marshal"],
  ["CHB", "Chicago Cubs", "Bob"],
  ["CLM", "Cleveland Guardians", "Marshal"],
  ["DTB", "Detroit Tigers", "Bob"],
  ["HSN", "Houston Astros", "Nate"],
  ["KCM", "Kansas City Royals", "Marshal"],
  ["LAN", "Los Angeles Dodgers", "Nate"],
  ["MLG", "Milwaukee Brewers", "Gary"],
  ["MNB", "Minnesota Twins", "Bob"],
  ["NYB", "New York Yankees", "Bob"],
  ["PHN", "Philadelphia Phillies", "Nate"],
  ["PTN", "Pittsburgh Pirates", "Nate"],
  ["SDG", "San Diego Padres", "Gary"],
  ["SFN", "San Francisco Giants", "Nate"],
  ["SEG", "Seattle Mariners", "Gary"],
  ["SLB", "St. Louis Cardinals", "Bob"],
  ["TBM", "Tampa Bay Rays", "Marshal"],
  ["TXG", "Texas Rangers", "Gary"],
  ["TOG", "Toronto Blue Jays", "Gary"],
  ["WSG", "Washington Nationals", "Gary"],
];

let readyPromise: Promise<void> | undefined;

export function ready(): Promise<void> {
  readyPromise ??= prepare().catch((error: unknown) => {
    readyPromise = undefined;
    throw error;
  });
  return readyPromise;
}

async function prepare(): Promise<void> {
  await sql("insert into draft_settings (id, active, season, rounds_national, rounds_american, rounds_federal, started) values (1, 'off', 2026, 4, 3, 2, 0) on conflict (id) do nothing");
  const existing = await sql<{ n: number }>("select count(*)::int as n from teams where draft = 'taxi'");
  if (Number(existing[0]?.n ?? 0) === 0) {
    for (let i = 0; i < TEAMS.length; i += 1) {
      const [abbr, name, manager] = TEAMS[i];
      await sql(
        "insert into teams (draft, abbr, name, manager, league, email, logo_url, sort_order) values ('taxi', $1, $2, $3, '', '', '', $4) on conflict (draft, abbr) do nothing",
        [abbr, name, manager, i + 1],
      );
    }
  }
  const players = await sql<{ n: number }>("select count(*)::int as n from players where draft = 'taxi'");
  if (Number(players[0]?.n ?? 0) === 0) {
    const file = await readFile(path.join(process.cwd(), "data", "roster.csv"));
    const parsed = playersFromCsv(file.toString("utf8"));
    for (let i = 0; i < parsed.length; i += 80) {
      const chunk = parsed.slice(i, i + 80);
      const values: unknown[] = [];
      const tuples = chunk.map((player, index) => {
        const base = index * 10;
        values.push(
          player.mlbid,
          player.first,
          player.last,
          player.kind,
          player.sortCode,
          player.playingTime,
          player.estAb,
          player.avlAb,
          player.som,
          player.org,
        );
        return `('taxi', $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, '')`;
      });
      await sql(
        `insert into players (draft, mlbid, first_name, last_name, kind, sort_code, playing_time, est_ab, avl_ab, som, org, stats) values ${tuples.join(", ")} on conflict (draft, mlbid) do nothing`,
        values,
      );
    }
  }
  await applyHands();
}
