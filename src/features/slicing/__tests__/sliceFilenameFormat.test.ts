import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendSliceExtension,
  DEFAULT_SLICE_FILENAME_FORMAT,
  getSavedSliceFilenameFormat,
  resolveSliceFilenameFormat,
  resolveSliceOutputExtension,
  sanitizeSliceFilenameBase,
  saveSliceFilenameFormat,
  SLICE_FILENAME_FORMAT_STORAGE_KEY,
} from '../sliceFilenameFormat';

const context = {
  printerName: 'Photon X',
  materialName: 'Résine Tough',
  layerHeightMm: 0.05,
  timestamp: new Date(2026, 8, 23, 14, 30, 25),
};

test('default format uses the selected profiles, local job time, and decimal millimeters', () => {
  const result = resolveSliceFilenameFormat(DEFAULT_SLICE_FILENAME_FORMAT, context);
  assert.equal(result.error, null);
  assert.equal(result.basename, 'Photon_X_20260923-143025_Résine_Tough_0.050mm');
  assert.equal(appendSliceExtension(result.basename!, '.ctb'), 'Photon_X_20260923-143025_Résine_Tough_0.050mm.ctb');
});

test('micron token and detailed decimal millimeters use the same height', () => {
  const result = resolveSliceFilenameFormat('{layer_height}mm_{layer_height_um}um', {
    ...context,
    layerHeightMm: 0.0375,
  });
  assert.equal(result.basename, '0.0375mm_37.5um');
});

test('unknown and malformed placeholders have actionable errors', () => {
  for (const format of ['{print_time}', '{printer_name', 'printer_name}', '', '../{printer_name}', '...']) {
    const result = resolveSliceFilenameFormat(format, context);
    assert.equal(result.basename, null);
    assert.ok(result.error);
  }
});

test('braces in profile names stay literal and are never evaluated as placeholders', () => {
  const result = resolveSliceFilenameFormat('{material_name}_{layer_height}mm', {
    ...context,
    materialName: '{printer_name}',
  });
  assert.equal(result.basename, '{printer_name}_0.050mm');
});

test('format input is bounded before expansion', () => {
  const result = resolveSliceFilenameFormat('a'.repeat(501), context);
  assert.equal(result.basename, null);
  assert.match(result.error ?? '', /500 characters/);
});

test('unsafe characters, device names, and long names are made safe', () => {
  const result = resolveSliceFilenameFormat('{printer_name}_{material_name}', {
    ...context,
    printerName: 'CON',
    materialName: 'étoile: blue? ',
  });
  assert.equal(result.basename, 'CON_étoile_blue');
  assert.ok(result.warning);
  assert.equal(resolveSliceFilenameFormat('{printer_name}', { ...context, printerName: 'CON' }).basename, '_CON');
  assert.equal(sanitizeSliceFilenameBase('LPT1. '), '_LPT1');
  assert.equal(sanitizeSliceFilenameBase('..  '), 'slice_export');
  const multibyteName = sanitizeSliceFilenameBase('界'.repeat(250));
  assert.ok(new TextEncoder().encode(multibyteName).length <= 220);
  assert.equal(Array.from(multibyteName).length, 73);
  assert.ok(new TextEncoder().encode(appendSliceExtension(multibyteName, 'ctb')).length <= 255);
});

test('exporter appends the selected extension exactly once', () => {
  assert.equal(appendSliceExtension('print.CTB', 'ctb'), 'print.ctb');
  assert.equal(appendSliceExtension('0.050mm', '.ctb'), '0.050mm.ctb');
  assert.equal(appendSliceExtension('CON.ctb', 'ctb'), '_CON.ctb');
  assert.equal(resolveSliceOutputExtension('.ctb', '.pws'), '.ctb');
});

test('format survives reload and defaults when no saved value exists', () => {
  const values = new Map<string, string>();
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
  };
  try {
    assert.equal(getSavedSliceFilenameFormat(), DEFAULT_SLICE_FILENAME_FORMAT);
    saveSliceFilenameFormat('{printer_name}_{layer_height_um}um');
    assert.equal(values.get(SLICE_FILENAME_FORMAT_STORAGE_KEY), '{printer_name}_{layer_height_um}um');
    assert.equal(getSavedSliceFilenameFormat(), '{printer_name}_{layer_height_um}um');
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test('unavailable storage falls back to the default without breaking edits', () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = Object.defineProperty({}, 'localStorage', {
    get: () => { throw new Error('Storage unavailable'); },
  });
  try {
    assert.equal(getSavedSliceFilenameFormat(), DEFAULT_SLICE_FILENAME_FORMAT);
    assert.doesNotThrow(() => saveSliceFilenameFormat('{printer_name}'));
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
  }
});
