create table draft_settings (
  id integer primary key,
  active text not null default 'off',
  season integer not null default 2026,
  rounds_national integer not null default 4,
  rounds_american integer not null default 3,
  rounds_federal integer not null default 2,
  started integer not null default 0
);

create table teams (
  draft text not null,
  abbr text not null,
  name text not null,
  manager text not null,
  league text not null default '',
  email text not null default '',
  logo_url text not null default '',
  sort_order integer not null,
  primary key (draft, abbr)
);

create table players (
  draft text not null,
  mlbid text not null,
  first_name text not null,
  last_name text not null,
  kind text not null,
  sort_code text not null,
  playing_time text not null default '',
  est_ab text not null default '',
  avl_ab text not null default '',
  som text not null default '',
  org text not null default '',
  stats text not null default '',
  primary key (draft, mlbid)
);

create table picks (
  draft text not null,
  pick_number integer not null,
  round integer not null,
  team_abbr text not null,
  mlbid text not null,
  picked_at text not null,
  primary key (draft, pick_number),
  unique (draft, mlbid)
);

create table email_log (
  draft text not null,
  pick_number integer not null,
  sent_at text not null default '',
  error text not null default '',
  primary key (draft, pick_number)
);
