import { useMemo, useState } from 'react';

import { sortRows, type Column, type Direction } from '../table.ts';

type Sort = { key: string; direction: Direction };

/** Text sorts A-Z first; numbers and dates are more useful biggest-first. */
function defaultDirection<T>(column: Column<T>): Direction {
  return column.align === 'right' ? 'desc' : 'asc';
}

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort: Sort;
};

export function DataTable<T>({ rows, columns, rowKey, initialSort }: Props<T>) {
  const [sort, setSort] = useState<Sort>(initialSort);

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sort.key) ?? columns[0]!;
    return sortRows(rows, column, sort.direction);
  }, [rows, columns, sort]);

  const toggle = (column: Column<T>) => {
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
        {sorted.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td
                key={column.key}
                className={`col-${column.key} ${column.align}${column.wrap ? ' wrap' : ''}`}
                title={column.title?.(row)}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
