import { createCtbTimingConfig } from '../ctbTiming';
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSceneSliceRun, resolveSceneSliceJob, type SceneSliceJobOptions } from '../../../../scripts/cli/sceneSliceJob';
import type { SavedCurve } from '../lutCurves';
import type { SliceJobAntiAliasingRequest } from '../sliceAntiAliasing';
import { describeSliceJobModel } from '../sliceJobAssembly';
import { captureAppSliceJob, cubeModel, type CapturedSliceJob } from './helpers/captureAppSliceJob';
import { MATERIALS, PRINTERS, appMaterial, comparableMetadata, material } from './helpers/sliceJobFixtures';

/**
 * `scene slice` claims to build the job the app would. This compares the two
 * whole: the app's side is the real orchestrator, captured at the Tauri
 * boundary; the CLI's side is the job it hands `dragonfruit-cli slice run --job`.
 */

const STEEP_CURVE: SavedCurve = {
  id: 'steep',
  name: 'Steep',
  points: [{ x: 0, y: 0.2 }, { x: 0.5, y: 0.4 }, { x: 1, y: 0.75 }],
};

/** The same anti-aliasing choice, as the CLI flags take it and as the panel hands it over. */
type AaScenario = { label: string; cli: SceneSliceJobOptions; app: SliceJobAntiAliasingRequest };

const AA_SCENARIOS: AaScenario[] = [
  // No flags: the panel's default preset and the material's own settings.
  { label: 'default AA', cli: {}, app: { preset: 'balanced', override: null } },
  { label: 'AA smooth', cli: { aaPreset: 'smooth' }, app: { preset: 'smooth', override: null } },
  { label: 'AA raw', cli: { aaPreset: 'raw' }, app: { preset: 'raw', override: null } },
  {
    label: 'AA settings, 3DAA with a custom curve',
    cli: {
      aaSettings: {
        antiAliasingSettings: { mode: '3DAA', level: '16x', zBlendResinType: 'custom', selectedLutCurveId: 'steep', aaOnSupports: true },
        minimumAaAlphaPercent: 20,
      },
      lutCurves: [STEEP_CURVE],
    },
    app: {
      preset: 'balanced',
      override: {
        antiAliasingSettings: {
          enableOverride: true, mode: '3DAA', level: '16x', zBlendResinType: 'custom', selectedLutCurveId: 'steep', aaOnSupports: true,
        },
        minimumAaAlphaPercent: 20,
      },
      lutCurves: [STEEP_CURVE],
    },
  },
];


/**
 * Fields that are not the job's to decide: the mesh transport and the model
 * triangle count (slice run reads both from the mesh it loads), and the
 * thumbnail and output path, which the CLI does not produce.
 */
const NOT_COMPARED = new Set([
  'model_triangle_count',
  'mesh_encoding',
  'mesh_quantization',
  'export_thumbnail_png_base64',
  'output_path',
]);

for (const printer of PRINTERS) {
  for (const materialFixture of MATERIALS) {
    for (const aa of AA_SCENARIOS) {
      const caseLabel = `${printer.label}, material ${materialFixture.label}, ${aa.label}`;
      test(`scene slice hands slice run the app's job: ${caseLabel}`, async () => {
        const cube = cubeModel('parity-cube', 10);
        const appPrinter = printer.appPrinter();
        const app: CapturedSliceJob = await captureAppSliceJob({
          models: [cube],
          printerProfile: appPrinter,
          materialProfile: appMaterial(appPrinter, material(materialFixture)),
          extraOptions: { antiAliasing: aa.app },
        });
        const run = buildSceneSliceRun(
          resolveSceneSliceJob({ printer: printer.cliPrinter(), material: material(materialFixture), ...aa.cli }),
          { maxZMm: 10, models: [describeSliceJobModel(cube)] },
          'positions.bin',
          'out',
          'job.json',
        );
        assert.deepStrictEqual(run.args, ['slice', 'run', 'positions.bin', '-o', 'out', '--job', 'job.json', '--json']);
        assert.ok(run.jobJson);
        const cli = JSON.parse(run.jobJson) as CapturedSliceJob;

        assert.deepStrictEqual(Object.keys(cli).sort(), Object.keys(app).sort(), 'the same fields');
        for (const key of Object.keys(app)) {
          if (NOT_COMPARED.has(key) || key === 'metadata_json') continue;
          assert.deepStrictEqual(cli[key], app[key], key);
        }
        assert.deepStrictEqual(comparableMetadata(cli.metadata_json), comparableMetadata(app.metadata_json), 'metadata_json');
      });
    }
  }
}


for (const settingsMode of ['simple', 'twostage', 'allfields']) {
  for (const formatVersion of ['v4', 'v5', 'v4enc', 'v5enc']) {
    test(`CTB plan is identical in app and CLI: ${formatVersion} ${settingsMode}`, async () => {
      const printer = PRINTERS.find((entry) => entry.label.startsWith('Saturn 3'))!.appPrinter();
      printer.display = { ...printer.display, settingsMode, formatVersion };
      const config = createCtbTimingConfig(
        { lightOffDelaySec: 13, waitTimeBeforeCureSec: 1 },
        { lightOffDelaySec: 7, waitTimeAfterLiftSec: 2 },
      );
      config.enabled = true;
      config.startupDummy = true;
      config.overrides = [
        { id: 'first', startLayer: 1, endLayer: 3, values: { waitTimeBeforeCureSec: 4 }, pwmPercent: 60 },
        { id: 'overlap', startLayer: 2, endLayer: 2, values: { lightOffDelaySec: 9 }, pwmPercent: 0 },
      ];
      const resin = appMaterial(printer, { ...material(MATERIALS[0]), ctbTimingV1: config });
      const cube = cubeModel('ctb-parity', 1);
      const app = await captureAppSliceJob({ models: [cube], printerProfile: printer, materialProfile: resin,
        extraOptions: { antiAliasing: { preset: 'raw' } } });
      const run = buildSceneSliceRun(resolveSceneSliceJob({ printer, material: resin, aaPreset: 'raw' }),
        { maxZMm: 1, models: [describeSliceJobModel(cube)] }, 'positions.bin', 'out.ctb', 'job.json');
      const cli = JSON.parse(run.jobJson!) as CapturedSliceJob;
      const appPlan = JSON.parse(app.metadata_json).ctb.layerPlanV1;
      assert.deepEqual(JSON.parse(cli.metadata_json).ctb.layerPlanV1, appPlan);
      assert.equal(appPlan.modelLayerCount, app.total_layers);
      assert.equal(run.assembled!.fileLayerCount, appPlan.modelLayerCount + 1);
      assert.equal(appPlan.layers[0].pwm, 1, 'startup dummy remains byte 1');
      assert.equal(appPlan.layers[2].pwm, 0, 'overlap retains explicit zero PWM');
      assert.equal(appPlan.layers[1].positionZMm, appPlan.layers[0].positionZMm, 'dummy adds no model Z');
      assert.equal(appPlan.layers[2].waitTimeBeforeCureSec, 4, 'later range only overrides its own fields');
    });
  }
}
