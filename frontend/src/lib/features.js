// Fonctionnalités activées depuis le back-office (ex. « Swipe & gagne »).
// Une seule requête partagée par tous les composants, rafraîchie au plus une fois par minute.
import { useEffect, useState } from 'react';
import playerApi from './playerApi';

const MAX_AGE = 60_000;
let cache = null;
let fetchedAt = 0;
let pending = null;
const listeners = new Set();

function refresh() {
  if (pending) return pending;
  pending = playerApi.get('/features')
    .then((r) => { cache = r.data.features || {}; })
    // API injoignable : tout ce qui est optionnel reste masqué.
    .catch(() => { cache = cache || {}; })
    .finally(() => {
      fetchedAt = Date.now();
      pending = null;
      listeners.forEach(fn => fn(cache));
    });
  return pending;
}

// null pendant le premier chargement, puis { quiz: bool, ... }.
export function useFeatures() {
  const [features, setFeatures] = useState(cache);
  useEffect(() => {
    listeners.add(setFeatures);
    if (!cache || Date.now() - fetchedAt > MAX_AGE) refresh();
    return () => { listeners.delete(setFeatures); };
  }, []);
  return features;
}
