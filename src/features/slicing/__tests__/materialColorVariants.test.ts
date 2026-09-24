import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addMaterialProfile,
  addPrinterProfile,
  createMaterialColorVariantDraft,
  duplicatePrinterProfileAsCustom,
  getProfileStoreSnapshot,
  hydrateProfilesFromStorage,
  importPrinterBundle,
  setActiveMaterialProfile,
  updateMaterialProfile,
} from '../../profiles/profileStore';
import { resolveCompositeMaterialLabel, resolveMaterialProfileListLabel } from '../../../utils/materialLabel';
import { resolveSliceFilenameFormat } from '../sliceFilenameFormat';

test('material colors survive legacy load, persistence, duplication, and printer bundle import as independent profiles', async () => {
  const printerId = addPrinterProfile({ name: 'Test Printer' });
  const initial = getProfileStoreSnapshot();
  const legacyMaterial = initial.materialProfiles.find((material) => material.printerProfileId === printerId)!;
  const storage = new Map<string, string>();
  const storageApi = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  };
  const previousWindow = (globalThis as { window?: unknown }).window;
  storage.set('dragonfruit-profiles-v1', JSON.stringify({
    version: 3,
    state: {
      ...initial,
      materialProfiles: [{ ...legacyMaterial, colorName: undefined, colorHex: undefined }],
    },
  }));
  (globalThis as { window?: unknown }).window = { localStorage: storageApi, sessionStorage: storageApi };

  try {
    hydrateProfilesFromStorage();
    assert.equal(getProfileStoreSnapshot().materialProfiles[0]?.colorName, undefined);
    assert.equal(resolveCompositeMaterialLabel(getProfileStoreSnapshot().materialProfiles[0]), 'Default Standard 405nm');

    const baseId = addMaterialProfile(printerId, {
      name: 'Rapid', brand: 'Acme', resinFamily: 'tough',
      normalExposureSec: 2.3,
      scaleCompensationPct: { x: 1, y: 2, z: 3 },
      localSettingsByOutput: { '.ctb': { waitBeforeCure: 1.5 } },
      ctbTimingV1: {
        enabled: true,
        defaults: {
          bottom: { lightOffDelaySec: 30, waitTimeBeforeCureSec: 1, waitTimeAfterCureSec: 0, waitTimeAfterLiftSec: 0 },
          normal: { lightOffDelaySec: 20, waitTimeBeforeCureSec: 2, waitTimeAfterCureSec: 0, waitTimeAfterLiftSec: 0 },
        },
        overrides: [{ id: 'layer-10', startLayer: 10, endLayer: 10, values: { lightOffDelaySec: 32 } }],
        startupDummy: true,
      },
      colorName: ' Red ', colorHex: '#aBc123',
    });
    const persistedBeforeDraft = storage.get('dragonfruit-profiles-v1');
    const countBeforeDraft = getProfileStoreSnapshot().materialProfiles.length;
    const draft = createMaterialColorVariantDraft(getProfileStoreSnapshot().materialProfiles.find((material) => material.id === baseId)!);
    assert.equal(storage.get('dragonfruit-profiles-v1'), persistedBeforeDraft);
    assert.equal(getProfileStoreSnapshot().materialProfiles.length, countBeforeDraft);
    assert.equal(draft.officialTemplateId, undefined);
    assert.equal(draft.colorName, undefined);
    const variantId = addMaterialProfile(printerId, draft);
    assert.notEqual(variantId, baseId);
    const base = getProfileStoreSnapshot().materialProfiles.find((material) => material.id === baseId)!;
    let variant = getProfileStoreSnapshot().materialProfiles.find((material) => material.id === variantId)!;
    assert.equal(base.colorName, 'Red');
    assert.equal(base.colorHex, '#ABC123');
    assert.equal(variant.colorName, undefined);
    assert.equal(variant.colorHex, undefined);
    assert.equal(variant.normalExposureSec, 2.3);
    assert.equal(variant.localSettingsByOutput?.['.ctb']?.waitBeforeCure, 1.5);
    assert.notStrictEqual(variant.scaleCompensationPct, base.scaleCompensationPct);
    assert.notStrictEqual(variant.localSettingsByOutput, base.localSettingsByOutput);
    assert.notStrictEqual(variant.ctbTimingV1, base.ctbTimingV1);
    assert.notStrictEqual(variant.ctbTimingV1?.overrides, base.ctbTimingV1?.overrides);
    assert.notStrictEqual(variant.antiAliasingSettings, base.antiAliasingSettings);

    updateMaterialProfile(variantId, {
      colorName: 'Blue', colorHex: '#123456', normalExposureSec: 3.1, liftSpeedMmMin: 42,
      localSettingsByOutput: { '.ctb': { waitBeforeCure: 2.5 } },
      ctbTimingV1: { ...variant.ctbTimingV1!, defaults: {
        ...variant.ctbTimingV1!.defaults,
        normal: { ...variant.ctbTimingV1!.defaults.normal, lightOffDelaySec: 24 },
      } },
    });
    setActiveMaterialProfile(variantId);
    variant = getProfileStoreSnapshot().materialProfiles.find((material) => material.id === variantId)!;
    assert.equal(variant.normalExposureSec, 3.1);
    assert.equal(variant.liftSpeedMmMin, 42);
    assert.equal(variant.localSettingsByOutput?.['.ctb']?.waitBeforeCure, 2.5);
    assert.equal(variant.ctbTimingV1?.defaults.normal.lightOffDelaySec, 24);
    assert.equal(base.ctbTimingV1?.defaults.normal.lightOffDelaySec, 20);
    assert.equal(getProfileStoreSnapshot().materialProfiles.find((material) => material.id === baseId)?.normalExposureSec, 2.3);
    assert.equal(getProfileStoreSnapshot().materialProfiles.find((material) => material.id === baseId)?.liftSpeedMmMin, 60);
    assert.equal(getProfileStoreSnapshot().materialProfiles.find((material) => material.id === baseId)?.localSettingsByOutput?.['.ctb']?.waitBeforeCure, 1.5);
    assert.equal(resolveCompositeMaterialLabel(variant), 'Acme Tough Rapid Blue');
    assert.equal(resolveMaterialProfileListLabel(variant), 'Rapid Blue');
    assert.equal(resolveSliceFilenameFormat('{material_name}', {
      printerName: 'Test Printer', materialName: resolveCompositeMaterialLabel(variant)!, layerHeightMm: 0.05, timestamp: new Date(2026, 8, 23),
    }).basename, 'Acme_Tough_Rapid_Blue');

    const officialId = addMaterialProfile(printerId, { name: 'Locked Resin', officialTemplateId: 'test-template', normalExposureSec: 4.2 });
    updateMaterialProfile(officialId, { normalExposureSec: 9 });
    const official = getProfileStoreSnapshot().materialProfiles.find((material) => material.id === officialId)!;
    assert.equal(official.normalExposureSec, 4.2);
    const officialDraft = createMaterialColorVariantDraft(official);
    assert.equal(officialDraft.officialTemplateId, undefined);
    const officialVariantId = addMaterialProfile(printerId, { ...officialDraft, colorName: 'Amber' });
    updateMaterialProfile(officialVariantId, { normalExposureSec: 5 });
    assert.equal(getProfileStoreSnapshot().materialProfiles.find((material) => material.id === officialVariantId)?.normalExposureSec, 5);
    assert.equal(getProfileStoreSnapshot().materialProfiles.find((material) => material.id === officialId)?.normalExposureSec, 4.2);

    const invalidId = addMaterialProfile(printerId, { name: 'Invalid Color', colorName: '  ', colorHex: '#oops' });
    assert.equal(getProfileStoreSnapshot().materialProfiles.find((material) => material.id === invalidId)?.colorHex, undefined);

    const persisted = JSON.parse(storage.get('dragonfruit-profiles-v1')!);
    assert.equal(persisted.state.materialProfiles.find((material: { id: string }) => material.id === variantId).colorHex, '#123456');
    const persistedInvalid = persisted.state.materialProfiles.find((material: { id: string }) => material.id === invalidId);
    persistedInvalid.colorName = 42;
    persistedInvalid.colorHex = 'red';
    storage.set('dragonfruit-profiles-v1', JSON.stringify(persisted));
    const reloadUrl = new URL(`../../profiles/profileStore.ts?material-color-reload-${Date.now()}`, import.meta.url).href;
    const reloadedStore = await import(reloadUrl);
    const reloaded = reloadedStore.getProfileStoreSnapshot();
    const reloadedVariant = reloaded.materialProfiles.find((material: { id: string }) => material.id === variantId);
    assert.equal(reloaded.activeMaterialProfileId, variantId);
    assert.equal(reloadedVariant.colorName, 'Blue');
    assert.equal(reloadedVariant.colorHex, '#123456');
    assert.equal(reloadedVariant.normalExposureSec, 3.1);
    assert.equal(reloadedVariant.liftSpeedMmMin, 42);
    assert.equal(reloadedVariant.localSettingsByOutput['.ctb'].waitBeforeCure, 2.5);
    assert.equal(reloadedVariant.ctbTimingV1.defaults.normal.lightOffDelaySec, 24);
    assert.equal(reloadedVariant.ctbTimingV1.overrides[0].values.lightOffDelaySec, 32);
    const reloadedInvalid = reloaded.materialProfiles.find((material: { id: string }) => material.id === invalidId);
    assert.equal(reloadedInvalid.colorName, undefined);
    assert.equal(reloadedInvalid.colorHex, undefined);

    const copiedPrinterId = duplicatePrinterProfileAsCustom(printerId);
    const copiedVariant = getProfileStoreSnapshot().materialProfiles.find((material) => material.printerProfileId === copiedPrinterId && material.colorName === 'Blue')!;
    assert.ok(copiedVariant);
    assert.notEqual(copiedVariant.id, variantId);
    assert.notStrictEqual(copiedVariant.localSettingsByOutput, variant.localSettingsByOutput);
    assert.notStrictEqual(copiedVariant.ctbTimingV1, variant.ctbTimingV1);

    const importedPrinterId = importPrinterBundle({ printer: getProfileStoreSnapshot().printerProfiles.find((printer) => printer.id === printerId), materials: [variant] });
    const imported = getProfileStoreSnapshot().materialProfiles.find((material) => material.printerProfileId === importedPrinterId)!;
    assert.equal(imported.colorName, 'Blue');
    assert.equal(imported.colorHex, '#123456');
    assert.notEqual(imported.id, variantId);
    assert.equal(imported.ctbTimingV1?.startupDummy, true);
    assert.notStrictEqual(imported.ctbTimingV1, variant.ctbTimingV1);

    updateMaterialProfile(variantId, { colorName: '', colorHex: undefined });
    const cleared = getProfileStoreSnapshot().materialProfiles.find((material) => material.id === variantId)!;
    assert.equal(cleared.colorName, undefined);
    assert.equal(cleared.colorHex, undefined);
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test('hex-only swatches are represented in the material label', () => {
  assert.equal(resolveCompositeMaterialLabel({ name: 'Rapid', colorHex: '#aBc123' }), 'Rapid #ABC123');
  assert.equal(resolveMaterialProfileListLabel({ name: 'Rapid', colorHex: '#aBc123' }), 'Rapid #ABC123');
  assert.equal(resolveMaterialProfileListLabel({ name: 'Rapid' }), 'Rapid');
});
