// Renvoie les pronostics à la page web, sans exposer les clés Supabase.
export default async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const r = await fetch(
    `${url}/rest/v1/predictions?select=*&utc_date=gte.${encodeURIComponent(since)}&order=utc_date.asc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!r.ok) return Response.json({ error: 'Lecture impossible' }, { status: 502 });
  return new Response(await r.text(), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
};

export const config = { path: '/api/predictions' };
