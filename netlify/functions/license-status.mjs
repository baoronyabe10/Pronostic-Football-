// Indique si la licence de l'appareil est valide et combien de jours il reste.
import { requireLicense, deny, j } from '../lib/license.mjs';

export default async (req) => {
  const lic = await requireLicense(req);
  if (!lic.ok) return deny(lic);
  const ms = new Date(lic.license.expires_at) - new Date();
  return j({ valid: true, expires_at: lic.license.expires_at, days_left: Math.max(0, Math.ceil(ms / 86400000)) });
};

export const config = { path: '/api/license' };
