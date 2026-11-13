// Gestion des licences (table "licenses" dans Supabase).
// Les clés restent dans les variables d'environnement Netlify.
import { timingSafeEqual } from 'node:crypto';

const hdr = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });

export function sb(path, o = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...o,
    headers: { ...hdr(key), ...(o.headers || {}) },
  });
}

export const norm = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const fmt = (c) => (String(c).match(/.{1,4}/g) || [c]).join('-');
export const j = (o, s = 200) => Response.json(o, { status: s, headers: { 'cache-control': 'no-store' } });

export async function getByCode(code) {
  const r = await sb(`licenses?code=eq.${encodeURIComponent(code)}&select=*`);
  if (!r.ok) throw new Error('Base indisponible');
  return (await r.json())[0] || null;
}

// Vérifie une licence pour un appareil donné.
export function state(l, device) {
  if (!l) return { ok: false, reason: 'Code inconnu. Vérifiez-le.' };
  if (l.revoked) return { ok: false, reason: 'Cette licence a été désactivée.' };
  if (!l.activated_at) return { ok: false, reason: 'Licence non activée.' };
  if (l.device_id !== device) return { ok: false, reason: 'Cette licence est liée à un autre appareil.' };
  if (new Date(l.expires_at) <= new Date()) return { ok: false, reason: 'Licence expirée. Entrez un nouveau code.', expired: true };
  return { ok: true };
}

// À appeler au début de chaque service protégé.
export async function requireLicense(req) {
  const code = norm(req.headers.get('x-license'));
  const dev = String(req.headers.get('x-device') || '');
  if (code.length !== 12 || dev.length < 8 || dev.length > 100) return { ok: false, reason: 'Licence requise.' };
  try {
    const l = await getByCode(code);
    return { ...state(l, dev), license: l };
  } catch {
    return { ok: false, down: true, reason: 'Service momentanément indisponible.' };
  }
}

export const deny = (lic) =>
  lic.down ? j({ error: 'down', reason: lic.reason }, 503) : j({ error: 'license', reason: lic.reason }, 401);

export function isAdmin(req) {
  const t = process.env.ADMIN_TOKEN || '';
  const g = req.headers.get('x-admin-token') || '';
  return t.length >= 12 && g.length === t.length && timingSafeEqual(Buffer.from(g), Buffer.from(t));
}
