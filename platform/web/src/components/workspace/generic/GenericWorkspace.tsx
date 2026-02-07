import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import type { WorkspaceRow } from './generic.types'

const columnHelper = createColumnHelper<WorkspaceRow>()

const columns = [
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue()
      const statusClass =
        status === 'active' ? 'badge-ok' :
        status === 'completed' ? 'badge-primary' :
        'badge-warn'
      return <span className={`badge ${statusClass}`}>{status}</span>
    },
  }),
  columnHelper.accessor('createdAt', {
    header: 'Created',
    cell: (info) => info.getValue().toLocaleDateString(),
  }),
]

export function GenericWorkspace({ employee: _employee }: { employee: unknown }) {
  const [data, setData] = useState<WorkspaceRow[]>([
    { id: '1', name: 'Task 1', status: 'active', createdAt: new Date() },
    { id: '2', name: 'Task 2', status: 'pending', createdAt: new Date(Date.now() - 86400000) },
    { id: '3', name: 'Task 3', status: 'completed', createdAt: new Date(Date.now() - 172800000) },
  ])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const addRow = () => {
    const newRow: WorkspaceRow = {
      id: crypto.randomUUID(),
      name: `Task ${data.length + 1}`,
      status: 'pending',
      createdAt: new Date(),
    }
    setData((prev) => [...prev, newRow])
  }

  const deleteRow = (id: string) => {
    setData((prev) => prev.filter((row) => row.id !== id))
  }

  return (
    <div className="generic-workspace">
      <div className="generic-workspace__header">
        <h3>Workspace Data</h3>
        <button className="btn btn-primary" onClick={addRow}>
          Add Row
        </button>
      </div>

      <div className="generic-workspace__table-wrapper">
        <table className="generic-workspace__table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
                <td>
                  <button
                    className="btn btn-ghost"
                    onClick={() => deleteRow(row.original.id)}
                    title="Delete row"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length === 0 && (
        <div className="generic-workspace__empty">
          <p>No data yet. Click "Add Row" to get started.</p>
        </div>
      )}
    </div>
  )
}
