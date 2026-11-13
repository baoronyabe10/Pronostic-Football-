import { runUpdate } from '../lib/model.mjs';

// Groupe 2 (Ligue des champions, Championship, Eredivisie, Primeira Liga, Brasileirão) :
// 3 minutes après le groupe 1, pour ne pas dépasser la limite de 10 demandes par minute.
export default async () => {
  const res = await runUpdate({ group: 2 });
  console.log(JSON.stringify(res));
};

export const config = { schedule: '3 17 * * 1,4' };
