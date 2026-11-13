// Administration des licences. Protégé par ADMIN_TOKEN (en-tête x-admin-token).
import { randomInt } from 'node:crypto';
import { sb, fmt, j, isAdmin } from '../lib/license.mjs';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1
const newCode = () => Array.from({ length: 12 }, () => ALPHA[randomInt(ALPHA.length)]).join('');
const patch = (id, o) =>
  sb(`licenses?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(o) });

export default async (req) => {
  if (req.method !== 'POST') return j({ error: 'Méthode non autorisée' }, 405);
  if (!isAdmin(req)) return j({ error: 'Non autorisé' }, 401);
  let b;
  try { b = await req.json(); } catch { return j({ error: 'Requête invalide' }, 400); }

  try {
    if (b.action === 'create') {
      const days = Math.round(Number(b.days));
      const count = Math.min(50, Math.max(1, Math.round(Number(b.count) || 1)));
      if (!(days > 0 && days <= 3660)) return j({ error: 'Durée invalide' }, 400);
      const note = String(b.note || '').slice(0, 80);
      const rows = Array.from({ length: count }, () => ({ code: newCode(), days, note }));
      const r = await sb('licenses', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(rows) });
      if (!r.ok) return j({ error: 'Création impossible' }, 502);
      return j({ codes: (await r.json()).map((x) => ({ id: x.id, code: fmt(x.code), days: x.days, note: x.note })) });
    }

    if (b.action === 'list') {
      const r = await sb('licenses?select=*&order=id.desc&limit=200');
      if (!r.ok) return j({ error: 'Lecture impossible' }, 502);
      return j((await r.json()).map((x) => ({ ...x, code: fmt(x.code) })));
    }

    const id = Math.round(Number(b.id));
    if (!id) return j({ error: 'Identifiant manquant' }, 400);

    if (b.action === 'revoke') { await patch(id, { revoked: !!b.revoked }); return j({ ok: true }); }
    if (b.action === 'reset_device') { await patch(id, { device_id: null }); return j({ ok: true }); }
    if (b.action === 'extend') {
      const d = Math.round(Number(b.days));
      if (!(d > 0 && d <= 3660)) return j({ error: 'Durée invalide' }, 400);
      const r = await sb(`licenses?id=eq.${id}&select=*`);
      const l = (await r.json())[0];
      if (!l) return j({ error: 'Licence introuvable' }, 404);
      if (l.activated_at) {
        const base = Math.max(new Date(l.expires_at).getTime(), Date.now());
        await patch(id, { expires_at: new Date(base + d * 86400000).toISOString() });
      } else {
        await patch(id, { days: l.days + d });
      }
      return j({ ok: true });
    }
    return j({ error: 'Action inconnue' }, 400);
  } catch {
    return j({ error: 'Erreur serveur' }, 500);
  }
};

export const config = { path: '/api/license-admin' };
