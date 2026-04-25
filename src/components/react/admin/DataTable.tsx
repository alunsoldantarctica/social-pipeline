import { useState, useMemo } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Edit2,
  Trash2,
  RefreshCw,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Column definition for the DataTable
 */
export interface Column<T> {
  /** Unique key for the column (usually matches field name) */
  key: string;
  /** Display label in header */
  label: string;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Column width class (e.g., 'w-32', 'min-w-[200px]') */
  width?: string;
  /** Custom render function for cell content */
  render?: (value: unknown, row: T) => React.ReactNode;
  /** Function to extract value for sorting/display */
  getValue?: (row: T) => unknown;
}

/**
 * Props for the DataTable component
 */
interface DataTableProps<T extends { _id: string; isActive?: boolean }> {
  /** Array of data to display */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Callback when edit button is clicked */
  onEdit?: (row: T) => void;
  /** Callback when delete button is clicked */
  onDelete?: (row: T) => void;
  /** Callback to toggle active status */
  onToggleActive?: (row: T) => void;
  /** Callback for custom row action */
  onRowAction?: (row: T, action: string) => void;
  /** Custom actions to add to the actions column */
  customActions?: Array<{
    key: string;
    icon: React.ReactNode;
    label: string;
    variant?: 'default' | 'danger' | 'success';
    show?: (row: T) => boolean;
  }>;
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Get unique key for each row */
  getRowKey?: (row: T) => string;
  /** Whether to show the actions column */
  showActions?: boolean;
  /** Whether to dim inactive rows */
  dimInactive?: boolean;
}

/**
 * DataTable - Reusable table component for admin data display
 * 
 * Features:
 * - Sortable columns
 * - Edit/Delete/Toggle actions
 * - Loading state
 * - Empty state
 * - Customizable cell rendering
 */
export function DataTable<T extends { _id: string; isActive?: boolean }>({
  data,
  columns,
  onEdit,
  onDelete,
  onToggleActive,
  onRowAction,
  customActions,
  isLoading = false,
  emptyMessage = 'No data available',
  getRowKey = (row) => row._id,
  showActions = true,
  dimInactive = true,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Handle column header click for sorting
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    const column = columns.find((c) => c.key === sortKey);
    if (!column) return data;

    return [...data].sort((a, b) => {
      const aVal = column.getValue ? column.getValue(a) : (a as Record<string, unknown>)[column.key];
      const bVal = column.getValue ? column.getValue(b) : (b as Record<string, unknown>)[column.key];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, columns, sortKey, sortDirection]);

  // Get cell value
  const getCellValue = (row: T, column: Column<T>): React.ReactNode => {
    const value = column.getValue
      ? column.getValue(row)
      : (row as Record<string, unknown>)[column.key];

    if (column.render) {
      return column.render(value, row);
    }

    if (value === null || value === undefined) {
      return <span className="text-slate-500">-</span>;
    }

    if (typeof value === 'boolean') {
      return value ? (
        <span className="text-green-400">Yes</span>
      ) : (
        <span className="text-slate-500">No</span>
      );
    }

    if (typeof value === 'number') {
      return value.toLocaleString();
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : <span className="text-slate-500">-</span>;
    }

    return String(value);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider',
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                  !column.align && 'text-left',
                  column.width,
                  column.sortable && 'cursor-pointer hover:text-slate-200 select-none'
                )}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="flex items-center gap-1">
                  <span>{column.label}</span>
                  {column.sortable && sortKey === column.key && (
                    sortDirection === 'asc' ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )
                  )}
                </div>
              </th>
            ))}
            {showActions && (onEdit || onDelete || onToggleActive || customActions) && (
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider text-right">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {sortedData.map((row) => (
            <tr
              key={getRowKey(row)}
              className={cn(
                'hover:bg-slate-800/50 transition-colors',
                dimInactive && row.isActive === false && 'opacity-50'
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-slate-300',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    column.width
                  )}
                >
                  {getCellValue(row, column)}
                </td>
              ))}
              {showActions && (onEdit || onDelete || onToggleActive || customActions) && (
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {/* Custom actions */}
                    {customActions?.filter((action) => !action.show || action.show(row)).map((action) => (
                      <button
                        key={action.key}
                        onClick={() => onRowAction?.(row, action.key)}
                        className={cn(
                          'p-1.5 rounded transition-colors',
                          action.variant === 'danger' &&
                            'text-slate-400 hover:text-red-400 hover:bg-red-900/30',
                          action.variant === 'success' &&
                            'text-slate-400 hover:text-green-400 hover:bg-green-900/30',
                          !action.variant &&
                            'text-slate-400 hover:text-white hover:bg-slate-700'
                        )}
                        title={action.label}
                      >
                        {action.icon}
                      </button>
                    ))}

                    {/* Edit button */}
                    {onEdit && (
                      <button
                        onClick={() => onEdit(row)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Toggle active button */}
                    {onToggleActive && row.isActive !== undefined && (
                      <button
                        onClick={() => onToggleActive(row)}
                        className={cn(
                          'p-1.5 rounded transition-colors',
                          row.isActive
                            ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30'
                            : 'text-slate-400 hover:text-green-400 hover:bg-green-900/30'
                        )}
                        title={row.isActive ? 'Deactivate' : 'Reactivate'}
                      >
                        {row.isActive ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    {/* Delete button */}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(row)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Common cell renderers
export const CellRenderers = {
  /** Render a monetary value with $ prefix */
  money: (value: unknown) => {
    if (typeof value !== 'number') return <span className="text-slate-500">-</span>;
    return <span>${value.toLocaleString()}</span>;
  },

  /** Render a status badge */
  status: (value: unknown, colorMap?: Record<string, string>) => {
    if (!value || typeof value !== 'string') return <span className="text-slate-500">-</span>;
    const defaultColors: Record<string, string> = {
      active: 'bg-green-900/50 text-green-400',
      inactive: 'bg-slate-700 text-slate-400',
      pending: 'bg-yellow-900/50 text-yellow-400',
      verified: 'bg-green-900/50 text-green-400',
      basic: 'bg-slate-700 text-slate-400',
      standard: 'bg-blue-900/50 text-blue-400',
      premium: 'bg-purple-900/50 text-purple-400',
    };
    const colors = { ...defaultColors, ...colorMap };
    const color = colors[value.toLowerCase()] || 'bg-slate-700 text-slate-400';
    return (
      <span className={cn('px-2 py-1 text-xs rounded-full capitalize', color)}>
        {value}
      </span>
    );
  },

  /** Render an array as a truncated list */
  list: (value: unknown, maxItems = 3) => {
    if (!Array.isArray(value) || value.length === 0) {
      return <span className="text-slate-500">-</span>;
    }
    const displayItems = value.slice(0, maxItems);
    const remaining = value.length - maxItems;
    return (
      <span className="text-sm">
        {displayItems.join(', ')}
        {remaining > 0 && (
          <span className="text-slate-500"> +{remaining} more</span>
        )}
      </span>
    );
  },

  /** Render a date from timestamp */
  date: (value: unknown) => {
    if (typeof value !== 'number') return <span className="text-slate-500">-</span>;
    return new Date(value).toLocaleDateString();
  },

  /** Render a truncated URL */
  url: (value: unknown) => {
    if (typeof value !== 'string' || !value) return <span className="text-slate-500">-</span>;
    try {
      const url = new URL(value);
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-400 hover:underline truncate max-w-[200px] block"
          title={value}
        >
          {url.hostname}
        </a>
      );
    } catch {
      return <span className="text-slate-500">{value}</span>;
    }
  },
};

export default DataTable;
