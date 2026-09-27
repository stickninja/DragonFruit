import assert from 'node:assert/strict';
import test from 'node:test';
import {
  convertResinQuantityUnit,
  formatResinEstimateLabel,
  resinPrintEstimate,
  resinQuantityVolumeMl,
  sanitizeResinQuantity,
  sanitizeUncuredDensityGPerMl,
} from '../../profiles/resinQuantity';
import {
  addMaterialProfile, addPrinterProfile, createMaterialColorVariantDraft,
  duplicatePrinterProfileAsCustom, getProfileStoreSnapshot,
  hydrateProfilesFromStorage, importPrinterBundle, updateMaterialProfile,
} from '../../profiles/profileStore';

test('weight and volume quantities use only a positive finite uncured density', () => {
  assert.equal(resinQuantityVolumeMl({ value: 1, unit: 'kg' }, 1000, 1.25), 800);
  assert.equal(resinQuantityVolumeMl({ value: 500, unit: 'g' }, 1000, 1.25), 400);
  assert.equal(resinQuantityVolumeMl({ value: 500, unit: 'mL' }, 1000), 500);
  assert.equal(resinQuantityVolumeMl(undefined, 750), 750);
  assert.equal(resinQuantityVolumeMl({ value: 1, unit: 'kg' }, 1000), null);
  assert.equal(resinQuantityVolumeMl({ value: 1, unit: 'kg' }, 1000, 0), null);
  assert.equal(resinQuantityVolumeMl({ value: 1, unit: 'kg' }, 1000, Infinity), null);
  assert.deepEqual(convertResinQuantityUnit({ value: 1, unit: 'kg' }, 'g'), { value: 1000, unit: 'g' });
  assert.deepEqual(convertResinQuantityUnit({ value: 1, unit: 'kg' }, 'mL', 1.25), { value: 800, unit: 'mL' });
  assert.deepEqual(convertResinQuantityUnit({ value: 800, unit: 'mL' }, 'kg', 1.25), { value: 1, unit: 'kg' });
  assert.deepEqual(convertResinQuantityUnit({ value: 1, unit: 'kg' }, 'mL'), { value: 0, unit: 'mL' });
  assert.equal(sanitizeUncuredDensityGPerMl(true), undefined);
  assert.equal(sanitizeUncuredDensityGPerMl([1]), undefined);
  assert.equal(sanitizeUncuredDensityGPerMl(''), undefined);
  assert.deepEqual(sanitizeResinQuantity({ value: '1', unit: 'kg' }), { value: 1, unit: 'kg' });
  assert.deepEqual(sanitizeResinQuantity({ value: true, unit: 'kg' }), { value: 0, unit: 'kg' });
  assert.deepEqual(resinPrintEstimate(80, 25, { value: 1, unit: 'kg' }, 1000, 1.25),
    { volumeMl: 80, massG: 100, cost: 2.5 });
  assert.deepEqual(resinPrintEstimate(80, 25, { value: 1, unit: 'kg' }, 1000),
    { volumeMl: 80, massG: null, cost: null });
  assert.equal(resinPrintEstimate(NaN, 25, undefined, 1000).volumeMl, null);
  assert.equal(resinPrintEstimate(1e308, 1e308, undefined, 1).cost, null);
  assert.match(formatResinEstimateLabel(80, {
    bottlePrice: 25, bottleCapacityMl: 1000, resinQuantity: { value: 1, unit: 'kg' }, currencyCode: 'USD',
  }), /cost needs density/);
  assert.match(formatResinEstimateLabel(80, {
    bottlePrice: 25, bottleCapacityMl: 1000, resinQuantity: { value: 0, unit: 'kg' },
    uncuredDensityGPerMl: 1.25, currencyCode: 'USD',
  }), /cost unavailable/);
});

