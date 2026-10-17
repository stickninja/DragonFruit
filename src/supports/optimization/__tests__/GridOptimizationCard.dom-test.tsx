import assert from 'node:assert/strict';
import test from 'node:test';
import { act, useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { GridOptimizationCard } from '../GridOptimizationCard';
import { OptimizationTools } from '../OptimizationTools';
import type { GridPreviewContext } from '../gridPreview';
import { getSettings as currentSettings } from '../../Settings/state';
import { getGridPreview, getGridRenderSnapshot } from '../gridPreview';
import { getSnapshot, setSelectedId, subscribe } from '../../state';
import { getSettings, setSettings, subscribeToSettings } from '../../Settings/state';
import { getUndoCount, undo } from '@/history/historyStore';
import { registerSupportHistoryHandlers } from '../../history/useSupportHistoryHandlers';
import { setSelectedSupportIds } from '../../interaction/supportMultiSelection';
import { gridPreviewFixture } from './gridPreviewFixture';
import { registerMeshForAutoBrace, unregisterMeshForAutoBrace } from '../../autoBracing/meshGeometryStore';

test('Grid card requires selection and preview, displays real counts, cancels stale limits, and clears rendering on unmount', async () => {
    const fixture = gridPreviewFixture();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
    const button = (label: string) => {
        const element = [...container.querySelectorAll('button')].find((item) => item.textContent === label || item.getAttribute('aria-label') === label);
        assert.ok(element, `button ${label} exists`);
        return element;
    };
    try {
        await act(async () => root.render(<I18nProvider i18n={i18n}><GridOptimizationCard context={fixture.context} /></I18nProvider>));
        assert.equal(button('Apply').disabled, true);
        assert.equal(button('Preview').disabled, false);
        assert.match(container.textContent!, /2 trunks selected/);
        await act(async () => button('Preview').click());
        assert.equal(button('Apply').disabled, false);
        assert.match(container.textContent!, /1 trunk shifted/);
        assert.match(container.textContent!, /2 contacts preserved/);
        assert.equal(Object.keys(getSnapshot().trunks).length, 2);
        assert.equal(Object.keys(getGridRenderSnapshot()!.trunks).length, 2);
        assert.match(container.textContent!, /1 trunk unchanged/);
        assert.match(container.textContent!, /1 trunk already aligned/);
        await act(async () => button('Cancel preview').click());
        assert.equal(button('Apply').disabled, true);
        assert.equal(getGridRenderSnapshot(), null);
        await act(async () => button('Preview').click());
        const slider = container.querySelector<HTMLInputElement>('input[aria-label="Optimization grid spacing in millimeters"]')!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '3');
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
        });
        assert.equal(getGridPreview().status, 'stale');
        assert.equal(button('Apply').disabled, true);
        await act(async () => setSelectedSupportIds([]));
        assert.equal(button('Preview').disabled, true);
        assert.match(container.textContent!, /Select at least one trunk/);
        assert.equal(getUndoCount(), 0);
        await act(async () => setSelectedSupportIds(['a', 'b']));
        await act(async () => button('Preview').click());
        assert.ok(getGridRenderSnapshot());
        await act(async () => root.unmount());
        assert.equal(getGridRenderSnapshot(), null);
    } finally {
        if (container.firstChild) await act(async () => root.unmount());
        container.remove();
        fixture.cleanup();
    }
});

test('Grid card Apply commits its reviewed proposal once', async () => {
    const fixture = gridPreviewFixture();
    const disposeHistory = registerSupportHistoryHandlers();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
    try {
        await act(async () => root.render(<I18nProvider i18n={i18n}><GridOptimizationCard context={fixture.context} /></I18nProvider>));
        const preview = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Preview')!;
        const apply = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Apply')!;
        await act(async () => preview.click());
        await act(async () => apply.click());
        assert.equal(Object.keys(getSnapshot().trunks).length, 2);
        assert.notEqual(getSnapshot().roots['root-a'].transform.pos.x, fixture.original.roots['root-a'].transform.pos.x);
        assert.equal(getUndoCount(), 1);
        assert.equal(apply.disabled, true);
        assert.match(container.textContent!, /applied as one undoable change/);
        await act(async () => undo());
        assert.equal(Object.keys(getSnapshot().trunks).length, 2);
        assert.doesNotMatch(container.textContent!, /1 trunk shifted|applied as one undoable change/);
    } finally {
        await act(async () => root.unmount());
        container.remove();
        disposeHistory();
        fixture.cleanup();
    }
});

test('Grid card presents a localized recoverable planning error with Apply disabled', async () => {
    const fixture = gridPreviewFixture();
    const trunk = getSnapshot().trunks.a;
    const descriptor = Object.getOwnPropertyDescriptor(trunk, 'contactCone')!;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
    try {
        await act(async () => root.render(<I18nProvider i18n={i18n}><GridOptimizationCard context={fixture.context} /></I18nProvider>));
        Object.defineProperty(trunk, 'contactCone', { configurable: true, get() { throw new Error('contact invariant failed'); } });
        const preview = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Preview')!;
        await act(async () => preview.click());
        assert.match(container.querySelector('[role="status"]')!.textContent!, /Grid preview failed/);
        assert.equal([...container.querySelectorAll('button')].find((item) => item.textContent === 'Apply')!.disabled, true);
        assert.equal(getGridRenderSnapshot(), null);
        assert.equal(getUndoCount(), 0);
    } finally {
        Object.defineProperty(trunk, 'contactCone', descriptor);
        await act(async () => root.unmount());
        container.remove();
        fixture.cleanup();
    }
});

