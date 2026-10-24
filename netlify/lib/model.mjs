// Modèle de Poisson simple + mise à jour des pronostics dans Supabase.

export const COMPETITIONS = [
  { code: 'PL', name: 'Premier League' },
  { code: 'PD', name: 'Liga' },
  { code: 'BL1', name: 'Bundesliga' },
  { code: 'SA', name: 'Serie A' },
  { code: 'FL1', name: 'Ligue 1' },
  { code: 'CL', name: 'Ligue des champions' },
];

const K = 5; // poids de la moyenne du championnat (évite les extrêmes en début de saison)

function poisson(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function predictMatch(lh, la) {
  const N = 10;
  let pH = 0, pD = 0, pA = 0, over = 0, btts = 0;
  let best = { p: 0, h: 0, a: 0 };
  for (let h = 0; h <= N; h++) {
    for (let a = 0; a <= N; a++) {
      const p = poisson(lh, h) * poisson(la, a);
      if (h > a) pH += p; else if (h === a) pD += p; else pA += p;
      if (h + a > 2) over += p;
      if (h > 0 && a > 0) btts += p;
      if (p > best.p) best = { p, h, a };
    }
  }
  const t = pH + pD + pA;
  return {
    pH: pH / t, pD: pD / t, pA: pA / t,
    over: over / t, btts: btts / t,
    score: `${best.h}-${best.a}`,
  };
}

function buildStats(matches) {
  const fin = matches.filter(
    (m) => m.status === 'FINISHED' && m.score?.fullTime?.home != null && m.score?.fullTime?.away != null
  );
  if (fin.length < 10) return null;
  let hg = 0, ag = 0;
  const t = {};
  const get = (id) => (t[id] ||= { hf: 0, ha: 0, hn: 0, af: 0, aa: 0, an: 0 });
  for (const m of fin) {
    const h = m.score.fullTime.home, a = m.score.fullTime.away;
    hg += h; ag += a;
    const H = get(m.homeTeam.id), A = get(m.awayTeam.id);
    H.hf += h; H.ha += a; H.hn++;
    A.af += a; A.aa += h; A.an++;
  }
  return { mh: hg / fin.length || 1.4, ma: ag / fin.length || 1.1, t };
}

function strengths(s, mh, ma) {
  s = s || { hf: 0, ha: 0, hn: 0, af: 0, aa: 0, an: 0 };
  return {
    attH: (s.hf + K * mh) / (s.hn + K) / mh,
    defH: (s.ha + K * ma) / (s.hn + K) / ma,
    attA: (s.af + K * ma) / (s.an + K) / ma,
    defA: (s.aa + K * mh) / (s.an + K) / mh,
    n: s.hn + s.an,
  };
}

async function processCompetition(c, token, from, to) {
  const r = await fetch(`https://api.football-data.org/v4/competitions/${c.code}/matches`, {
    headers: { 'X-Auth-Token': token },
  });
  if (!r.ok) throw new Error(`${c.code} : erreur ${r.status}`);
  const { matches = [] } = await r.json();
  const stats = buildStats(matches);
  if (!stats) return [];
  const rows = [];
  for (const m of matches) {
    if (!['TIMED', 'SCHEDULED'].includes(m.status)) continue;
    const d = new Date(m.utcDate);
    if (d < from || d > to) continue;
    if (!m.homeTeam?.id || !m.awayTeam?.id) continue;
    const H = strengths(stats.t[m.homeTeam.id], stats.mh, stats.ma);
    const A = strengths(stats.t[m.awayTeam.id], stats.mh, stats.ma);
    const lh = H.attH * A.defA * stats.mh;
    const la = A.attA * H.defH * stats.ma;
    const p = predictMatch(lh, la);
    const n = Math.min(H.n, A.n);
    const r4 = (x) => Math.round(x * 10000) / 10000;
    rows.push({
      match_id: m.id,
      competition: c.code,
      competition_name: c.name,
      utc_date: m.utcDate,
      home: m.homeTeam.shortName || m.homeTeam.name,
      away: m.awayTeam.shortName || m.awayTeam.name,
      xg_home: Math.round(lh * 100) / 100,
      xg_away: Math.round(la * 100) / 100,
      p_over25: r4(p.over),
      p_btts: r4(p.btts),
      p_home: r4(p.pH),
      p_draw: r4(p.pD),
      p_away: r4(p.pA),
      score: p.score,
      confidence: n >= 12 ? 'bonnes' : n >= 6 ? 'moyennes' : 'faibles',
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

export async function runUpdate({ days = 4, only } = {}) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!token || !url || !key) throw new Error('Variables d’environnement manquantes');

  const from = new Date();
  const to = new Date(from.getTime() + days * 86400000);
  const list = only ? COMPETITIONS.filter((c) => c.code === only) : COMPETITIONS;

  const results = await Promise.allSettled(list.map((c) => processCompetition(c, token, from, to)));
  const rows = [];
  const errors = [];
  results.forEach((res) => {
    if (res.status === 'fulfilled') rows.push(...res.value);
    else errors.push(String(res.reason?.message || res.reason));
  });

  if (rows.length) {
    const r = await fetch(`${url}/rest/v1/predictions?on_conflict=match_id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`Supabase : ${r.status} ${await r.text()}`);
  }
  return { saved: rows.length, errors };
      }
