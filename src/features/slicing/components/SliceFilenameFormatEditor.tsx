import { useId } from 'react';
import {
  appendSliceExtension,
  DEFAULT_SLICE_FILENAME_FORMAT,
  resolveSliceFilenameFormat,
  type SliceFilenameContext,
} from '../sliceFilenameFormat';

type SliceFilenameFormatEditorProps = {
  format: string;
  context: SliceFilenameContext;
  extension: string;
  onChange: (format: string) => void;
};

export function SliceFilenameFormatEditor({ format, context, extension, onChange }: SliceFilenameFormatEditorProps) {
  const id = useId();
  const preview = resolveSliceFilenameFormat(format, context);
  const inputId = `${id}-format`;
  const helpId = `${id}-help`;
  const previewId = `${id}-preview`;

  return (
    <div className="mt-2 rounded-md border p-2.5 space-y-1.5" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>
          Output filename format
        </label>
        <button type="button" className="text-[11px] underline" style={{ color: 'var(--text-muted)' }} onClick={() => onChange(DEFAULT_SLICE_FILENAME_FORMAT)}>
          Reset
        </button>
      </div>
      <input
        id={inputId}
        type="text"
        value={format}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-invalid={Boolean(preview.error)}
        aria-describedby={`${helpId} ${previewId}`}
        className="w-full rounded border px-2 py-1.5 text-xs font-mono"
        style={{ borderColor: preview.error ? 'var(--danger)' : 'var(--border-subtle)', background: 'var(--surface-0)', color: 'var(--text-strong)' }}
      />
      <p id={helpId} className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
        Placeholders: {'{printer_name}'}, {'{timestamp}'}, {'{material_name}'}, {'{layer_height}'} (mm), {'{layer_height_um}'} (µm). Timestamp uses local YYYYMMDD-HHMMSS.
      </p>
      <div id={previewId} className="text-[11px] break-all" style={{ color: preview.error ? 'var(--danger)' : 'var(--text-strong)' }} aria-live="polite">
        {preview.error ?? `Preview (sample time until slicing starts): ${appendSliceExtension(preview.basename ?? 'slice_export', extension)}`}
      </div>
      {preview.warning && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{preview.warning}</p>}
    </div>
  );
}
