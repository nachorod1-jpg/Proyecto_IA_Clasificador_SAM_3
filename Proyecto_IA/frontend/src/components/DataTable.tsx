import { ReactNode } from 'react';

interface Column<T> {
  key: keyof T | string;
  header: string;
  // eslint-disable-next-line no-unused-vars
  render?: (_item: T) => ReactNode;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  emptyMessage?: string;
}

function DataTable<T>({ data, columns, emptyMessage = 'Sin registros' }: Props<T>) {
  if (!data.length) {
    return <div className="rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-600">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-700">
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} className="px-4 py-3">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
          {data.map((item, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={String(col.key)} className="px-4 py-3 align-top">
                  {col.render ? col.render(item) : (item as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
