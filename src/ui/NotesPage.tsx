import type { NotesData } from '../api.ts';
import type { NotesTotals } from '../notes.ts';
import { notesColumns } from '../notesColumns.ts';
import { NOTES_TABLES } from '../pageTables.ts';
import { DataTable } from './DataTable.tsx';
import { SyncedLayout } from './SyncedLayout.tsx';
import { useSynced } from './useSynced.ts';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function summarise(totals: NotesTotals): string {
  const notes =
    totals.notesWithoutBottle > 0
      ? `${plural(totals.notes, 'note')} (${totals.notesWithoutBottle} not from the cellar)`
      : plural(totals.notes, 'note');
  const bottles =
    totals.bottlesWithoutNote > 0
      ? `${plural(totals.bottles, 'bottle')} consumed (${totals.bottlesWithoutNote} without a note)`
      : `${plural(totals.bottles, 'bottle')} consumed`;
  return `${notes} · ${bottles}`;
}

export function NotesPage() {
  const state = useSynced<NotesData>('/api/notes', '/api/notes/sync');
  const page = state.page;

  return (
    <SyncedLayout
      title="Notes"
      tables={NOTES_TABLES}
      state={state}
      summary={page && page.entries.length > 0 ? summarise(page.totals) : null}
      empty={
        <>
          No notes yet. Hit <strong>Sync</strong> to pull them from CellarTracker.
        </>
      }
    >
      {page && page.entries.length > 0 && (
        <DataTable
          rows={page.entries}
          columns={notesColumns}
          rowKey={(e) => e.key}
          initialSort={{ key: 'date', direction: 'desc' }}
        />
      )}
    </SyncedLayout>
  );
}
