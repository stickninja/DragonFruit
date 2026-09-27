import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCtbLayerPlan } from '../../slicing/ctbLayerTiming';
import { ctbPreviewLayer, estimateCtbPlanSeconds, sliceProfileFingerprint } from '../ctbArtifact';
import type { MaterialProfile, PrinterProfile } from '../../profiles/profileStore';
import { DEFAULT_MATERIAL_ANTI_ALIASING_SETTINGS } from '../../profiles/profileStore';
import type { CtbTimingConfigV1 } from '../../slicing/ctbTiming';

const waits = { lightOffDelaySec: 15, waitTimeBeforeCureSec: 1, waitTimeAfterCureSec: 2, waitTimeAfterLiftSec: 3 };
const config: CtbTimingConfigV1 = { enabled: true, startupDummy: true, defaults: { normal: waits, bottom: waits }, overrides: [] };
const plan = () => buildCtbLayerPlan({
  metadata: { material: { bottomLayerCount: 1, bottomExposureSec: 20, normalExposureSec: 2, liftDistanceMm: 5,
    liftSpeedMmMin: 60, retractSpeedMmMin: 60, bottomLiftDistanceMm: 5, bottomLiftSpeedMmMin: 60 } },
  config, modelLayerCount: 3, layerHeightMm: 0.05, settingsMode: 'simple', formatVersion: 'v4',
});

test('dummy file index never shifts real physical Z or sample Z, even after live height edit', () => {
  const snapshot = plan();
  assert.equal(snapshot.layers.length, 4);
  assert.deepEqual(ctbPreviewLayer(snapshot, 1, 0.1), { isDummy: true, modelLayerNumber: null, positionZMm: 0.05, sampleZMm: null });
  assert.deepEqual(ctbPreviewLayer(snapshot, 2, 0.1), { isDummy: false, modelLayerNumber: 1, positionZMm: 0.05, sampleZMm: 0.025 });
  assert.equal(ctbPreviewLayer(snapshot, 4, 0.1).modelLayerNumber, 3);
  assert.ok(Math.abs(ctbPreviewLayer(snapshot, 4, 0.1).sampleZMm! - 0.125) < 1e-8);
  assert.deepEqual(ctbPreviewLayer(undefined, 2, 0.05), { isDummy: false, modelLayerNumber: 2, positionZMm: 0.1, sampleZMm: 0.1 });
});

test('estimate counts independent waits and max of LOD/motion, including tiny dummy', () => {
  const snapshot = plan();
  // Dummy .01 exposure + .2 sec travel; real layers 20+6+15 and twice 2+6+15.
  assert.ok(Math.abs(estimateCtbPlanSeconds(snapshot) - 87.21) < 1e-8);
  snapshot.layers[1].lightOffDelaySec = 1;
  assert.ok(Math.abs(estimateCtbPlanSeconds(snapshot) - 82.21) < 1e-8);
});

test('phase 3 settings edits require reslice; legacy ID fingerprint stays compatible', () => {
  const printer = { id: 'p', display: { outputFormat: '.ctb', formatVersion: 'v4', settingsMode: 'simple' } } as PrinterProfile;
  const material = { id: 'm', ctbTimingV1: config, liftSpeedMmMin: 60, name: 'Resin' } as MaterialProfile;
  const original = sliceProfileFingerprint(printer, material);
  assert.notEqual(original, sliceProfileFingerprint(printer, { ...material, liftSpeedMmMin: 90 }));
  assert.notEqual(original, sliceProfileFingerprint(printer, { ...material, ctbTimingV1: { ...config, startupDummy: false } }));
  assert.notEqual(original, sliceProfileFingerprint(printer, { ...material, ctbTimingV1: { ...config, enabled: false } }));
  assert.equal(original, sliceProfileFingerprint(printer, { ...material, name: 'Renamed' }));
  assert.equal(sliceProfileFingerprint(printer, { ...material, ctbTimingV1: undefined }), 'p::m');
  const disabled = { ...material, ctbTimingV1: { ...config, enabled: false } };
  const disabledBaseline = sliceProfileFingerprint(printer, disabled);
  assert.notEqual(disabledBaseline, original, 'enabling timing invalidates a legacy artifact with the same IDs');
  assert.equal(disabledBaseline, sliceProfileFingerprint(printer, { ...disabled, liftSpeedMmMin: 90 }), 'disabled timing retains legacy ID-only invalidation');
  assert.notEqual(original, sliceProfileFingerprint({ ...printer, display: { ...printer.display, formatVersion: 'v5' } }, material));
  assert.notEqual(original, sliceProfileFingerprint(printer, { ...material, id: 'other-material' }));
});

test('range motion artifacts invalidate when firmware support changes, timing-only artifacts retain their fingerprint', () => {
  const printer = { id: 'p', display: { outputFormat: '.ctb', formatVersion: 'v4', settingsMode: 'simple' },
    ctbMotionCapability: { firmware: 'declared', confirmed: true } } as PrinterProfile;
  const timingOnly = { id: 'm', ctbTimingV1: config } as MaterialProfile;
  const material = { ...timingOnly, ctbTimingV1: { ...config, overrides: [{ id: 'motion', startLayer: 1, endLayer: 1, values: {}, motion: { liftDistanceMm: 3 } }] } };
  const original = sliceProfileFingerprint(printer, material);
  for (const capability of [undefined, { firmware: 'declared', confirmed: false }, { firmware: 'changed', confirmed: true }]) {
    const changed = { ...printer, ctbMotionCapability: capability };
    assert.notEqual(original, sliceProfileFingerprint(changed, material));
    assert.equal(sliceProfileFingerprint(printer, timingOnly), sliceProfileFingerprint(changed, timingOnly));
  }
});

test('PWM range edits and default edits invalidate the slice without requiring firmware capability', () => {
  const printer = { id: 'p', display: { outputFormat: '.ctb', formatVersion: 'v4', settingsMode: 'simple' } } as PrinterProfile;
  const rule = { id: 'pwm', startLayer: 1, endLayer: 2, values: {}, pwmPercent: 50 };
  const material: MaterialProfile = { id: 'm', printerProfileId: 'p', name: 'Resin', brand: '',
    currencyCode: 'USD', bottlePrice: 20, bottleCapacityMl: 1000, resinFamily: 'standard',
    scaleCompensationPct: { x: 0, y: 0, z: 0 }, layerHeightMm: 0.05,
    normalExposureSec: 2, bottomExposureSec: 20, bottomLayerCount: 2,
    liftDistanceMm: 5, liftSpeedMmMin: 60, retractSpeedMmMin: 120,
    minimumAaAlphaPercent: 35, antiAliasingSettings: DEFAULT_MATERIAL_ANTI_ALIASING_SETTINGS,
    ctbTimingV1: { ...config, overrides: [rule] },
    localSettingsByOutput: { '.ctb': { projectorPwmPercent: 90, bottomProjectorPwmPercent: 80 } },
  };
  const original = sliceProfileFingerprint(printer, material);
  for (const pwmPercent of [undefined, 0, 100]) {
    assert.notEqual(original, sliceProfileFingerprint(printer, { ...material,
      ctbTimingV1: { ...config, overrides: [{ ...rule, pwmPercent }] },
    }));
  }
  assert.notEqual(original, sliceProfileFingerprint(printer, { ...material,
    localSettingsByOutput: { '.ctb': { projectorPwmPercent: 90, bottomProjectorPwmPercent: 70 } },
  }));
  assert.equal(original, sliceProfileFingerprint({ ...printer,
    ctbMotionCapability: { firmware: 'declared', confirmed: true },
  }, material));
});
