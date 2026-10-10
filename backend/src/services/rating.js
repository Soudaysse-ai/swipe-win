// Cotes compétitives.
//  - Elo (Yas Connect, Yas Penalty) : R' = R + K × (S − E), K = 32, cote initiale 1000.
//  - OpenSkill, modèle Plackett-Luce de Weng & Lin (Yas Cards, Yas Ludo) : tient
//    compte de l'ordre d'arrivée complet de 2 à 4 joueurs. La cote affichée vaut
//    40 × μ, soit 1000 au départ (μ₀ = 25) pour rester sur la même échelle que l'Elo.

const ELO_K = 32;
const ELO_INITIAL = 1000;

function eloExpected(ra, rb) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

// score : 1 victoire, 0.5 nul, 0 défaite (du point de vue de A)
function elo(ra, rb, scoreA, k = ELO_K) {
  const ea = eloExpected(ra, rb);
  const eb = 1 - ea;
  return {
    a: ra + k * (scoreA - ea),
    b: rb + k * ((1 - scoreA) - eb),
  };
}

const OS = {
  MU: 25,
  SIGMA: 25 / 3,
  BETA: 25 / 6,
  KAPPA: 0.0001,
  TAU: 25 / 300,
  SCALE: 40,
};

const osDisplay = (mu) => OS.SCALE * mu;

// players : [{ mu, sigma, rank }] avec rank = place finale (1 = premier, égalités possibles).
// Renvoie [{ mu, sigma }] dans le même ordre.
function plackettLuce(players) {
  const sigmaSq = players.map(p => p.sigma ** 2 + OS.TAU ** 2);
  const c = Math.sqrt(players.reduce((s, _p, i) => s + sigmaSq[i] + OS.BETA ** 2, 0));
  const expMu = players.map(p => Math.exp(p.mu / c));
  // sumQ[q] = Σ exp(μ_i / c) pour les joueurs classés au rang de q ou après
  const sumQ = players.map(q => players.reduce((s, i, idx) => (i.rank >= q.rank ? s + expMu[idx] : s), 0));
  // a[q] = nombre de joueurs à égalité avec q
  const a = players.map(q => players.filter(i => i.rank === q.rank).length);

  return players.map((pi, i) => {
    let omega = 0;
    let delta = 0;
    players.forEach((pq, q) => {
      if (pq.rank > pi.rank) return;
      const quotient = expMu[i] / sumQ[q];
      omega += (i === q ? 1 - quotient : -quotient) / a[q];
      delta += (quotient * (1 - quotient)) / a[q];
    });
    const gamma = Math.sqrt(sigmaSq[i]) / c;
    const newMu = pi.mu + (sigmaSq[i] / c) * omega;
    const newSigma = Math.sqrt(sigmaSq[i]) * Math.sqrt(Math.max(1 - gamma * (sigmaSq[i] / c ** 2) * delta, OS.KAPPA));
    return { mu: newMu, sigma: newSigma };
  });
}

module.exports = { elo, eloExpected, ELO_K, ELO_INITIAL, plackettLuce, OS, osDisplay };
