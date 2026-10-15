import assert from 'node:assert/strict';
import test from 'node:test';
import { installFakeWindow } from '@/utils/__tests__/helpers/fakeWindow';
import { invalidatePrintingArtifacts, sliceProfileFingerprint } from '@/features/printing/ctbArtifact';
import { runSliceExportOrchestrator } from '../sliceExportOrchestrator';
import { cubeModel } from './helpers/captureAppSliceJob';
import { MATERIALS, PRINTERS, appMaterial, material } from './helpers/sliceJobFixtures';

for (const editDuringSlice of [false, true]) {
  test(`derived material keeps source-profile freshness; edit during slice = ${editDuringSlice}`, async () => {
    const printer = PRINTERS[0].appPrinter();
    const sourceMaterial = appMaterial(printer, material(MATERIALS[0]));
    const sourceFingerprint = sliceProfileFingerprint(printer, sourceMaterial);
    const effectiveMaterial = { ...sourceMaterial, layerHeightMm: sourceMaterial.layerHeightMm + 0.01 };
    assert.notEqual(sliceProfileFingerprint(printer, effectiveMaterial), sourceFingerprint);
    let currentMaterial = sourceMaterial;
    let slicedHeight: unknown;
    const invoke = async (command: string, args?: unknown): Promise<unknown> => {
      switch (command) {
        case 'stage_mesh_binary_set': return {};
        case 'plugin:event|listen': return 1;
        case 'plugin:event|unlisten': return;
        case 'slice_solid_native_to_temp_path': {
          const job = JSON.parse((args as { jobJson: string }).jobJson);
          slicedHeight = job.layer_height_mm;
          // The native operation completes later than this profile edit.
          await Promise.resolve();
          if (editDuringSlice) currentMaterial = { ...sourceMaterial, normalExposureSec: sourceMaterial.normalExposureSec + 1 };
          return { tempPath: 'synthetic-print.goo', byteLen: 1234 };
        }
        default: throw new Error(`Unexpected native command: ${command}`);
      }
    };
    const restore = installFakeWindow({
      dispatchEvent: () => true,
      __TAURI_INTERNALS__: { invoke, transformCallback: () => 1 },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
    });
    try {
      const result = await runSliceExportOrchestrator({
        models: [cubeModel('freshness-cube', 1)], printerProfile: printer,
        materialProfile: effectiveMaterial, sourceProfileFingerprint: sourceFingerprint,
        filenameBase: 'freshness', outputMode: 'return',
      });
      assert.equal(slicedHeight, effectiveMaterial.layerHeightMm, 'effective material still drives the rasterizer');
      const artifact = result.artifact!;
      assert.equal(artifact.outputName, 'freshness.goo', 'temporary exports retain the generated filename');
      assert.equal(artifact.profileFingerprint, sourceFingerprint, 'completion retains the run-start source snapshot');
      const invalid = invalidatePrintingArtifacts(new Set(), { plate: { artifact } }, sliceProfileFingerprint(printer, currentMaterial));
      assert.equal(invalid.has(artifact), editDuringSlice, 'only an actual source profile edit invalidates the derived-material output');
    } finally {
      restore();
    }
  });
}

test('manual save path supplies the artifact filename without changing the native destination', async () => {
  const printer = PRINTERS[1].appPrinter();
  const materialProfile = appMaterial(printer, material(MATERIALS[0]));
  const outputPath = String.raw`C:\review\Manual job.ctb`;
  let nativeOutputPath: unknown;
  const invoke = async (command: string, args?: unknown): Promise<unknown> => {
    switch (command) {
      case 'stage_mesh_binary_set': return {};
      case 'plugin:event|listen': return 1;
      case 'plugin:event|unlisten': return;
      case 'slice_solid_native_to_temp_path': {
        const job = JSON.parse((args as { jobJson: string }).jobJson);
        nativeOutputPath = job.output_path;
        return { tempPath: outputPath, byteLen: 1234 };
      }
      default: throw new Error(`Unexpected native command: ${command}`);
    }
  };
  const restore = installFakeWindow({
    dispatchEvent: () => true,
    __TAURI_INTERNALS__: { invoke, transformCallback: () => 1 },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
  });
  try {
    const result = await runSliceExportOrchestrator({
      models: [cubeModel('manual-name-cube', 1)], printerProfile: printer,
      materialProfile,
      filenameBase: 'generated-template', outputPath, outputMode: 'return',
    });
    assert.equal(nativeOutputPath, outputPath);
    assert.equal(result.artifact?.outputName, 'Manual job.ctb');
    assert.equal(result.artifact?.nativeTempPath, outputPath);
  } finally {
    restore();
  }
});
