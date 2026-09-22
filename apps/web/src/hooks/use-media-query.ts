'use client';
import * as React from 'react';
export function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const l = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener('change', l);
    return () => m.removeEventListener('change', l);
  }, [query]);
  return matches;
}
