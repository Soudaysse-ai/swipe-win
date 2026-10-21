// Tirs de Yas Foot côté navigateur, avec la simulation partagée avec le serveur
// (sim.js, copie exacte de la physique du serveur).
//  - shoot() : le tir complet, calculé à l'instant où le joueur relâche, pour
//    l'animer sans attendre le serveur (qui calcule exactement la même chose).
import { simulate, shotVelocity, CONSTANTS } from './sim';

export const TICK_MS = CONSTANTS.TICK_MS;

// Direction et puissance envoyées au serveur : arrondies au millième, et c'est
// sur ces valeurs arrondies que le navigateur simule aussi.
export function shotInput(dx, dy) {
  return { dx: Math.round(dx * 1000) / 1000, dy: Math.round(dy * 1000) / 1000 };
}

// Tir complet : une image par pas (60 par seconde).
export function shoot(view, userId, disc, dx, dy) {
  const v = shotVelocity(dx, dy);
  if (!v) return null;
  return { ...simulate(view, userId, disc, v.vx, v.vy, { frameEvery: 1 }), power: v.power, frameMs: TICK_MS };
}