test('Apply feedback survives equal normalized settings restored when the primary selection clears', async () => {
    const fixture = gridPreviewFixture();
    const previousSettings = getSettings();
    setSelectedId('a');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const disposeHistory = registerSupportHistoryHandlers();
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
    function SettingsRestore() {
        const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
        const settings = useSyncExternalStore(subscribeToSettings, getSettings, getSettings);
        const previousSelection = useRef(snapshot.selectedId);
        useEffect(() => {
            if (previousSelection.current && !snapshot.selectedId) setSettings(previousSettings);
            previousSelection.current = snapshot.selectedId;
        }, [snapshot.selectedId]);
        return <GridOptimizationCard context={{ ...fixture.context, autoBracingSettings: settings.autoBracing, gridSettings: settings.grid }} />;
    }
    try {
        const initialGrid = getSettings().grid;
        await act(async () => root.render(<I18nProvider i18n={i18n}><SettingsRestore /></I18nProvider>));
        await act(async () => [...container.querySelectorAll('button')].find((item) => item.textContent === 'Preview')!.click());
        await act(async () => [...container.querySelectorAll('button')].find((item) => item.textContent === 'Apply')!.click());
        assert.notEqual(getSettings().grid, initialGrid, 'real settings restoration creates new grid identity');
        assert.equal(getSnapshot().selectedId, null);
        assert.match(container.textContent!, /1 trunk shifted/);
        assert.match(container.textContent!, /applied as one undoable change/);
        assert.equal(getUndoCount(), 1);
        await act(async () => undo());
        assert.doesNotMatch(container.textContent!, /1 trunk shifted|applied as one undoable change/);
    } finally {
        await act(async () => root.unmount());
        disposeHistory();
        container.remove();
        setSettings(previousSettings);
        fixture.cleanup();
    }
});


test('Optimize tool selection cancels either preview and retains session spacing without writing placement settings', async () => {
    const fixture = gridPreviewFixture();
    const initialSettings = currentSettings();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
    const button = (label: string) => [...container.querySelectorAll('button')].find((item) => item.textContent === label)!;
    const gridButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('[data-grid-optimization] button')].find((item) => item.textContent === label)!;
    try {
        await act(async () => root.render(<I18nProvider i18n={i18n}><OptimizationTools context={fixture.context} /></I18nProvider>));
        assert.equal(button('Cluster').getAttribute('aria-pressed'), 'true');
        await act(async () => button('Grid').click());
        assert.equal(button('Grid').getAttribute('aria-pressed'), 'true');
        const input = container.querySelector<HTMLInputElement>('input[aria-label="Optimization grid spacing in millimeters"]')!;
        assert.equal(input.value, '2');
        await act(async () => gridButton('Preview').click());
        assert.ok(getGridRenderSnapshot());
        await act(async () => button('Cluster').click());
        assert.equal(getGridRenderSnapshot(), null);
        await act(async () => button('Grid').click());
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '3');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => button('Cluster').click());
        await act(async () => button('Grid').click());
        assert.equal(input.value, '3');
        assert.equal(currentSettings(), initialSettings);
        assert.equal(getUndoCount(), 0);
    } finally { await act(async () => root.unmount()); container.remove(); fixture.cleanup(); }
});

test('Grid cancels a proposal on context and lock changes, and never enables Apply while locked', async () => {
    const fixture = gridPreviewFixture();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
    const render = (context: GridPreviewContext) => act(async () => root.render(<I18nProvider i18n={i18n}><GridOptimizationCard context={context} /></I18nProvider>));
    const button = (label: string) => [...container.querySelectorAll('button')].find((item) => item.textContent === label)!;
    try {
        await render(fixture.context);
        await act(async () => button('Preview').click());
        assert.equal(button('Apply').disabled, false);
        await render({ ...fixture.context, plateBounds: { ...fixture.context.plateBounds!, minX: -40 } });
        assert.equal(getGridRenderSnapshot(), null);
        assert.equal(button('Apply').disabled, true);
        await act(async () => button('Preview').click());
        await render({ ...fixture.context, isPlateLocked: true });
        assert.equal(getGridRenderSnapshot(), null);
        assert.equal(button('Preview').disabled, true);
        assert.equal(button('Apply').disabled, true);
        assert.match(container.textContent!, /Unlock the active plate/);
        await render(fixture.context);
        assert.equal(button('Preview').disabled, false);
        assert.equal(button('Apply').disabled, true);
        assert.equal(getUndoCount(), 0);
    } finally { await act(async () => root.unmount()); container.remove(); fixture.cleanup(); }
});


test('Grid Preview eligibility follows model mesh registration after mounting', async () => {
    const fixture = gridPreviewFixture();
    unregisterMeshForAutoBrace('model');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
    const button = (label: string) => [...container.querySelectorAll('button')].find((item) => item.textContent === label)!;
    try {
        await act(async () => root.render(<I18nProvider i18n={i18n}><GridOptimizationCard context={fixture.context} /></I18nProvider>));
        assert.equal(button('Preview').disabled, true);
        assert.match(container.querySelector('[role="status"]')!.textContent!, /Model geometry is unavailable/);
        await act(async () => registerMeshForAutoBrace('model', fixture.geometry, fixture.transform));
        assert.equal(button('Preview').disabled, false);
        assert.match(container.querySelector('[role="status"]')!.textContent!, /Preview aligns selected trunk roots/);
        await act(async () => unregisterMeshForAutoBrace('model'));
        assert.equal(button('Preview').disabled, true);
        assert.match(container.querySelector('[role="status"]')!.textContent!, /Model geometry is unavailable/);
        assert.equal(getUndoCount(), 0);
    } finally { await act(async () => root.unmount()); container.remove(); fixture.cleanup(); }
});
