import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
};

/**
 * One panel on the home page's dashboard grid: a stat, a list, a chart.
 * Sizes are left to the grid for now; spans can come once there are a few.
 */
export function Card({ title, children }: Props) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  );
}
