create table if not exists predictions (
  match_id bigint primary key,
  competition text not null,
  competition_name text,
  utc_date timestamptz not null,
  home text not null,
  away text not null,
  xg_home numeric,
  xg_away numeric,
  p_over25 numeric,
  p_btts numeric,
  p_home numeric,
  p_draw numeric,
  p_away numeric,
  score text,
  confidence text,
  updated_at timestamptz default now()
);

-- Table privée : seules les fonctions Netlify (clé service) peuvent lire/écrire.
alter table predictions enable row level security;
