import { useMemo, useState } from 'react';

import { columns, sortWines, type Column, type Direction } from '../columns.ts';
import type { Wine } from '../wine.ts';

type Sort = { key: string; direction: Direction };

/** Text sorts A-Z first; numbers are more useful biggest-first. */
function defaultDirection(column: Column): Direction {
  return column.align === 'right' ? 'desc' : 'asc';
}

export function WineTable({ wines }: { wines: Wine[] }) {
  const [sort, setSort] = useState<Sort>({ key: 'producer', direction: 'asc' });

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sort.key) ?? columns[0]!;
    return sortWines(wines, column, sort.direction);
  }, [wines, sort]);

  const toggle = (column: Column) => {
    setSort((current) =>
      current.key === column.key
        ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: defaultDirection(column) },
    );
  };

  return (
    <table className="wines">
      <thead>
        <tr>
          {columns.map((column) => {
            const active = sort.key === column.key;
            return (
              <th
                key={column.key}
                className={`${column.align}${active ? ' sorted' : ''}`}
                aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" onClick={() => toggle(column)}>
                  {column.label}
                  <span className="arrow">{active ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((wine) => (
          <tr key={`${wine.id}-${wine.size}-${wine.vintage ?? 'NV'}`}>
            {columns.map((column) => (
              <td key={column.key} className={column.align} title={column.title?.(wine)}>
                {column.render(wine)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
