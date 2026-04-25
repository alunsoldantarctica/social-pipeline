import { useState, useEffect, lazy, Suspense } from 'react';
import { Save, X, Loader2, Plus, Trash2, ImageIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

const CloudflareMediaBrowser = lazy(() => import('./CloudflareMediaBrowser'));

/**
 * Field definition for the AdminForm
 */
export interface FormField {
  /** Unique field name (matches data key) */
  name: string;
  /** Display label */
  label: string;
  /** Field type */
  type:
    | 'text'
    | 'number'
    | 'url'
    | 'media-url'
    | 'email'
    | 'textarea'
    | 'select'
    | 'checkbox'
    | 'array'
    | 'money'
    | 'custom';
  /** Custom render function — used when type is 'custom' */
  renderCustom?: (props: {
    value: unknown;
    onChange: (value: unknown) => void;
    disabled?: boolean;
  }) => React.ReactNode;
  /** Whether the field is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Help text displayed below the field */
  helpText?: string;
  /** Options for select fields */
  options?: Array<{ value: string; label: string }>;
  /** Minimum value for number fields */
  min?: number;
  /** Maximum value for number fields */
  max?: number;
  /** Number of rows for textarea */
  rows?: number;
  /** Default value for new records */
  defaultValue?: unknown;
  /** Whether to span the full width */
  fullWidth?: boolean;
  /** Group name for organizing fields */
  group?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Props for the AdminForm component
 */
interface AdminFormProps<T extends Record<string, unknown>> {
  /** Field definitions */
  fields: FormField[];
  /** Initial data for editing (undefined for new record) */
  initialData?: T;
  /** Callback when form is submitted */
  onSubmit: (data: T) => Promise<void>;
  /** Callback when form is cancelled */
  onCancel: () => void;
  /** Whether form submission is in progress */
  isLoading?: boolean;
  /** Title for the form */
  title?: string;
  /** Subtitle for the form */
  subtitle?: string;
  /** Submit button text */
  submitLabel?: string;
  /** Cancel button text */
  cancelLabel?: string;
}

/**
 * AdminForm - Reusable form component for admin CRUD operations
 * 
 * Features:
 * - Dynamic field generation from config
 * - Grouped fields with section headers
 * - Array field support (add/remove items)
 * - Validation for required fields
 * - Money formatting for currency fields
 */
export function AdminForm<T extends Record<string, unknown>>({
  fields,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  title,
  subtitle,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
}: AdminFormProps<T>) {
  // Initialize form data with defaults
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of fields) {
      if (initialData && field.name in initialData) {
        initial[field.name] = initialData[field.name];
      } else if (field.defaultValue !== undefined) {
        initial[field.name] = field.defaultValue;
      } else if (field.type === 'array' || (field.type === 'custom' && Array.isArray(field.defaultValue))) {
        initial[field.name] = [];
      } else if (field.type === 'checkbox') {
        initial[field.name] = false;
      } else if (field.type === 'number' || field.type === 'money') {
        initial[field.name] = undefined;
      } else {
        initial[field.name] = '';
      }
    }
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [mediaBrowserField, setMediaBrowserField] = useState<string | null>(null);

  // Update form data when initialData changes
  useEffect(() => {
    if (initialData) {
      const updated: Record<string, unknown> = {};
      for (const field of fields) {
        if (field.name in initialData) {
          updated[field.name] = initialData[field.name];
        } else if (field.defaultValue !== undefined) {
          updated[field.name] = field.defaultValue;
        } else if (field.type === 'array') {
          updated[field.name] = [];
        }
      }
      setFormData(updated);
    }
  }, [initialData, fields]);

  // Handle field change
  const handleChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setTouched((prev) => ({ ...prev, [name]: true }));

    // Clear error when field is modified
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Handle array field item add
  const handleArrayAdd = (name: string) => {
    const current = (formData[name] as string[]) || [];
    handleChange(name, [...current, '']);
  };

  // Handle array field item remove
  const handleArrayRemove = (name: string, index: number) => {
    const current = (formData[name] as string[]) || [];
    handleChange(
      name,
      current.filter((_, i) => i !== index)
    );
  };

  // Handle array field item change
  const handleArrayItemChange = (name: string, index: number, value: string) => {
    const current = (formData[name] as string[]) || [];
    const updated = [...current];
    updated[index] = value;
    handleChange(name, updated);
  };

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    for (const field of fields) {
      if (field.required) {
        const value = formData[field.name];
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0)
        ) {
          newErrors[field.name] = `${field.label} is required`;
        }
      }

      // Type-specific validation
      if ((field.type === 'url' || field.type === 'media-url') && formData[field.name]) {
        try {
          new URL(formData[field.name] as string);
        } catch {
          newErrors[field.name] = 'Invalid URL';
        }
      }

      if (field.type === 'email' && formData[field.name]) {
        const email = formData[field.name] as string;
        if (!email.includes('@')) {
          newErrors[field.name] = 'Invalid email address';
        }
      }

      if (
        (field.type === 'number' || field.type === 'money') &&
        formData[field.name] !== undefined &&
        formData[field.name] !== ''
      ) {
        const num = Number(formData[field.name]);
        if (isNaN(num)) {
          newErrors[field.name] = 'Must be a number';
        } else if (field.min !== undefined && num < field.min) {
          newErrors[field.name] = `Minimum value is ${field.min}`;
        } else if (field.max !== undefined && num > field.max) {
          newErrors[field.name] = `Maximum value is ${field.max}`;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    // Convert values to appropriate types
    const submitData: Record<string, unknown> = {};
    for (const field of fields) {
      let value = formData[field.name];

      if ((field.type === 'number' || field.type === 'money') && value !== undefined && value !== '') {
        value = Number(value);
      }

      if (value !== '' && value !== undefined) {
        submitData[field.name] = value;
      }
    }

    await onSubmit(submitData as T);
  };

  // Group fields
  const groups = fields.reduce((acc, field) => {
    const group = field.group || '_default';
    if (!acc[group]) acc[group] = [];
    acc[group].push(field);
    return acc;
  }, {} as Record<string, FormField[]>);

  // Render a single field
  const renderField = (field: FormField) => {
    const error = touched[field.name] && errors[field.name];
    const value = formData[field.name];

    const baseInputClass = cn(
      'w-full px-4 py-2 bg-slate-800 border rounded-lg text-white placeholder:text-slate-500',
      'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent',
      error ? 'border-red-600' : 'border-slate-700',
      field.disabled && 'opacity-50 cursor-not-allowed'
    );

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={(value as string) ?? ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            rows={field.rows || 3}
            disabled={field.disabled}
            className={cn(baseInputClass, 'resize-none')}
          />
        );

      case 'select':
        return (
          <select
            value={(value as string) ?? ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={field.disabled}
            className={baseInputClass}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={(value as boolean) ?? false}
              onChange={(e) => handleChange(field.name, e.target.checked)}
              disabled={field.disabled}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500 focus:ring-offset-slate-900"
            />
            <span className="text-slate-300">{field.label}</span>
          </label>
        );

      case 'array':
        const items = (value as string[]) || [];
        return (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => handleArrayItemChange(field.name, idx, e.target.value)}
                  placeholder={field.placeholder || `Item ${idx + 1}`}
                  disabled={field.disabled}
                  className={cn(baseInputClass, 'flex-1')}
                />
                <button
                  type="button"
                  onClick={() => handleArrayRemove(field.name, idx)}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => handleArrayAdd(field.name)}
              disabled={field.disabled}
              className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>
        );

      case 'custom':
        return field.renderCustom?.({
          value,
          onChange: (v) => handleChange(field.name, v),
          disabled: field.disabled,
        }) ?? null;

      case 'money':
        return (
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input
              type="number"
              value={(value as number) ?? ''}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder || '0'}
              min={field.min}
              max={field.max}
              step="1"
              disabled={field.disabled}
              className={cn(baseInputClass, 'pl-8')}
            />
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            disabled={field.disabled}
            className={baseInputClass}
          />
        );

      case 'media-url':
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="url"
                value={(value as string) ?? ''}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder || 'https://...'}
                disabled={field.disabled}
                className={cn(baseInputClass, 'flex-1')}
              />
              <button
                type="button"
                onClick={() => setMediaBrowserField(field.name)}
                disabled={field.disabled}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg border border-slate-600 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4" />
                Browse
              </button>
            </div>
            {Boolean(value) && typeof value === 'string' && (
              <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-700 bg-slate-800">
                <img
                  src={value}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
          </div>
        );

      default:
        return (
          <input
            type={field.type}
            value={(value as string) ?? ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            disabled={field.disabled}
            className={baseInputClass}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} autoComplete="off" className="bg-slate-900 border border-slate-800 rounded-lg p-6">
      {/* Header */}
      {(title || subtitle) && (
        <div className="mb-6">
          {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
          {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
        </div>
      )}

      {/* Field groups */}
      <div className="space-y-6">
        {Object.entries(groups).map(([groupName, groupFields]) => (
          <div key={groupName}>
            {/* Group header */}
            {groupName !== '_default' && (
              <h3 className="text-sm font-medium text-teal-500 uppercase tracking-wider mb-4">
                {groupName}
              </h3>
            )}

            {/* Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupFields.map((field) => {
                // Checkbox renders its own label
                if (field.type === 'checkbox') {
                  return (
                    <div key={field.name} className={cn(field.fullWidth && 'md:col-span-2')}>
                      {renderField(field)}
                      {field.helpText && (
                        <p className="text-xs text-slate-500 mt-1 ml-7">{field.helpText}</p>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={field.name} className={cn(field.fullWidth && 'md:col-span-2')}>
                    <label className="block text-sm text-slate-400 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    {renderField(field)}
                    {errors[field.name] && touched[field.name] && (
                      <p className="text-xs text-red-400 mt-1">{errors[field.name]}</p>
                    )}
                    {field.helpText && !errors[field.name] && (
                      <p className="text-xs text-slate-500 mt-1">{field.helpText}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6 pt-6 border-t border-slate-800">
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors"
        >
          <X className="w-4 h-4" />
          {cancelLabel}
        </button>
      </div>

      {/* Krill Media Browser Modal */}
      {mediaBrowserField && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          </div>
        }>
          <CloudflareMediaBrowser
            onSelect={(url) => {
              handleChange(mediaBrowserField, url);
              setMediaBrowserField(null);
            }}
            onClose={() => setMediaBrowserField(null)}
          />
        </Suspense>
      )}
    </form>
  );
}

export default AdminForm;
