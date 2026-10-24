import { runUpdate } from '../lib/model.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return new Response('Non autorisé', { status: 401 });
  }
  try {
    const res = await runUpdate({ only: url.searchParams.get('comp') || undefined });
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: '/api/run' };
