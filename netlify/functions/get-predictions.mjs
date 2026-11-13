// Renvoie les matchs (à venir, en cours, terminés) des 10 championnats, sans exposer la clé.
// /api/matches -> matchs de J-3 à J+6
// Une seule demande à football-data.org pour tous les championnats (au lieu de 10),
// gardée 5 minutes en mémoire : au plus 1 demande toutes les 5 minutes, même avec beaucoup d'utilisateurs.
import { requireLicense, deny } from '../lib/license.mjs';

const NAMES = {
  PL: 'Premier League',
  PD: 'Liga',
  BL1: 'Bundesliga',
  SA: 'Serie A',
  FL1: 'Ligue 1',
  CL: 'Ligue des champions',
  ELC: 'Championship',
  DED: 'Eredivisie',
  PPL: 'Primeira Liga',
  BSA: 'Brasileirão',
};

let cache = { t: 0, body: null };

const reply = (body) =>
  new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=120' } });

async function fd(url, token) {
  let r = await fetch(url, { headers: { 'X-Auth-Token': token } });
  if (r.status === 429) {
    await new Promise((ok) => setTimeout(ok, 3000));
    r = await fetch(url, { headers: { 'X-Auth-Token': token } });
  }
  return r;
}

const toRow = (m, code) => ({
  id: m.id,
  competition: code,
  competition_name: NAMES[code],
  utc_date: m.utcDate,
  status: m.status,
  home: m.homeTeam?.shortName || m.homeTeam?.name || '?',
  away: m.awayTeam?.shortName || m.awayTeam?.name || '?',
  score_home: m.score?.fullTime?.home ?? null,
  score_away: m.score?.fullTime?.away ?? null,
});

export default async (req) => {
  const lic = await requireLicense(req);
  if (!lic.ok) return deny(lic);
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return Response.json({ error: 'Clé manquante' }, { status: 500 });
  if (cache.body && Date.now() - cache.t < 300000) return reply(cache.body);

  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const from = day(-3);
  const to = day(6);
  const codes = Object.keys(NAMES);
  let rows = [];

  // 1) Une seule demande pour tous les championnats
  try {
    const r = await fd(
      `https://api.football-data.org/v4/matches?competitions=${codes.join(',')}&dateFrom=${from}&dateTo=${to}`,
      token
    );
    if (r.ok) {
      const { matches = [] } = await r.json();
      rows = matches.filter((m) => NAMES[m.competition?.code]).map((m) => toRow(m, m.competition.code));
    }
  } catch { /* on passe au secours */ }

  // 2) Secours : une demande par championnat
  if (!rows.length) {
    const res = await Promise.allSettled(
      codes.map(async (code) => {
        const r = await fd(
          `https://api.football-data.org/v4/competitions/${code}/matches?dateFrom=${from}&dateTo=${to}`,
          token
        );
        if (!r.ok) throw new Error(`${code} : ${r.status}`);
        const { matches = [] } = await r.json();
        return matches.map((m) => toRow(m, code));
      })
    );
    rows = res.flatMap((x) => (x.status === 'fulfilled' ? x.value : []));
  }

  if (!rows.length) return Response.json({ error: 'Aucune donnée' }, { status: 502 });
  rows.sort((a, b) => new Date(a.utc_date) - new Date(b.utc_date));
  cache = { t: Date.now(), body: JSON.stringify(rows) };
  return reply(cache.body);
};

export const config = { path: '/api/matches' };
