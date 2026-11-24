create table if not exists oifu_state (
  id integer primary key,
  round integer not null default 1,
  phase text not null default 'declare',
  finished integer not null default 0
);

create table if not exists owned_players (
  team_abbr text not null,
  mlbid text not null,
  first_name text not null,
  last_name text not null,
  kind text not null,
  sort_code text not null,
  bats text not null default '',
  stats text not null default '',
  primary key (team_abbr, mlbid)
);

create table if not exists oifu_actions (
  round integer not null,
  team_abbr text not null,
  action text not null,
  primary key (round, team_abbr)
);

create table if not exists oifu_drops (
  round integer not null,
  team_abbr text not null,
  mlbid text not null,
  primary key (round, team_abbr)
);

create unique index if not exists oifu_drops_mlbid on oifu_drops (mlbid);

create table if not exists oifu_withdrawn (
  team_abbr text primary key
);
