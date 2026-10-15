import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendSliceExtension,
  convertSliceFilenameHeightUnit,
  DEFAULT_SLICE_FILENAME_FORMAT,
  getSavedSliceFilenameFormat,
  inferSliceFilenameHeightUnit,
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

test('height unit selector converts saved tokens and legacy micron suffixes', () => {
  assert.equal(inferSliceFilenameHeightUnit('{printer_name}_{layer_height_um}um'), 'um');
  assert.equal(convertSliceFilenameHeightUnit('{layer_height_um}um', 'mm'), '{layer_height}mm');
  assert.equal(convertSliceFilenameHeightUnit('{printer_name}_{layer_height}mm', 'um'), '{printer_name}_{layer_height_um}µm');
  assert.equal(convertSliceFilenameHeightUnit('{layer_height_um}um', 'um'), '{layer_height_um}µm');
});

test('plate context keeps batch outputs distinct with and without plate placeholders', () => {
  const first = resolveSliceFilenameFormat('{material_name}', { ...context, plateIndex: 1, plateName: 'Left' });
  const second = resolveSliceFilenameFormat('{material_name}', { ...context, plateIndex: 2, plateName: 'Left' });
  assert.equal(first.basename, 'Résine_Tough_plate01');
  assert.equal(second.basename, 'Résine_Tough_plate02');
  assert.equal(resolveSliceFilenameFormat('{plate_name}_{plate_index}', { ...context, plateIndex: 2, plateName: 'Left' }).basename, 'Left_02');
  assert.equal(appendSliceExtension('Left_02.CTB', 'ctb'), 'Left_02.ctb');
  assert.equal(resolveSliceFilenameFormat('foo.ctb', { ...context, plateIndex: 1, extension: 'ctb' }).basename, 'foo_plate01.ctb');
  assert.equal(appendSliceExtension('foo_plate01.ctb', 'ctb'), 'foo_plate01.ctb');
  const longName = '界'.repeat(100);
  const longFirst = resolveSliceFilenameFormat('{plate_name}', { ...context, plateName: longName, plateIndex: 1, extension: 'ctb' });
  const longSecond = resolveSliceFilenameFormat('{plate_name}', { ...context, plateName: longName, plateIndex: 2, extension: 'ctb' });
  assert.notEqual(longFirst.basename, longSecond.basename);
  assert.match(longFirst.basename ?? '', /_plate01$/);
  assert.match(longSecond.basename ?? '', /_plate02$/);
  assert.ok(new TextEncoder().encode(appendSliceExtension(longFirst.basename!, 'ctb')).length <= 255);
  const explicitIndexAfterLongName = resolveSliceFilenameFormat('{plate_name}_{plate_index}', {
    ...context, plateName: longName, plateIndex: 2, extension: 'ctb',
  });
  assert.match(explicitIndexAfterLongName.basename ?? '', /_plate02$/);
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
