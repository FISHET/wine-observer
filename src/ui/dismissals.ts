/**
 * Which notices have been closed, kept in the browser so they stay closed
 * across reloads. A notice's key includes what it's about, typically the last
 * sync time, so the same notice shows again once that changes.
 *
 * Storage can be missing or refuse (private windows, blocked site data), so
 * every access is guarded: at worst a closed notice comes back on reload.
 */
const STORE_KEY = 'dismissed-notices';

/** Old keys are never cleared by a match, so keep only the most recent. */
export const MAX_REMEMBERED = 50;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(store: Store | null): string[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function isDismissed(key: string, store: Store | null = defaultStore()): boolean {
  return read(store).includes(key);
}

export function rememberDismissed(key: string, store: Store | null = defaultStore()): void {
  const keys = [...read(store).filter((k) => k !== key), key].slice(-MAX_REMEMBERED);
  try {
    store?.setItem(STORE_KEY, JSON.stringify(keys));
  } catch {
    // Full or blocked: the notice just won't stay closed after a reload.
  }
}
