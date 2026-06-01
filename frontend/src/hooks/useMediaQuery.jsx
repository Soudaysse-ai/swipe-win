import { useState, useEffect } from 'react';

// Renvoie true si la media query correspond. Ex: useMediaQuery('(max-width: 768px)')
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(query).matches
    : false);

  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// Raccourci pratique : true sur écrans mobiles (≤ 768px)
export function useIsMobile() {
  return useMediaQuery('(max-width: 768px)');
}