test('legacy volume and independent weight variants survive storage and bundle round trips', async () => {
  const storage = new Map<string, string>();
  const storageApi = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  };
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { localStorage: storageApi, sessionStorage: storageApi };
  try {
    hydrateProfilesFromStorage();
    const printerId = addPrinterProfile({ name: 'Resin Test Printer',
      ctbMotionCapability: { firmware: 'test-firmware', confirmed: true } });
    const legacyId = addMaterialProfile(printerId, { name: 'Legacy 750', bottleCapacityMl: 750, bottlePrice: 30 });
    const weightedId = addMaterialProfile(printerId, {
      name: 'Weighted', bottleCapacityMl: 1000, bottlePrice: 25,
      resinQuantity: { value: 1, unit: 'kg' }, uncuredDensityGPerMl: 1.25,
      ctbTimingV1: {
        enabled: true,
        defaults: {
          bottom: { lightOffDelaySec: 20, waitTimeBeforeCureSec: 1, waitTimeAfterCureSec: 0, waitTimeAfterLiftSec: 0 },
          normal: { lightOffDelaySec: 10, waitTimeBeforeCureSec: 1, waitTimeAfterCureSec: 0, waitTimeAfterLiftSec: 0 },
        },
        overrides: [{ id: 'motion-2', startLayer: 2, endLayer: 3, values: {}, motion: { liftDistanceMm: 7, retractSpeedMmMin: 120 } }],
        startupDummy: true,
      },
    });
    const weighted = getProfileStoreSnapshot().materialProfiles.find((item) => item.id === weightedId)!;
    const variantId = addMaterialProfile(printerId, createMaterialColorVariantDraft(weighted));
    updateMaterialProfile(variantId, { resinQuantity: { value: 500, unit: 'g' }, uncuredDensityGPerMl: undefined });
    const snapshot = getProfileStoreSnapshot();
    const variant = snapshot.materialProfiles.find((item) => item.id === variantId)!;
    assert.equal(variant.resinQuantity?.value, 500);
    assert.equal(variant.uncuredDensityGPerMl, undefined);
    assert.equal(snapshot.materialProfiles.find((item) => item.id === weightedId)?.uncuredDensityGPerMl, 1.25);
    const duplicateId = duplicatePrinterProfileAsCustom(printerId);
    assert.deepEqual(getProfileStoreSnapshot().printerProfiles.find((item) => item.id === duplicateId)?.ctbMotionCapability,
      { firmware: 'test-firmware', confirmed: true });
    const duplicate = getProfileStoreSnapshot().materialProfiles.find((item) => item.printerProfileId === duplicateId && item.name === 'Weighted')!;
    assert.deepEqual(duplicate.resinQuantity, { value: 1, unit: 'kg' });
    assert.notStrictEqual(duplicate.resinQuantity, weighted.resinQuantity);
    const importedId = importPrinterBundle({ printer: snapshot.printerProfiles.find((item) => item.id === printerId),
      materials: snapshot.materialProfiles.filter((item) => item.printerProfileId === printerId) });
    const imported = getProfileStoreSnapshot().materialProfiles.filter((item) => item.printerProfileId === importedId);
    assert.deepEqual(getProfileStoreSnapshot().printerProfiles.find((item) => item.id === importedId)?.ctbMotionCapability,
      { firmware: 'test-firmware', confirmed: true });
    assert.equal(imported.find((item) => item.name === 'Legacy 750')?.bottleCapacityMl, 750);
    assert.equal(imported.find((item) => item.name === 'Legacy 750')?.resinQuantity, undefined);
    assert.deepEqual(imported.find((item) => item.name === 'Weighted')?.resinQuantity, { value: 1, unit: 'kg' });
    assert.equal(imported.find((item) => item.name === 'Weighted')?.uncuredDensityGPerMl, 1.25);
    assert.equal(imported.find((item) => item.name === 'Weighted')?.resinQuantity === weighted.resinQuantity, false);
    const persisted = JSON.parse(storage.get('dragonfruit-profiles-v1')!);
    const legacy = persisted.state.materialProfiles.find((item: { id: string }) => item.id === legacyId);
    assert.equal(legacy.bottleCapacityMl, 750);
    assert.equal(legacy.resinQuantity, undefined);
    const reloadUrl = new URL(`../../profiles/profileStore.ts?resin-reload-${Date.now()}`, import.meta.url).href;
    const reloadedStore = await import(reloadUrl);
    const reloaded = reloadedStore.getProfileStoreSnapshot();
    assert.equal(reloaded.materialProfiles.find((item: { id: string }) => item.id === legacyId)?.bottleCapacityMl, 750);
    assert.equal(reloaded.materialProfiles.find((item: { id: string }) => item.id === legacyId)?.resinQuantity, undefined);
    assert.deepEqual(reloaded.materialProfiles.find((item: { id: string }) => item.id === weightedId)?.resinQuantity,
      { value: 1, unit: 'kg' });
    assert.equal(reloaded.materialProfiles.find((item: { id: string }) => item.id === weightedId)?.uncuredDensityGPerMl, 1.25);
    assert.deepEqual(reloaded.materialProfiles.find((item: { id: string }) => item.id === weightedId)?.ctbTimingV1?.overrides[0]?.motion,
      { liftDistanceMm: 7, retractSpeedMmMin: 120 });
    assert.deepEqual(reloaded.printerProfiles.find((item: { id: string }) => item.id === printerId)?.ctbMotionCapability,
      { firmware: 'test-firmware', confirmed: true });
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
  }
});
