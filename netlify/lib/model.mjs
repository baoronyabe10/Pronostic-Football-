// Modèle de Poisson pondéré par la récence + forme + bilan des pronostics.

export const COMPETITIONS = [
  { code: 'PL', name: 'Premier League' },
  { code: 'PD', name: 'Liga' },
  { code: 'BL1', name: 'Bundesliga' },
  { code: 'SA', name: 'Serie A' },
  { code: 'FL1', name: 'Ligue 1' },
  { code: 'CL', name: 'Ligue des champions' },
];

const K = 3;          // poids de la moyenne du championnat
const HALF_LIFE = 90; // un match perd la moitié de son poids tous les 90 jours
const DAY = 86400000;

function poisson(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function predictMatch(lh, la) {
  const N = 10;
  let pH = 0, pD = 0, pA = 0, over = 0, btts = 0;
  const cells = [];
  for (let h = 0; h <= N; h++) {
    for (let a = 0; a <= N; a++) {
      const p = poisson(lh, h) * poisson(la, a);
      if (h > a) pH += p; else if (h === a) pD += p; else pA += p;
      if (h + a > 2) over += p;
      if (h > 0 && a > 0) btts += p;
      cells.push({ s: `${h}-${a}`, p });
    }
  }
  cells.sort((x, y) => y.p - x.p);
  const t = pH + pD + pA;
  return {
    pH: pH / t, pD: pD / t, pA: pA / t,
    over: over / t, btts: btts / t,
    score: cells[0].s,
    top: cells.slice(0, 6).map((c) => ({ s: c.s, p: Math.round((c.p / t) * 10000) / 10000 })),
  };
}

function buildStats(fin, now) {
  if (fin.length < 10) return null;
  let hg = 0, ag = 0, W = 0;
  const t = {};
  const get = (id) => (t[id] ||= { hf: 0, ha: 0, hn: 0, af: 0, aa: 0, an: 0, hc: 0, ac: 0 });
  for (const m of fin) {
    const age = Math.max(0, (now - new Date(m.utcDate)) / DAY);
    const w = Math.pow(0.5, age / HALF_LIFE);
    const h = m.score.fullTime.home, a = m.score.fullTime.away;
    hg += w * h; ag += w * a; W += w;
    const H = get(m.homeTeam.id), A = get(m.awayTeam.id);
    H.hf += w * h; H.ha += w * a; H.hn += w; H.hc++;
    A.af += w * a; A.aa += w * h; A.an += w; A.ac++;
  }
  return { mh: hg / W || 1.4, ma: ag / W || 1.1, t };
}

function strengths(s, mh, ma) {
  s = s || { hf: 0, ha: 0, hn: 0, af: 0, aa: 0, an: 0, hc: 0, ac: 0 };
  return {
    attH: (s.hf + K * mh) / (s.hn + K) / mh,
    defH: (s.ha + K * ma) / (s.hn + K) / ma,
    attA: (s.af + K * ma) / (s.an + K) / ma,
    defA: (s.aa + K * mh) / (s.an + K) / mh,
    n: s.hc + s.ac,
  };
}

function formOf(finDesc, id) {
  const out = [];
  for (const m of finDesc) {
    const isH = m.homeTeam.id === id, isA = m.awayTeam.id === id;
    if (!isH && !isA) continue;
    const gf = isH ? m.score.fullTime.home : m.score.fullTime.away;
    const ga = isH ? m.score.fullTime.away : m.score.fullTime.home;
    const opp = isH ? m.awayTeam : m.homeTeam;
    out.push({ r: gf > ga ? 'V' : gf < ga ? 'D' : 'N', s: `${gf}-${ga}`, o: opp.shortName || opp.name, h: isH ? 1 : 0 });
    if (out.length === 5) break;
  }
  return out.reverse();
}

async function processCompetition(c, token, from, to) {
  const r = await fetch(`https://api.football-data.org/v4/competitions/${c.code}/matches`, {
    headers: { 'X-Auth-Token': token },
  });
  if (!r.ok) throw new Error(`${c.code} : erreur ${r.status}`);
  const { matches = [] } = await r.json();

  const finDesc = matches
    .filter((m) => m.status === 'FINISHED' && m.score?.fullTime?.home != null && m.score?.fullTime?.away != null)
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));

  const finished = {};
  for (const m of finDesc) {
    if (from - new Date(m.utcDate) > 30 * DAY) break;
    finished[m.id] = [m.score.fullTime.home, m.score.fullTime.away];
  }

  const stats = buildStats(finDesc, from);
  const rows = [];
  if (!stats) return { rows, finished };

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
      scores: p.top,
      form_home: formOf(finDesc, m.homeTeam.id),
      form_away: formOf(finDesc, m.awayTeam.id),
      confidence: n >= 12 ? 'bonnes' : n >= 6 ? 'moyennes' : 'faibles',
      updated_at: new Date().toISOString(),
    });
  }
  return { rows, finished };
}

const headers = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

// Enregistre le score réel des matchs terminés qui ont un pronostic.
async function settle(url, key, finished) {
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const r = await fetch(
    `${url}/rest/v1/predictions?select=match_id&result_home=is.null&utc_date=lt.${encodeURIComponent(now)}&utc_date=gte.${encodeURIComponent(since)}`,
    { headers: headers(key) }
  );
  if (!r.ok) throw new Error(`Bilan : ${r.status} ${await r.text()}`);
  const pending = (await r.json()).map((x) => x.match_id).filter((id) => finished[id]);
  await Promise.all(
    pending.map((id) =>
      fetch(`${url}/rest/v1/predictions?match_id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers(key), Prefer: 'return=minimal' },
        body: JSON.stringify({ result_home: finished[id][0], result_away: finished[id][1] }),
      })
    )
  );
  return pending.length;
}

export async function runUpdate({ days = 4, only } = {}) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!token || !url || !key) throw new Error('Variables d’environnement manquantes');

  const from = new Date();
  const to = new Date(from.getTime() + days * DAY);
  const list = only ? COMPETITIONS.filter((c) => c.code === only) : COMPETITIONS;

  const results = await Promise.allSettled(list.map((c) => processCompetition(c, token, from, to)));
  const rows = [];
  const finished = {};
  const errors = [];
  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      rows.push(...res.value.rows);
      Object.assign(finished, res.value.finished);
    } else errors.push(String(res.reason?.message || res.reason));
  });

  if (rows.length) {
    const r = await fetch(`${url}/rest/v1/predictions?on_conflict=match_id`, {
      method: 'POST',
      headers: { ...headers(key), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`Supabase : ${r.status} ${await r.text()}`);
  }

  let settled = 0;
  try {
    settled = await settle(url, key, finished);
  } catch (e) {
    errors.push(e.message);
  }
  return { saved: rows.length, settled, errors };
                                        }
     
