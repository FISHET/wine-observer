import type { ReactNode } from 'react';

type Props = {
  label: string;
  value: string;
  /** A short qualifier under the figure: "14 more on order". */
  note?: ReactNode;
};

/** A single headline figure with its label. */
export function StatTile({ label, value, note }: Props) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
