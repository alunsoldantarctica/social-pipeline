import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';

interface DeleteSectionProps {
  /** Name of the item being deleted (for display) */
  itemName: string;
  /** Type of item (e.g., "plan", "destination", "operator") */
  itemType: string;
  /** Callback to execute the delete - should throw on error */
  onDelete: () => Promise<void>;
  /** Additional warning text about references or constraints */
  warningText?: string;
  /** Whether the delete operation is in progress */
  isLoading?: boolean;
}

/**
 * DeleteButton - Reusable danger zone component for admin detail views
 * 
 * Features:
 * - Two-click confirmation pattern (click Delete → click Confirm Delete)
 * - Consistent danger zone styling
 * - Loading state with spinner
 * - Customizable warning text
 */
export function DeleteButton({
  itemName,
  itemType,
  onDelete,
  warningText,
  isLoading = false,
}: DeleteSectionProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    try {
      await onDelete();
      // Parent component handles success (closing form, showing message, etc.)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${itemType}`);
      setConfirming(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-red-900/50 rounded-lg p-6 mt-6">
      <h3 className="text-sm font-medium text-red-400 uppercase tracking-wider mb-3">
        Danger Zone
      </h3>
      <p className="text-slate-400 text-sm mb-4">
        Permanently delete <span className="text-white font-medium">"{itemName}"</span>.
        This action cannot be undone.
        {warningText && <span className="block mt-1">{warningText}</span>}
      </p>

      {error && (
        <p className="text-red-400 text-sm mb-4 p-3 bg-red-900/20 border border-red-900 rounded-lg">
          {error}
        </p>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-red-800 text-red-400 rounded-lg hover:bg-red-900/30 hover:border-red-700 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete {itemType.charAt(0).toUpperCase() + itemType.slice(1)}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Confirm Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isLoading}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default DeleteButton;
