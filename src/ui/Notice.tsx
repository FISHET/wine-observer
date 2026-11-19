import { useState, type ReactNode } from 'react';

// From SVG Repo (svgrepo.com), CC0: no attribution required.
import closeIcon from './assets/cancel.svg';
import { isDismissed, rememberDismissed } from './dismissals.ts';

type Props = {
  error?: boolean;
  /**
   * Keeps the notice closed across reloads while this key stays the same.
   * Include what the notice is about, such as the last sync time, so it
   * shows again once that changes. Without it, closing lasts until reload.
   */
  remember?: string;
  children: ReactNode;
};

/**
 * A notice the reader can close. Without `remember`, it stays closed until
 * the page reloads, or until its parent gives it a new `key`, as a fresh sync
 * does for its result.
 */
export function Notice({ error = false, remember, children }: Props) {
  // Which key was closed here, so a new `remember` key (after a sync) shows
  // it again, and closing still works when the browser won't store anything.
  const key = remember ?? '';
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const dismissed = closedKey === key || (remember !== undefined && isDismissed(remember));
  if (dismissed) return null;

  const dismiss = () => {
    if (remember) rememberDismissed(remember);
    setClosedKey(key);
  };

  return (
    <p className={`notice dismissible${error ? ' error' : ''}`} role={error ? 'alert' : undefined}>
      <span className="notice-body">{children}</span>
      <button type="button" className="dismiss" onClick={dismiss} aria-label="Dismiss" title="Dismiss">
        <img src={closeIcon} alt="" width={16} height={16} />
      </button>
    </p>
  );
}
