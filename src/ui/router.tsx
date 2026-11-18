/**
 * Just enough routing for a handful of pages: the path from the address bar,
 * and links that change it without a reload. The server and Vite both fall
 * back to index.html for unknown paths, so a reload on /cellar still works.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const NAVIGATE = 'cellar:navigate';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE, onChange);
  };
}

/** The current path, without a trailing slash (other than for "/"). */
export function usePath(): string {
  const path = useSyncExternalStore(subscribe, () => window.location.pathname);
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function navigate(to: string): void {
  if (to === window.location.pathname) return;
  window.history.pushState(null, '', to);
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event(NAVIGATE));
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** A real link, so middle-click and ctrl-click still open a new tab. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || event.button !== 0 || modified) return;
    event.preventDefault();
    navigate(to);
  };

  return <a href={to} onClick={handle} {...rest} />;
}
