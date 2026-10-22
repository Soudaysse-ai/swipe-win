// Mise à jour automatique après une mise en ligne. Un téléphone qui garde le site
// ouvert (onglet ou application installée) continue sinon d'exécuter l'ancien code.
//  - Au retour sur le site et toutes les 5 minutes : on relit la page d'accueil ;
//    si son script principal a changé, on recharge (jamais pendant une partie :
//    on attend que le joueur la quitte).
//  - Si le fichier d'un jeu a disparu (ancienne version), on recharge une fois.
const EVERY_MS = 5 * 60 * 1000;
const MAIN = /\/assets\/index-[\w-]+\.js/;

const current = () => document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')?.match(MAIN)?.[0];
const inMatch = () => location.pathname.startsWith('/match/');

export function keepFresh() {
  const mine = current();
  if (!mine) return;
  let stale = false;
  let busy = false;

  const reloadIfSafe = () => { if (stale && !inMatch()) location.reload(); };

  async function check() {
    if (busy || stale || document.visibilityState !== 'visible') return;
    busy = true;
    try {
      const res = await fetch('/', { cache: 'no-store' });
      const live = (await res.text()).match(MAIN)?.[0];
      if (live && live !== mine) { stale = true; reloadIfSafe(); }
    } catch { /* hors ligne : on réessaiera */ }
    busy = false;
    navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
  }

  document.addEventListener('visibilitychange', check);
  setInterval(check, EVERY_MS);
  // Changement de page dans l'application (sortie d'une partie, par exemple).
  const push = history.pushState;
  history.pushState = function (...args) { const out = push.apply(this, args); reloadIfSafe(); return out; };
  window.addEventListener('popstate', reloadIfSafe);

  window.addEventListener('vite:preloadError', (e) => {
    try {
      if (sessionStorage.getItem('dy_reloaded') === mine) return;
      sessionStorage.setItem('dy_reloaded', mine);
    } catch { /* stockage indisponible : on recharge quand même */ }
    e.preventDefault();
    location.reload();
  });
}
