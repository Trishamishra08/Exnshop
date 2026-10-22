import type { NavigateFunction } from 'react-router-dom';

/**
 * Back button behaviour: go one step back in the app's own history, or to `fallback`
 * when the page was opened directly (new tab, shared link) and there is no earlier
 * entry to go back to. react-router keeps each entry's position in `history.state.idx`.
 */
export const goBackOr = (navigate: NavigateFunction, fallback: string) => {
  const position = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (position > 0) navigate(-1);
  else navigate(fallback, { replace: true });
};
