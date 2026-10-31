import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** Runs `fn` now, every `ms` while the app is on screen, and again whenever the app returns to the foreground.
 *  `fn` always sees the latest state, never overlaps itself, and its errors are ignored (the next tick retries). */
export function useLive(fn, ms) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy || AppState.currentState !== 'active') return;
      busy = true;
      try { await latest.current(); } catch {}
      busy = false;
    };
    tick();
    const timer = setInterval(tick, ms);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') tick(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [ms]);
}
