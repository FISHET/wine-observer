import type { Breakdown, Tally } from '../breakdown.ts';
import { Flag } from './Flag.tsx';

const percent = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100);

type ListProps = { label: string; tallies: Tally[]; total: number; flags?: boolean };

/**
 * A meter list: name, bar and figure per row. Each bar is that entry's share
 * of every bottle in the breakdown, so the lists share one scale.
 */
function TallyList({ label, tallies, total, flags = false }: ListProps) {
  return (
    <div className="tally">
      <h3 className="tally-label">{label}</h3>
      <ol className="tally-list">
        {tallies.map((tally) => {
          const share = percent(tally.bottles, total);
          return (
            <li
              key={`${tally.name}|${tally.country ?? ''}`}
              title={`${tally.bottles} bottles · ${Math.round(share)}% of ${total}`}
            >
              <span className="tally-name">
                {flags && <Flag country={tally.country} />}
                {tally.name}
              </span>
              <span className="tally-count">{tally.bottles}</span>
              <span className="tally-bar" aria-hidden="true">
                <span style={{ width: `${share}%` }} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The top styles, regions (with flags) and grapes of a breakdown. */
export function BreakdownLists({ breakdown }: { breakdown: Breakdown }) {
  return (
    <div className="breakdown">
      <TallyList label="Styles" tallies={breakdown.styles} total={breakdown.bottles} />
      <TallyList label="Regions" tallies={breakdown.regions} total={breakdown.bottles} flags />
      <TallyList label="Grapes" tallies={breakdown.grapes} total={breakdown.bottles} />
    </div>
  );
}
