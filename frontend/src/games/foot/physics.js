// Prévision de trajectoire pendant la visée (Yas Foot). Même physique que le
// serveur (constantes reçues dans `view.field.physics`), mais seulement pour
// dessiner un guide : le résultat officiel reste celui calculé par le serveur.

function collide(a, b, P) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d; const ny = dy / d;
  const ia = 1 / a.m; const ib = 1 / b.m; const sum = ia + ib;
  const overlap = min - d;
  a.x -= nx * overlap * (ia / sum); a.y -= ny * overlap * (ia / sum);
  b.x += nx * overlap * (ib / sum); b.y += ny * overlap * (ib / sum);
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv >= 0) return 0;
  const j = (-(1 + (a.ball || b.ball ? P.eBall : P.eBody)) * rv) / sum;
  a.vx -= j * ia * nx; a.vy -= j * ia * ny;
  b.vx += j * ib * nx; b.vy += j * ib * ny;
  return -rv;
}

function bounds(b, F, P) {
  const { W, H, goalTop: GT, goalBottom: GB, goalDepth: D, postR } = F;
  for (const [px, py] of [[0, GT], [0, GB], [W, GT], [W, GB]]) {
    const dx = b.x - px; const dy = b.y - py; const min = b.r + postR; const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 === 0) continue;
    const d = Math.sqrt(d2); const nx = dx / d; const ny = dy / d;
    b.x = px + nx * min; b.y = py + ny * min;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + P.eWall) * vn * nx; b.vy -= (1 + P.eWall) * vn * ny; }
  }
  const r = b.r;
  const fits = b.y >= GT + r && b.y <= GB - r;
  if (b.x < 0 || b.x > W) {
    if (b.x < -D + r) { b.x = -D + r; b.vx = Math.abs(b.vx) * P.eWall; }
    if (b.x > W + D - r) { b.x = W + D - r; b.vx = -Math.abs(b.vx) * P.eWall; }
    if (b.y < GT + r) { b.y = GT + r; b.vy = Math.abs(b.vy) * P.eWall; }
    if (b.y > GB - r) { b.y = GB - r; b.vy = -Math.abs(b.vy) * P.eWall; }
    return;
  }
  if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * P.eWall; }
  if (b.y > H - r) { b.y = H - r; b.vy = -Math.abs(b.vy) * P.eWall; }
  if (b.x < r && !fits) { b.x = r; b.vx = Math.abs(b.vx) * P.eWall; }
  if (b.x > W - r && !fits) { b.x = W - r; b.vx = -Math.abs(b.vx) * P.eWall; }
}

/**
 * Trajet prévu du palet tiré et, s'il touche le ballon, du ballon ensuite.
 * `power` (0–1) et la direction (dx, dy) comme l'action envoyée au serveur.
 * Renvoie { shooter: [[x, y]…], ball: [[x, y]…], hitsBall, mate } où `mate` est
 * vrai si le ballon file vers un coéquipier (passe probable).
 */
export function predict(view, userId, disc, dx, dy, { ticks = 120, ballTicks = 70 } = {}) {
  const F = view.field;
  const P = F.physics;
  if (!P) return null;
  const len = Math.hypot(dx, dy) || 1;
  const power = Math.min(1, len);
  const bodies = [];
  for (const u of view.players) {
    view.discs[u].forEach(([x, y], i) => bodies.push({ x, y, vx: 0, vy: 0, r: F.discR, m: P.discMass, damp: P.dampDisc, owner: u, i }));
  }
  const ball = { x: view.ball[0], y: view.ball[1], vx: 0, vy: 0, r: F.ballR, m: P.ballMass, damp: P.dampBall, ball: true };
  bodies.push(ball);
  const shooter = bodies.find(b => b.owner === userId && b.i === disc);
  shooter.vx = (dx / len) * power * P.maxSpeed;
  shooter.vy = (dy / len) * power * P.maxSpeed;
  const out = { shooter: [[shooter.x, shooter.y]], ball: [], hitsBall: false, mate: false };
  let ballLeft = ballTicks;
  let firstOther = null;
  for (let t = 1; t <= ticks; t++) {
    for (let s = 0; s < P.substeps; s++) {
      for (const b of bodies) { b.x += b.vx / P.substeps; b.y += b.vy / P.substeps; }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i]; const c = bodies[j];
          if (!collide(a, c, P)) continue;
          if (a.ball || c.ball) {
            const d = a.ball ? c : a;
            if (d === shooter && !out.hitsBall) { out.hitsBall = true; out.ball.push([ball.x, ball.y]); }
            else if (out.hitsBall && !firstOther && d !== shooter) firstOther = d;
          }
        }
      }
      for (const b of bodies) bounds(b, F, P);
    }
    let moving = false;
    for (const b of bodies) {
      b.vx *= b.damp; b.vy *= b.damp;
      if (b.vx * b.vx + b.vy * b.vy < P.stop * P.stop) { b.vx = 0; b.vy = 0; } else moving = true;
    }
    if (!out.hitsBall && t % 2 === 0) out.shooter.push([shooter.x, shooter.y]);
    if (out.hitsBall) {
      if (t % 2 === 0) out.ball.push([ball.x, ball.y]);
      ballLeft -= 1;
      if (ballLeft <= 0) break;
    }
    if (ball.x < -F.ballR || ball.x > F.W + F.ballR || !moving) break;
  }
  if (!out.hitsBall) out.shooter.push([shooter.x, shooter.y]);
  else out.ball.push([ball.x, ball.y]);
  out.mate = !!firstOther && firstOther.owner === userId;
  return out;
}
