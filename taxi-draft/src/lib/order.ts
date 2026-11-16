export type SlotTeam = {
  abbr: string;
  name: string;
  manager: string;
  league: string;
  sortOrder: number;
};

export type Slot = {
  round: number;
  pick: number;
  team: SlotTeam;
};

export function roundCap(league: string, caps: { national: number; american: number; federal: number }): number {
  if (league === "National") return caps.national;
  if (league === "American") return caps.american;
  if (league === "Federal") return caps.federal;
  return 0;
}

export function schedule(teams: SlotTeam[], caps: { national: number; american: number; federal: number }): Slot[] {
  const ordered = [...teams].sort((a, b) => a.sortOrder - b.sortOrder || a.abbr.localeCompare(b.abbr));
  const slots: Slot[] = [];
  let pick = 0;
  for (let round = 1; round <= 4; round += 1) {
    for (const team of ordered) {
      if (round <= roundCap(team.league, caps)) {
        pick += 1;
        slots.push({ round, pick, team });
      }
    }
  }
  return slots;
}
