import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import '@uiw/react-md-editor/markdown-editor.css';

// Lazy because the editor pulls in a large codemirror bundle
const MDEditor = lazy(() => import('@uiw/react-md-editor'));

/**
 * Dark-themed markdown editor for the Blog admin "Content (Markdown)" field.
 * Replaces a plain textarea — gives arrow-key navigation, syntax highlighting,
 * toolbar (H2/H3, bold, italic, link, list, code, blockquote), and Cmd+B/I/K
 * shortcuts. Stores markdown source as-is.
 */
export function MarkdownEditor({
  value,
  onChange,
  disabled,
  height = 500,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  height?: number;
}) {
  return (
    <div data-color-mode="dark" className="md-editor-dark">
      <Suspense
        fallback={
          <div
            className="flex items-center justify-center bg-slate-900 border border-slate-700 rounded"
            style={{ height }}
          >
            <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
          </div>
        }
      >
        <MDEditor
          value={value}
          onChange={(next) => onChange(next ?? '')}
          height={height}
          preview="live"
          textareaProps={{
            disabled,
            spellCheck: true,
          }}
          visibleDragbar={false}
        />
      </Suspense>
    </div>
  );
}
