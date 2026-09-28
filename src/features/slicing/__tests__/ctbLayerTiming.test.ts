import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCtbLayerPlan,
  calculateLightOffDelaySec,
  validateCtbTimingConfigForExport,
  getCtbMotionGroupsForCalculator,
} from '../ctbLayerTiming';
import { createCtbTimingConfig, resolveCtbTimingValues, sanitizeCtbTimingConfig, type CtbMotion } from '../ctbTiming';
import { getCtbMotionSupportError, sanitizeCtbMotionCapability } from '../ctbMotionCapability';
import { estimateCtbPlanSeconds } from '../../printing/ctbArtifact';

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

test('PWM overrides resolve independently across inclusive overlaps, defaults, modes, versions, and dummy', () => {
  const active = { ...config, startupDummy: true, overrides: [
    { id: 'pwm-range', startLayer: 2, endLayer: 4, values: {}, pwmPercent: 50 },
    { id: 'timing-only', startLayer: 2, endLayer: 3, values: { lightOffDelaySec: 19 } },
    { id: 'pwm-off', startLayer: 3, endLayer: 3, values: {}, pwmPercent: 0 },
  ] };
  for (const settingsMode of ['simple', 'twostage', 'allfields']) for (const formatVersion of ['v4', 'v5', 'v4enc', 'v5enc']) {
    // No firmware declaration: PWM uses the timing support gate, independently of motion.
    const plan = buildCtbLayerPlan({ metadata, config: active, modelLayerCount: 5,
      layerHeightMm: 0.05, settingsMode, formatVersion });
    assert.deepEqual(plan.layers.map(layer => layer.pwm), [1, 204, 128, 0, 128, 255]);
    assert.deepEqual(plan.layers.map(layer => layer.lightOffDelaySec), [0, 8, 19, 19, 9, 9]);
  }
});

test('PWM percentage quantizes to nearest byte, including off and full power', () => {
  const percentages = [0, 0.1, 0.2, 33.3, 50, 99.9, 100];
  const plan = buildCtbLayerPlan({ metadata, config: { ...config, overrides: percentages.map((pwmPercent, index) => ({
    id: `pwm-${index}`, startLayer: index + 1, endLayer: index + 1, values: {}, pwmPercent,
  })) }, modelLayerCount: percentages.length, layerHeightMm: 0.05, settingsMode: 'simple', formatVersion: 'v4' });
  assert.deepEqual(plan.layers.map(layer => layer.pwm), [0, 0, 1, 85, 128, 255, 255]);
});

test('PWM persistence retains invalid imports for rejection and legacy absent fields stay absent', () => {
  const rule = { id: 'pwm', startLayer: 1, endLayer: 1, values: {} };
  const legacy = sanitizeCtbTimingConfig({ ...config, overrides: [rule] })!;
  assert.equal('pwmPercent' in legacy.overrides[0], false);
  for (const pwmPercent of [0, 37.5, 100]) {
    const active = { ...config, overrides: [{ ...rule, pwmPercent }] };
    assert.deepEqual(sanitizeCtbTimingConfig(JSON.parse(JSON.stringify(active))), active);
  }
  for (const pwmPercent of [-1, 100.1, Infinity, NaN, null, '', 'invalid', true]) {
    const sanitized = sanitizeCtbTimingConfig({ ...config, overrides: [{ ...rule, pwmPercent }] })!;
    const reloaded = sanitizeCtbTimingConfig(JSON.parse(JSON.stringify(sanitized)))!;
    assert.throws(() => validateCtbTimingConfigForExport(reloaded, 5, 'v4', 'simple'), /PWM range 1.*0 to 100/);
  }
  assert.throws(() => validateCtbTimingConfigForExport({ ...config, overrides: [{ ...rule, pwmPercent: 50 }] }, 5, 'v3', 'simple'), /V4\/V5/);
});

