// Tirs de Yas Foot côté navigateur, avec la simulation partagée avec le serveur
// (sim.js, copie exacte de la physique du serveur).
//  - shoot() : le tir complet, calculé à l'instant où le joueur relâche, pour
//    l'animer sans attendre le serveur (qui calcule exactement la même chose).
//  - predict() : un aperçu court pendant la visée (où part le ballon, passe ?).
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

/**
 * Aperçu pendant la visée : trajet du ballon une fois touché (s'il l'est), et
 * `mate` vrai si le ballon file vers un coéquipier (passe probable).
 */
export function predict(view, userId, disc, dx, dy, { ticks = 150 } = {}) {
  const v = shotVelocity(dx, dy);
  if (!v) return null;
  const sim = simulate(view, userId, disc, v.vx, v.vy, { frameEvery: 2, maxTicks: ticks });
  const [bx, by] = view.ball;
  const start = sim.frames.findIndex(f => f[10][0] !== Math.round(bx) || f[10][1] !== Math.round(by));
  const ball = start < 0 ? [] : sim.frames.slice(Math.max(0, start - 1), start + 36).map(f => f[10]);
  return { ball, hitsBall: start >= 0, mate: !!sim.pass };
}
