export type SplitLine = { avg: string; ops: string; hr: string };

export type PlayerCard = {
  mlbid: string;
  name: string;
  pos: string;
  kind: "P" | "PP";
  rating: string;
  field: string;
  playingTime: string;
  timeLabel: "AB" | "IP";
  vsl: SplitLine | null;
  vsr: SplitLine | null;
};

export type PickRow = {
  pick: number;
  round: number;
  abbr: string;
  team: string;
  manager: string;
  mlbid: string;
  name: string;
  pos: string;
};

export type UpcomingPick = {
  pick: number;
  round: number;
  abbr: string;
  team: string;
  manager: string;
};

export type Clock = {
  closed: boolean;
  started: boolean;
  finished: boolean;
  manager: string;
  team: string;
  abbr: string;
  league: string;
  round: number;
  pick: number;
  nextManager: string;
  nextTeam: string;
  endsAfter: boolean;
  message: string;
};

export type Board = {
  active: string;
  passphraseConfigured: boolean;
  availableCount: number;
  matchCount: number;
  page: number;
  pageCount: number;
  filter: string;
  q: string;
  clock: Clock;
  players: PlayerCard[];
  picks: PickRow[];
  upcoming: UpcomingPick[];
  mailProblem: boolean;
};

export type TeamRow = {
  abbr: string;
  name: string;
  manager: string;
  league: string;
  email: string;
  logoUrl: string;
  sortOrder: number;
};

export type SettingsPayload = {
  active: string;
  season: number;
  roundsNational: number;
  roundsAmerican: number;
  roundsFederal: number;
  started: boolean;
  frozen: boolean;
  teams: TeamRow[];
  cached: number;
  missing: number;
  mailFailures: { pickNumber: number; error: string }[];
};
