import { useCallback, useEffect, useState } from 'react';

import type { Cellar, SyncResponse } from '../api.ts';

type Phase = 'loading' | 'ready' | 'error';

export type CellarState = {
  cellar: Cellar | null;
  phase: Phase;
  error: string | null;
  syncing: boolean;
  /** The result of the last sync this session, so the UI can explain a skip. */
  outcome: SyncResponse['outcome'] | null;
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

export function useCellar(): CellarState {
  const [cellar, setCellar] = useState<Cellar | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [outcome, setOutcome] = useState<SyncResponse['outcome'] | null>(null);

  useEffect(() => {
    let cancelled = false;

    request<Cellar>('/api/cellar')
      .then((data) => {
        if (cancelled) return;
        setCellar(data);
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
  }, []);

  const sync = useCallback(
    (force = false) => {
      setSyncing(true);
      setError(null);

      request<SyncResponse>(`/api/sync${force ? '?force=1' : ''}`, { method: 'POST' })
        .then((data) => {
          setCellar(data);
          setOutcome(data.outcome);
          setPhase('ready');
        })
        .catch((caught: Error) => setError(caught.message))
        .finally(() => setSyncing(false));
    },
    [],
  );

  return { cellar, phase, error, syncing, outcome, sync };
}
