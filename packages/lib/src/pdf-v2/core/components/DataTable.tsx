import type { DataTableProps } from "../types/common";

export function DataTable<T>({ columns, rows, density = "normal" }: DataTableProps<T>) {
  const visibleColumns = columns.filter((column) => {
    if (!column.hideIfAllRowsEmpty) {
      return true;
    }

    return rows.some((row) => !(column.isEmpty?.(row) ?? false));
  });

  if (!visibleColumns.length) {
    return null;
  }

  return (
    <div className="pdf-table-wrap">
      <table className={`pdf-table ${density === "compact" ? "pdf-table--compact" : ""}`}>
        <thead>
          <tr>
            {visibleColumns.map((column) => (
              <th
                key={column.key}
                style={{
                  width: column.width,
                  textAlign: column.align ?? "left"
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {visibleColumns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align ?? "left" }}>
                  {column.render(row) ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
