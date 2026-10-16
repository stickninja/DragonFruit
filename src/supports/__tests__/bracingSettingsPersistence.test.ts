import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultSettings } from '../Settings/types';
import { decodeSupportSettingsHex, encodeSupportSettingsHex } from '../Settings/supportSettingsCodec';
import { getSettings, loadSettingsFromLocalStorage, saveSettingsToLocalStorage, setSettings } from '../Settings/state';
import { createPreset, deletePreset, setActivePreset } from '../Settings/presets';

test('bracing settings survive saved settings, presets and geometry codec bases', () => {
    const values = new Map<string, string>();
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    const before = getSettings();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        },
    });
    let presetId: string | undefined;
    try {
        const settings = createDefaultSettings();
        settings.autoBracing = { ...settings.autoBracing, braceSizingMode: 'relative', braceDiameterPercent: 35, braceDiameterMm: 0.8, autoBraceWhilePlacing: true };
        setSettings(settings);
        saveSettingsToLocalStorage();
        setSettings(createDefaultSettings());
        assert.equal(loadSettingsFromLocalStorage(), true);
        assert.deepEqual(getSettings().autoBracing, settings.autoBracing);
        const preset = createPreset('Relative bracing persistence test');
        presetId = preset.id;
        assert.deepEqual(preset.settings.autoBracing, settings.autoBracing);
        const savedPresets = JSON.parse(values.get('support-presets-v1')!);
        assert.deepEqual(savedPresets.byId[preset.id].settings.autoBracing, settings.autoBracing);
        setActivePreset('detail');
        assert.deepEqual(getSettings().autoBracing, settings.autoBracing, 'switching geometry presets preserves studio bracing');
        const hex = encodeSupportSettingsHex(settings);
        assert.equal(hex.length, 84, 'geometry-only v1 wire layout stays compatible');
        assert.deepEqual(decodeSupportSettingsHex(hex, settings)?.autoBracing, settings.autoBracing);
        assert.equal(decodeSupportSettingsHex(hex)?.autoBracing.autoBraceWhilePlacing, false);
    } finally {
        if (presetId) deletePreset(presetId);
        setSettings(before);
        if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
        else delete (globalThis as { localStorage?: unknown }).localStorage;
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else delete (globalThis as { window?: unknown }).window;
    }
});
