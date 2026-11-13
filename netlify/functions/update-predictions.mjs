import { runUpdate } from '../lib/model.mjs';

// Groupe 1 (Premier League, Liga, Bundesliga, Serie A, Ligue 1) :
// se lance automatiquement le lundi et le jeudi à 17h00 (heure UTC).
export default async () => {
  const res = await runUpdate({ group: 1 });
  console.log(JSON.stringify(res));
};

export const config = { schedule: '0 17 * * 1,4' };
