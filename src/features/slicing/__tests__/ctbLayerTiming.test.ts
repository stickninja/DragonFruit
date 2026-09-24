import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCtbLayerPlan,
  calculateLightOffDelaySec,
  validateCtbTimingConfigForExport,
} from '../ctbLayerTiming';
import { createCtbTimingConfig, resolveCtbTimingValues, sanitizeCtbTimingConfig } from '../ctbTiming';

const metadata = {
  material: {
    bottomLayerCount: 2, bottomExposureSec: 20, normalExposureSec: 2,
    liftDistanceMm: 2, liftSpeedMmMin: 60, retractSpeedMmMin: 120,
    bottomLiftDistanceMm: 3, bottomLiftSpeedMmMin: 30, bottomRetractSpeedMmMin: 90,
  },
  ctb: {
    transitionLayerCount: 2,
    liftDistance2Mm: 4, liftSpeed2MmMin: 240, retractDistance2Mm: 3, retractSpeed2MmMin: 180,
    bottomLiftDistance2Mm: 0, bottomLiftSpeed2MmMin: 60, bottomRetractHeight2Mm: 1,
    bottomRetractSpeed2MmMin: 45, projectorPwmPercent: 100, bottomProjectorPwmPercent: 80,
  },
};

const config = createCtbTimingConfig(
  { lightOffDelaySec: 8, waitTimeBeforeCureSec: 1, waitTimeAfterCureSec: 2, waitTimeAfterLiftSec: 3 },
  { lightOffDelaySec: 9, waitTimeBeforeCureSec: 4, waitTimeAfterCureSec: 5, waitTimeAfterLiftSec: 6 },
);
config.enabled = true;

test('per-field overlapping overrides resolve in rule order with one-based inclusive bounds', () => {
  const active = { ...config, overrides: [
    { id: 'first', startLayer: 2, endLayer: 4, values: { lightOffDelaySec: 15, waitTimeAfterLiftSec: 7 } },
    { id: 'second', startLayer: 3, endLayer: 3, values: { lightOffDelaySec: 16 } },
  ] };
  assert.equal(resolveCtbTimingValues(active, 1, 2).lightOffDelaySec, 8);
  assert.equal(resolveCtbTimingValues(active, 2, 2).lightOffDelaySec, 15);
  assert.deepEqual(resolveCtbTimingValues(active, 3, 2), {
    lightOffDelaySec: 16, waitTimeBeforeCureSec: 4, waitTimeAfterCureSec: 5, waitTimeAfterLiftSec: 7,
  });
  assert.equal(resolveCtbTimingValues(active, 5, 2).lightOffDelaySec, 9);
});

test('plan preserves real model Z and exposure transition, separate stage motion, and dummy first file record', () => {
  const plan = buildCtbLayerPlan({ metadata, config: { ...config, startupDummy: true,
    overrides: [{ id: 'first-only', startLayer: 1, endLayer: 1, values: { lightOffDelaySec: 12 } }],
  },
    modelLayerCount: 5, layerHeightMm: 0.05, settingsMode: 'twostage', formatVersion: 'v5enc' });
  assert.equal(plan.layers.length, 6);
  assert.equal(plan.bottomDefaults.lightOffDelaySec, 8);
  assert.equal(plan.normalDefaults.lightOffDelaySec, 9);
  assert.equal(plan.layers[1]?.lightOffDelaySec, 12);
  assert.deepEqual(plan.layers.map((layer) => layer.modelLayerNumber), [null, 1, 2, 3, 4, 5]);
  assert.equal(plan.layers[0]?.positionZMm, plan.layers[1]?.positionZMm);
  assert.equal(plan.layers[0]?.exposureSec, 0.01);
  assert.equal(plan.layers[0]?.liftDistanceMm, 0.1);
  assert.equal(plan.layers[0]?.retractDistance2Mm, 0.1);
  assert.equal(plan.layers[0]?.pwm, 1);
  assert.deepEqual(plan.layers.slice(1).map((layer) => layer.exposureSec), [20, 20, 11, 2, 2]);
  assert.equal(plan.layers[1]?.liftDistance2Mm, 0); // explicit zero in bottom Two Stage
  assert.equal(plan.layers[1]?.retractDistance2Mm, 1); // independent bottom value
  assert.equal(plan.layers[3]?.retractDistance2Mm, 3);
  assert.equal(plan.layers[3]?.pwm, 255);
  assert.equal(plan.layers[1]?.pwm, 204);
});

test('Simple and All Fields plans never inherit stale two-stage motion', () => {
  for (const settingsMode of ['simple', 'allfields']) {
    const plan = buildCtbLayerPlan({ metadata, config, modelLayerCount: 3, layerHeightMm: 0.05,
      settingsMode, formatVersion: 'v4' });
    for (const layer of plan.layers) {
      assert.equal(layer.liftDistance2Mm, 0);
      assert.equal(layer.liftSpeed2MmMin, 0);
      assert.equal(layer.retractDistance2Mm, 0);
      assert.equal(layer.retractSpeed2MmMin, 0);
    }
  }
});

test('zero PWM percent retains legacy CTB full-power fallback', () => {
  const plan = buildCtbLayerPlan({ metadata: {
    ...metadata, ctb: { ...metadata.ctb, projectorPwmPercent: 0, bottomProjectorPwmPercent: 0 },
  }, config, modelLayerCount: 3, layerHeightMm: 0.05, settingsMode: 'simple', formatVersion: 'v5' });
  assert.deepEqual(plan.layers.map((layer) => layer.pwm), [255, 255, 255]);
});

test('calculator includes two-stage travel and correction without adding explicit waits', () => {
  const lod = calculateLightOffDelaySec(30, {
    liftDistanceMm: 1, liftDistance2Mm: 4, liftSpeedMmMin: 60, liftSpeed2MmMin: 240,
    retractDistance2Mm: 2, retractSpeedMmMin: 120, retractSpeed2MmMin: 240,
  }, 0.5);
  assert.equal(lod, 34.5); // 1 + 1 + 0.5 + 1.5 travel, 30 rest, 0.5 correction
});

test('export rejects unsupported version and invalid or out-of-range overrides', () => {
  assert.throws(() => validateCtbTimingConfigForExport(config, 5, 'v3enc', 'twostage'), /V4\/V5/);
  assert.throws(() => validateCtbTimingConfigForExport({ ...config, overrides: [
    { id: 'late', startLayer: 6, endLayer: 6, values: { lightOffDelaySec: 1 } },
  ] }, 5, 'v5', 'simple'), /1 to 5/);
  assert.throws(() => validateCtbTimingConfigForExport({ ...config, defaults: {
    ...config.defaults, bottom: { ...config.defaults.bottom, lightOffDelaySec: -1 },
  } }, 5, 'v5', 'simple'), /nonnegative/);
  assert.equal(sanitizeCtbTimingConfig(undefined), undefined);
});
