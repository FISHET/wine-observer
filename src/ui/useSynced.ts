import { useCallback, useEffect, useState } from 'react';

import type { OutcomeBody, SyncedPage, SyncResponse } from '../api.ts';

type Phase = 'loading' | 'ready' | 'error';

export type SyncedState<Page extends SyncedPage> = {
  page: Page | null;
  phase: Phase;
  error: string | null;
  syncing: boolean;
  /** The result of the last sync this session, so the UI can explain a skip. */
  outcome: OutcomeBody | null;
  sync: (force?: boolean) => void;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed: ${response.status}`);
  }

  return body as T;
}

/**
 * Loads a page's data from `endpoint`, and syncs it from CellarTracker by
 * POSTing to `syncEndpoint`, which answers with the fresh data.
 */
export function useSynced<Page extends SyncedPage>(
  endpoint: string,
  syncEndpoint: string,
): SyncedState<Page> {
  const [page, setPage] = useState<Page | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeBody | null>(null);

  useEffect(() => {
    let cancelled = false;

    request<Page>(endpoint)
      .then((data) => {
        if (cancelled) return;
        setPage(data);
        setPhase('ready');
      })
      .catch((caught: Error) => {
        if (cancelled) return;
        setError(caught.message);
        setPhase('error');
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const sync = useCallback(
    (force = false) => {
      setSyncing(true);
      setError(null);

      request<SyncResponse<Page>>(`${syncEndpoint}${force ? '?force=1' : ''}`, { method: 'POST' })
        .then((data) => {
          setPage(data);
          setOutcome(data.outcome);
          setPhase('ready');
        })
        .catch((caught: Error) => setError(caught.message))
        .finally(() => setSyncing(false));
    },
    [syncEndpoint],
  );

  return { page, phase, error, syncing, outcome, sync };
}
