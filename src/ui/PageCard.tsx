import type { ReactNode } from 'react';

import { Link } from './router.tsx';

type Props = {
  to: string;
  title: string;
  blurb: string;
  /** Room for a figure or a small chart under the blurb, later. */
  children?: ReactNode;
};

/** A link to one of the app's pages, as a card on the home page. */
export function PageCard({ to, title, blurb, children }: Props) {
  return (
    <Link to={to} className="page-card">
      <strong>{title}</strong>
      <span>{blurb}</span>
      {children}
    </Link>
  );
}
