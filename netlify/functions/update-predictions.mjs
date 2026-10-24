import { runUpdate } from '../lib/model.mjs';

// Se lance automatiquement le lundi et le jeudi à 17h (heure UTC).
export default async () => {
  const res = await runUpdate();
  console.log(JSON.stringify(res));
};

export const config = { schedule: '0 17 * * 1,4' };
