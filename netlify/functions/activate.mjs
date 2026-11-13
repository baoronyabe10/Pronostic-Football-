// Activation d'un code de licence : lie le code à l'appareil et démarre la durée.
import { sb, norm, getByCode, state, j } from '../lib/license.mjs';

export default async (req) => {
  if (req.method !== 'POST') return j({ ok: false, reason: 'Méthode non autorisée.' }, 405);
  let b;
  try { b = await req.json(); } catch { return j({ ok: false, reason: 'Requête invalide.' }, 400); }
  const code = norm(b.code);
  const dev = String(b.device || '');
  if (code.length !== 12 || dev.length < 8 || dev.length > 100) return j({ ok: false, reason: 'Code invalide.' }, 400);

  try {
    let l = await getByCode(code);
    if (!l) return j({ ok: false, reason: 'Code inconnu. Vérifiez-le.' }, 404);
    if (l.revoked) return j({ ok: false, reason: 'Cette licence a été désactivée.' }, 403);

    if (!l.activated_at) {
      // Première activation : la durée commence maintenant (heure du serveur).
      const now = new Date();
      const exp = new Date(now.getTime() + l.days * 86400000);
      const r = await sb(`licenses?id=eq.${l.id}&activated_at=is.null`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ activated_at: now.toISOString(), expires_at: exp.toISOString(), device_id: dev }),
      });
      if (!r.ok) return j({ ok: false, reason: 'Activation impossible.' }, 502);
      l = (await r.json())[0] || (await getByCode(code));
    } else if (!l.device_id) {
      // Appareil réinitialisé par l'administrateur : on lie le nouvel appareil.
      const r = await sb(`licenses?id=eq.${l.id}&device_id=is.null`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ device_id: dev }),
      });
      if (r.ok) l = (await r.json())[0] || (await getByCode(code));
    }

    const s = state(l, dev);
    if (!s.ok) {
      const reason = s.reason === 'Cette licence est liée à un autre appareil.'
        ? 'Ce code est déjà utilisé sur un autre appareil.' : s.reason;
      return j({ ok: false, reason }, 403);
    }
    return j({ ok: true, expires_at: l.expires_at });
  } catch {
    return j({ ok: false, reason: 'Service momentanément indisponible. Réessayez.' }, 503);
  }
};

export const config = { path: '/api/activate' };
