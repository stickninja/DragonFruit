/** The template is stored separately from printer and material profiles. */
export const SLICE_FILENAME_FORMAT_STORAGE_KEY = 'dragonfruit:slice-filename-format:v1';
export const DEFAULT_SLICE_FILENAME_FORMAT = '{printer_name}_{timestamp}_{material_name}_{layer_height}mm';

export type SliceFilenameContext = {
  printerName: string;
  materialName: string;
  layerHeightMm: number;
  timestamp: Date;
};

export type SliceFilenameResult = {
  basename: string | null;
  error: string | null;
  warning: string | null;
};

const TOKENS = ['printer_name', 'timestamp', 'material_name', 'layer_height', 'layer_height_um'] as const;
type Token = typeof TOKENS[number];
const TOKEN_SET = new Set<string>(TOKENS);
const UNSAFE_LITERAL_RE = /[<>:"/\\|?*\u0000-\u001f\u007f]/;
const MAX_BASENAME_BYTES = 220;
const MAX_BASENAME_UTF16_UNITS = 220;

export function getSavedSliceFilenameFormat(): string {
  if (typeof window === 'undefined') return DEFAULT_SLICE_FILENAME_FORMAT;
  try {
    return window.localStorage.getItem(SLICE_FILENAME_FORMAT_STORAGE_KEY) ?? DEFAULT_SLICE_FILENAME_FORMAT;
  } catch {
    return DEFAULT_SLICE_FILENAME_FORMAT;
  }
}

export function saveSliceFilenameFormat(format: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SLICE_FILENAME_FORMAT_STORAGE_KEY, format);
  } catch {
    // Slicing still works for this session when storage is unavailable.
  }
}

export function formatSliceTimestamp(date: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}

function formatMillimeters(value: number): string {
  // At least three fractional places keeps common resin heights readable;
  // more precise heights retain their significant decimal digits.
  const precise = value.toFixed(6).replace(/0+$/g, '').replace(/\.$/, '');
  const [whole, fraction = ''] = precise.split('.');
  return `${whole}.${fraction.padEnd(3, '0')}`;
}

/** Removes path syntax while preserving letters from international profile names. */
export function sanitizeSliceFilenameBase(raw: string): string {
  const cleaned = raw.normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[. _]+|[. _]+$/g, '');
  const deviceSafe = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned)
    ? `_${cleaned}`
    : cleaned;
  const encoder = new TextEncoder();
  let shortened = '';
  let byteCount = 0;
  for (const character of deviceSafe) {
    const characterBytes = encoder.encode(character).length;
    if (byteCount + characterBytes > MAX_BASENAME_BYTES || shortened.length + character.length > MAX_BASENAME_UTF16_UNITS) break;
    shortened += character;
    byteCount += characterBytes;
  }
  shortened = shortened.replace(/[. _]+$/g, '');
  if (!shortened) return 'slice_export';
  return shortened;
}

export function resolveSliceOutputExtension(printerOutputFormat: string | null | undefined, selectedOutputFormat: string | null | undefined): string {
  return printerOutputFormat?.trim() || selectedOutputFormat?.trim() || 'slice';
}

/** The exporter owns the extension; a template ending in it is not doubled. */
export function appendSliceExtension(basename: string, rawExtension: string): string {
  const extension = rawExtension.replace(/^\.+/, '').replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase() || 'slice';
  const suffix = `.${extension}`;
  const withoutExtension = basename.toLowerCase().endsWith(suffix.toLowerCase())
    ? basename.slice(0, -suffix.length)
    : basename;
  return `${sanitizeSliceFilenameBase(withoutExtension)}${suffix}`;
}

export function resolveSliceFilenameFormat(format: string, context: SliceFilenameContext): SliceFilenameResult {
  if (!format.trim()) return { basename: null, error: 'Enter a filename format.', warning: null };
  if (format.length > 500) return { basename: null, error: 'Filename format is too long (500 characters maximum).', warning: null };

  const values: Record<Token, string> = {
    printer_name: context.printerName || 'Printer',
    material_name: context.materialName || 'Material',
    timestamp: formatSliceTimestamp(context.timestamp),
    layer_height: Number.isFinite(context.layerHeightMm) && context.layerHeightMm > 0
      ? formatMillimeters(context.layerHeightMm)
      : '0.050',
    layer_height_um: Number.isFinite(context.layerHeightMm) && context.layerHeightMm > 0
      ? String(Number((context.layerHeightMm * 1000).toFixed(6)))
      : '50',
  };
  let expanded = '';
  let adjustedProfileName = false;
  for (let index = 0; index < format.length;) {
    const char = format[index];
    if (char === '}') return { basename: null, error: 'Unexpected “}” in filename format.', warning: null };
    if (char !== '{') {
      if (UNSAFE_LITERAL_RE.test(char)) {
        return { basename: null, error: 'The format contains a path separator or a character that cannot be used in a filename.', warning: null };
      }
      expanded += char;
      index += 1;
      continue;
    }
    const close = format.indexOf('}', index + 1);
    if (close < 0) return { basename: null, error: 'A placeholder is missing its closing “}”.', warning: null };
    const token = format.slice(index + 1, close);
    if (!TOKEN_SET.has(token)) {
      return { basename: null, error: `Unknown placeholder {${token}}. Use one of the listed placeholders.`, warning: null };
    }
    const value = values[token as Token];
    const safeValue = sanitizeSliceFilenameBase(value);
    adjustedProfileName ||= value !== safeValue;
    expanded += safeValue;
    index = close + 1;
  }
  if (!expanded.replace(/[. _]/g, '')) {
    return { basename: null, error: 'The format does not produce a usable filename.', warning: null };
  }
  const basename = sanitizeSliceFilenameBase(expanded);
  return {
    basename,
    error: null,
    warning: adjustedProfileName || basename !== expanded
      ? 'Unsafe characters or excess length were adjusted for the filename.'
      : null,
  };
}
