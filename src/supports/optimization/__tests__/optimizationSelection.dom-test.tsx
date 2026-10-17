import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { getUndoCount } from '@/history/historyStore';
import { ClusterOptimizationCard } from '../ClusterOptimizationCard';
import { GridOptimizationCard } from '../GridOptimizationCard';
import { getClusterPreview } from '../clusterPreview';
import { getGridPreview } from '../gridPreview';
import { setSelectedSupportIds } from '../../interaction/supportMultiSelection';
import { gridPreviewFixture } from './gridPreviewFixture';
import { addMarqueeDependents } from './optimizationSelectionFixture';

for (const { name, Card, getPreview } of [
    { name: 'Cluster', Card: ClusterOptimizationCard, getPreview: getClusterPreview },
    { name: 'Grid', Card: GridOptimizationCard, getPreview: getGridPreview },
]) {
    test(`${name} Preview stays available when a same-model marquee adds roots, branches and braces`, async () => {
        const fixture = gridPreviewFixture();
        const ids = addMarqueeDependents();
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
        const button = (label: string) => [...container.querySelectorAll('button')].find((item) => item.textContent === label)!;
        try {
            await act(async () => root.render(<I18nProvider i18n={i18n}><Card context={fixture.context} /></I18nProvider>));
            assert.equal(button('Preview').disabled, false);
            await act(async () => setSelectedSupportIds(ids));
            assert.match(container.textContent!, /2 trunks selected/);
            assert.doesNotMatch(container.querySelector('[role="status"]')!.textContent!, /Select supports from the active model only/);
            assert.equal(button('Preview').disabled, false);
            await act(async () => button('Preview').click());
            assert.equal(getPreview().status, 'ready');
            assert.equal(getPreview().result!.selectedTrunkCount, 2);
            assert.equal(getPreview().result!.contactCountBefore, getPreview().result!.contactCountAfter);
            assert.equal(getUndoCount(), 0);
            await act(async () => setSelectedSupportIds([...ids, 'missing']));
            assert.equal(button('Preview').disabled, true);
            assert.equal(button('Apply').disabled, true);
            assert.match(container.querySelector('[role="status"]')!.textContent!, /Select supports from the active model only/);
            assert.equal(getPreview().proposal, null);
        } finally {
            await act(async () => root.unmount());
            container.remove();
            fixture.cleanup();
        }
    });
}
