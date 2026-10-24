// Renvoie les pronostics à la page web, sans exposer les clés Supabase.
// /api/predictions          -> matchs à venir
// /api/predictions?past=1   -> matchs terminés avec leur score réel (bilan)
export default async (req) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const past = new URL(req.url).searchParams.get('past');
  let query;
  if (past) {
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    query = `select=*&result_home=not.is.null&utc_date=gte.${encodeURIComponent(since)}&order=utc_date.desc&limit=300`;
  } else {
    const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    query = `select=*&utc_date=gte.${encodeURIComponent(since)}&order=utc_date.asc`;
  }
  const r = await fetch(`${url}/rest/v1/predictions?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return Response.json({ error: 'Lecture impossible' }, { status: 502 });
  return new Response(await r.text(), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
};

export const config = { path: '/api/predictions' };
