import { runUpdate } from '../lib/model.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return new Response('Non autorisé', { status: 401 });
  }
  try {
    // Ajoutez &group=1 ou &group=2 (un groupe à la fois), ou &comp=PL pour un seul championnat.
    const res = await runUpdate({
      only: url.searchParams.get('comp') || undefined,
      group: url.searchParams.get('group') || undefined,
    });
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: '/api/run' };
