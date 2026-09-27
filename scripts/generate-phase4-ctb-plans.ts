/** Generate synthetic frontend plans for the opt-in native/independent decoder checks. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCtbLayerPlan } from '../src/features/slicing/ctbLayerTiming';
import { createCtbTimingConfig } from '../src/features/slicing/ctbTiming';
import { estimateCtbPlanSeconds } from '../src/features/printing/ctbArtifact';

const destination = process.argv[2];
if (!destination) throw new Error('Supply an output directory for synthetic CTB plan fixtures.');
mkdirSync(destination, { recursive: true });
for (const version of ['v4', 'v5', 'v4enc', 'v5enc']) {
  for (const settingsMode of ['simple', 'twostage']) for (const dummy of [false, true]) {
    const metadata = { ctb: {
      settingsMode, bottomLayerCount: 2, transitionLayerCount: 1, bottomExposureSec: 20, normalExposureSec: 2,
      bottomProjectorPwmPercent: 80, projectorPwmPercent: 90,
      liftDistanceMm: 2, liftDistance2Mm: 4, liftSpeedMmMin: 60, liftSpeed2MmMin: 240,
      retractDistance2Mm: 3, retractSpeedMmMin: 120, retractSpeed2MmMin: 180,
      bottomLiftDistanceMm: 3, bottomLiftDistance2Mm: 1, bottomLiftSpeedMmMin: 30, bottomLiftSpeed2MmMin: 60,
      bottomRetractHeight2Mm: 1, bottomRetractSpeedMmMin: 90, bottomRetractSpeed2MmMin: 45,
    } };
    const config = createCtbTimingConfig({ lightOffDelaySec: 8 }, { lightOffDelaySec: 9, waitTimeBeforeCureSec: 2 });
    config.enabled = true;
    config.startupDummy = dummy;
    config.overrides = [
      { id: 'range', startLayer: 1, endLayer: 3, values: {}, motion: { liftDistanceMm: 4, liftSpeedMmMin: 40 } },
      { id: 'pwm-range', startLayer: 2, endLayer: 3, values: {}, pwmPercent: 50 },
      { id: 'overlap', startLayer: 3, endLayer: 3, values: { lightOffDelaySec: 17 }, pwmPercent: 0, motion: {
        liftSpeedMmMin: 20, retractSpeedMmMin: 30,
        ...(settingsMode === 'twostage' ? { liftDistance2Mm: 2, liftSpeed2MmMin: 100, retractDistance2Mm: 2, retractSpeed2MmMin: 50 } : {}),
      } },
    ];
    const plan = buildCtbLayerPlan({ metadata, config, modelLayerCount: 4, layerHeightMm: 0.05,
      settingsMode, formatVersion: version, motionCapability: { firmware: 'synthetic-test', confirmed: true } });
    const name = `phase4-${version}-${settingsMode}-dummy-${dummy}`;
    writeFileSync(resolve(destination, `${name}.json`), JSON.stringify({
      version, settingsMode, dummy, expectedEstimateSeconds: Math.round(estimateCtbPlanSeconds(plan)),
      metadata: { ctb: { ...metadata.ctb, layerPlanV1: plan } },
    }, null, 2));
  }
}
console.log('Generated 16 synthetic frontend plans. These do not establish printer firmware support.');
