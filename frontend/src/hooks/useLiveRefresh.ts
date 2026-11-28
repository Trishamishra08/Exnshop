import { useEffect, useRef, useState } from 'react';

/**
 * Keeps an order screen in step with the server: `tick` goes up every `intervalMs` while the
 * tab is visible, and again when the person comes back to the tab. Put `tick` in the fetch
 * effect's dependencies so a payment marked Paid, an online payment captured or a refund shows
 * up on its own, in the admin and seller panels alike.
 *
 * Call `isBackground()` once at the start of the fetch: true means the timer started it, so the
 * page refreshes quietly (no spinner, no error banner over data already on screen).
 */
export function useLiveRefresh(intervalMs = 30000) {
  const [tick, setTick] = useState(0);
  const seen = useRef(0);

  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    };
    const timer = window.setInterval(bump, intervalMs);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', bump);
    };
  }, [intervalMs]);

  const isBackground = () => {
    const background = tick !== seen.current;
    seen.current = tick;
    return background;
  };

  return { tick, isBackground };
}
