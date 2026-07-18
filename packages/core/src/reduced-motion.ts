/**
 * Reduced-motion preference detection with SSR guards.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Subscribe to reduced-motion changes. Returns an unsubscribe function (or a
 * no-op when matchMedia is unavailable, e.g. during SSR).
 */
export function onReducedMotionChange(listener: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  let mql: MediaQueryList;
  try {
    mql = window.matchMedia(QUERY);
  } catch {
    return () => {};
  }
  const handler = (event: MediaQueryListEvent) => listener(event.matches);
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }
  // Safari < 14 fallback.
  mql.addListener(handler);
  return () => mql.removeListener(handler);
}