test('bottom PWM accepts the historical metadata alias while canonical zero retains legacy full-power semantics', () => {
  for (const canonical of [undefined, 0, 60]) {
    const plan = buildCtbLayerPlan({ metadata: { ...metadata, ctb: { ...metadata.ctb,
      bottomProjectorPwmPercent: canonical, bottomLayerProjectorPwmPercent: 40,
    } }, config, modelLayerCount: 3, layerHeightMm: 0.05, settingsMode: 'simple', formatVersion: 'v5' });
    assert.equal(plan.layers[0].pwm, canonical === undefined ? 102 : canonical === 0 ? 255 : 153);
    assert.equal(plan.layers[2].pwm, 255);
  }
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

const motionConfig = { ...config, startupDummy: true, overrides: [
  { id: 'first', startLayer: 1, endLayer: 4, values: {}, motion: { liftDistanceMm: 4, liftSpeedMmMin: 40 } },
  { id: 'second', startLayer: 3, endLayer: 3, values: { lightOffDelaySec: 17 }, motion: { liftSpeedMmMin: 20, retractSpeedMmMin: 30 } },
] };
const motionPlan = (settingsMode = 'twostage', formatVersion = 'v5enc') => buildCtbLayerPlan({
  metadata, config: motionConfig, modelLayerCount: 5, layerHeightMm: 0.05, settingsMode, formatVersion,
});

test('motion exports without a firmware declaration across every CTB variant and mode with inheritance, overlap, and dummy exclusion', () => {
  for (const mode of ['simple', 'twostage']) for (const version of ['v4', 'v5', 'v4enc', 'v5enc']) {
    const plan = motionPlan(mode, version);
    assert.deepEqual(plan.layers.map(l => l.liftDistanceMm), [0.1, 4, 4, 4, 4, 2]);
    assert.deepEqual(plan.layers.map(l => l.liftSpeedMmMin), [30, 40, 40, 20, 40, 60]);
    assert.deepEqual(plan.layers.map(l => l.retractSpeedMmMin), [90, 90, 90, 30, 120, 120]);
    assert.equal(plan.layers[3].lightOffDelaySec, 17);
    assert.equal(plan.layers[3].waitTimeBeforeCureSec, 4);
    assert.equal(plan.layers[3].liftDistance2Mm, mode === 'simple' ? 0 : 4);
  }
});

test('calculator splits a selected range at effective motion changes including bottom/normal and overlaps', () => {
  const groups = getCtbMotionGroupsForCalculator(metadata, 'twostage', motionConfig, 1, 5);
  assert.deepEqual(groups.map(g => [g.startLayer, g.endLayer]), [[1, 2], [3, 3], [4, 4], [5, 5]]);
  assert.equal(groups[1].motion.liftSpeedMmMin, 20);
  assert.equal(groups[1].motion.liftDistanceMm, 4);
  assert.notEqual(calculateLightOffDelaySec(1, groups[1].motion), calculateLightOffDelaySec(1, groups[2].motion));
  assert.deepEqual(getCtbMotionGroupsForCalculator(metadata, 'simple', config, 1, 5).map(g => [g.startLayer, g.endLayer]), [[1, 2], [3, 5]]);
  assert.throws(() => getCtbMotionGroupsForCalculator(metadata, 'simple', config, 0, 5), /model-layer range/);
});

test('effective motion rejects impossible inherited splits and speeds without clamping overrides', () => {
  const build = (motion: Partial<CtbMotion>, settingsMode = 'twostage') => buildCtbLayerPlan({
    metadata, config: { ...config, overrides: [{ id: 'bad', startLayer: 3, endLayer: 3, values: {}, motion }] },
    modelLayerCount: 5, layerHeightMm: 0.05, settingsMode, formatVersion: 'v4',
  });
  for (const motion of [{ liftSpeedMmMin: 0 }, { retractSpeedMmMin: 0 }, { liftSpeed2MmMin: 0 }, { retractSpeed2MmMin: 0 }]) {
    assert.throws(() => build(motion), /positive speed/);
  }
  assert.throws(() => build({ liftDistanceMm: 0, liftDistance2Mm: 1 }), /retract distance/);
  assert.throws(() => build({ retractDistance2Mm: 7 }), /retract distance/);
  assert.throws(() => build({ liftDistanceMm: -1 }), /nonnegative/);
  assert.throws(() => build({ liftDistance2Mm: 1 }, 'simple'), /Two Stage/);
  assert.doesNotThrow(() => build({ liftDistanceMm: 0, liftSpeedMmMin: 0, retractDistance2Mm: 4, retractSpeedMmMin: 0 }));
});

test('motion support requires only a supported CTB format and mode; legacy declarations stay inert', () => {
  for (const formatVersion of ['v4', 'v5', 'v4enc', 'v5enc']) for (const settingsMode of ['simple', 'twostage']) {
    assert.equal(getCtbMotionSupportError(formatVersion, settingsMode), null);
    assert.doesNotThrow(() => validateCtbTimingConfigForExport(motionConfig, 5, formatVersion, settingsMode));
  }
  for (const formatVersion of ['', 'v2', 'v3', 'v3enc']) {
    assert.match(getCtbMotionSupportError(formatVersion, 'simple')!, /V4/);
    assert.throws(() => motionPlan('simple', formatVersion), /V4\/V5/);
  }
  for (const settingsMode of ['allfields', 'tilting', 'unknown']) {
    assert.match(getCtbMotionSupportError('v5', settingsMode)!, /Simple or Two Stage/);
    assert.throws(() => motionPlan(settingsMode, 'v5'), /Simple/);
  }
  assert.deepEqual(sanitizeCtbMotionCapability({ firmware: '  ', confirmed: true }), { firmware: '', confirmed: false });
  assert.equal(sanitizeCtbMotionCapability(undefined), undefined);
  assert.doesNotThrow(() => validateCtbTimingConfigForExport(config, 5, 'v4', 'allfields'));
});

test('motion persistence is optional, roundtrips fields, and retains invalid imported input for export rejection', () => {
  assert.deepEqual(sanitizeCtbTimingConfig(JSON.parse(JSON.stringify(motionConfig))), motionConfig);
  assert.equal('motion' in sanitizeCtbTimingConfig({ ...config, overrides: [{ id: 'legacy', startLayer: 1, endLayer: 1, values: {} }] })!.overrides[0], false);
  for (const rawValue of [-1, null, '', 'invalid']) {
    const sanitized = sanitizeCtbTimingConfig({ ...config, overrides: [{ id: 'bad', startLayer: 1, endLayer: 1, values: {}, motion: { liftDistanceMm: rawValue } }] })!;
    const reloaded = sanitizeCtbTimingConfig(JSON.parse(JSON.stringify(sanitized)))!;
    assert.throws(() => validateCtbTimingConfigForExport(reloaded, 5, 'v4', 'simple'), /nonnegative/);
  }
});

test('estimate uses effective overridden travel while preserving raw LOD and explicit waits', () => {
  const slow = { ...config, startupDummy: false, overrides: [{ id: 'slow', startLayer: 3, endLayer: 3, values: {}, motion: { liftSpeedMmMin: 1 } }] };
  const input = { metadata, modelLayerCount: 5, layerHeightMm: 0.05, settingsMode: 'simple', formatVersion: 'v4' };
  const before = buildCtbLayerPlan({ ...input, config });
  const after = buildCtbLayerPlan({ ...input, config: slow });
  assert.equal(after.layers[2].lightOffDelaySec, before.layers[2].lightOffDelaySec);
  assert.equal(after.layers[2].waitTimeAfterCureSec, before.layers[2].waitTimeAfterCureSec);
  // Layer 3 moves for 121 seconds instead of being covered by raw LOD 9.
  assert.equal(estimateCtbPlanSeconds(after) - estimateCtbPlanSeconds(before), 112);
});
