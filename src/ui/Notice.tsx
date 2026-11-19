import { useState, type ReactNode } from 'react';

// From SVG Repo (svgrepo.com), CC0: no attribution required.
import closeIcon from './assets/cancel.svg';

type Props = {
  error?: boolean;
  children: ReactNode;
};

/**
 * A notice the reader can close. It stays closed until the page reloads, or
 * until its parent gives it a new `key`, as a fresh sync does for its result.
 */
export function Notice({ error = false, children }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <p className={`notice dismissible${error ? ' error' : ''}`} role={error ? 'alert' : undefined}>
      <span className="notice-body">{children}</span>
      <button type="button" className="dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss" title="Dismiss">
        <img src={closeIcon} alt="" width={16} height={16} />
      </button>
    </p>
  );
}
