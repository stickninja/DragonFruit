import { useId, useState } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Button, Input, Select } from '@/components/atoms';
import {
  appendSliceExtension,
  convertSliceFilenameHeightUnit,
  DEFAULT_SLICE_FILENAME_FORMAT,
  inferSliceFilenameHeightUnit,
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
  const { _ } = useLingui();
  const id = useId();
  const [preferredHeightUnit, setPreferredHeightUnit] = useState<'mm' | 'um'>(() => inferSliceFilenameHeightUnit(format));
  const heightUnit = format.includes('{layer_height_um}') || format.includes('{layer_height}')
    ? inferSliceFilenameHeightUnit(format)
    : preferredHeightUnit;
  const preview = resolveSliceFilenameFormat(format, { ...context, extension });
  const inputId = `${id}-format`;
  const previewId = `${id}-preview`;

  const insert = (token: string) => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    const start = input?.selectionStart ?? format.length;
    const end = input?.selectionEnd ?? format.length;
    onChange(`${format.slice(0, start)}${token}${format.slice(end)}`);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const changeHeightUnit = (unit: 'mm' | 'um') => {
    setPreferredHeightUnit(unit);
    onChange(convertSliceFilenameHeightUnit(format, unit));
  };

  const chips = [
    { label: _(msg`Printer`), token: '{printer_name}' },
    { label: _(msg`Timestamp`), token: '{timestamp}' },
    { label: _(msg`Material`), token: '{material_name}' },
    { label: _(msg`Layer height`), token: heightUnit === 'mm' ? '{layer_height}mm' : '{layer_height_um}µm' },
    { label: _(msg`Plate index`), token: '{plate_index}' },
    { label: _(msg`Plate name`), token: '{plate_name}' },
  ];

  return (
    <section className="rounded-md border p-4 space-y-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}><Trans>Output filenames</Trans></h3>
        <span className="rounded px-2 py-1 text-[11px]" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><Trans>Sliced files</Trans></span>
      </div>
      <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}><Trans>Name pattern</Trans></label>
      <Input
        id={inputId}
        value={format}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-invalid={Boolean(preview.error)}
        aria-describedby={previewId}
        className="w-full font-mono"
      />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <Button key={chip.label} type="button" variant="secondary" size="xs" onClick={() => insert(chip.token)}>
            + {chip.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <label htmlFor={`${id}-unit`}><Trans>Layer height unit</Trans></label>
        <Select id={`${id}-unit`} value={heightUnit} onChange={(event) => changeHeightUnit(event.target.value as 'mm' | 'um')}>
          <option value="mm">mm</option>
          <option value="um">µm</option>
        </Select>
        <Button type="button" variant="secondary" size="xs" onClick={() => onChange(DEFAULT_SLICE_FILENAME_FORMAT)}><Trans>Reset</Trans></Button>
      </div>
      <div id={previewId} className="rounded p-2.5 text-xs break-all" style={{ background: 'var(--surface-0)', color: preview.error ? 'var(--danger)' : 'var(--text-strong)' }} aria-live="polite">
        <div className="mb-1" style={{ color: 'var(--text-muted)' }}><Trans>Preview</Trans> · {context.plateName}</div>
        {preview.error ?? appendSliceExtension(preview.basename ?? 'slice_export', extension)}
      </div>
      {preview.warning && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{preview.warning}</p>}
      <details className="text-xs" style={{ color: 'var(--text-muted)' }}>
        <summary className="cursor-pointer"><Trans>Placeholder reference</Trans></summary>
        <p className="pt-1 leading-relaxed">
          <Trans>Printer, timestamp, material, layer height in mm or µm, plate index, and plate name. Plate numbers are added automatically when the pattern omits the index.</Trans>
        </p>
      </details>
    </section>
  );
}
