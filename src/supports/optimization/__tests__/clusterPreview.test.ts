import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { getSnapshot, getOwnedPrimitives, setSnapshot, setHoveredState } from '../../state';
import type { Kickstand, SupportState } from '../../types';
import { getSelectedSupportIds, setSelectedSupportIds } from '../../interaction/supportMultiSelection';
import { registerMeshForAutoBrace } from '../../autoBracing/meshGeometryStore';
import { registerSupportHistoryHandlers } from '../../history/useSupportHistoryHandlers';
import { clearHistory, getUndoCount, getRedoCount, undo, redo, peekUndo } from '@/history/historyStore';
import { DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS as options } from '../clusterOptimization';
import { applyClusterOptimization, cancelClusterPreview, getClusterPreview, getClusterRenderSnapshot, previewClusterOptimization } from '../clusterPreview';
import { clusterPreviewFixture } from './clusterPreviewFixture';

test('preview exposes the proposed geometry without changing live supports or history, and Cancel restores rendering', () => {
    const fixture = clusterPreviewFixture();
    try {
        const before = getSnapshot();
        assert.equal(previewClusterOptimization(fixture.context, options), null);
        assert.equal(getSnapshot(), before);
        assert.equal(Object.keys(getSnapshot().trunks).length, 2);
        assert.equal(Object.keys(getClusterRenderSnapshot()!.trunks).length, 1);
        assert.equal(Object.keys(getClusterRenderSnapshot()!.branches).length, 1);
        assert.equal(Object.keys(getClusterRenderSnapshot()!.roots).length, 1);
        assert.equal(getUndoCount(), 0);
        setHoveredState('model', 'model');
        assert.ok(getClusterRenderSnapshot(), 'ordinary hover keeps the checked proposal');
        cancelClusterPreview();
        assert.equal(getClusterRenderSnapshot(), null);
        assert.equal(getSnapshot().trunks, before.trunks);
    } finally { fixture.cleanup(); }
});

test('Apply pushes one immediate history record and Undo/Redo restores the entire graph', () => {
    const fixture = clusterPreviewFixture();
    const dispose = registerSupportHistoryHandlers();
    try {
        const before = JSON.stringify(getSnapshot().supports);
        previewClusterOptimization(fixture.context, options);
        assert.equal(applyClusterOptimization(fixture.context, options), true);
        assert.equal(getUndoCount(), 1);
        assert.equal(getSelectedSupportIds().length, 0);
        assert.equal(peekUndo()?.type, 'support:edit-replace');
        assert.equal(getClusterRenderSnapshot(), null);
        assert.equal(Object.keys(getSnapshot().trunks).length, 1);
        assert.equal(getClusterPreview().status, 'applied');
        assert.ok(getClusterPreview().result);
        const after = JSON.stringify(getSnapshot().supports);
        undo();
        assert.equal(getClusterPreview().status, 'idle');
        assert.equal(getClusterPreview().result, null);
        assert.equal(getUndoCount(), 0);
        assert.equal(getRedoCount(), 1);
        assert.equal(JSON.stringify(getSnapshot().supports), before);
        assert.equal(Object.keys(getSnapshot().roots).length, 2);
        redo();
        assert.equal(getClusterPreview().result, null, 'Redo does not revive a stale completion card');
        assert.equal(JSON.stringify(getSnapshot().supports), after);
        assert.equal(Object.keys(getSnapshot().roots).length, 1);
    } finally { dispose(); fixture.cleanup(); }
});

test('applied counts clear on later graph, selection, and history changes while ordinary hover retains success', () => {
    const fixture = clusterPreviewFixture();
    try {
        const original = getSnapshot();
        const apply = () => {
            setSnapshot(original);
            setSelectedSupportIds(['a', 'b']);
            previewClusterOptimization(fixture.context, options);
            assert.equal(applyClusterOptimization(fixture.context, options), true);
            assert.equal(getClusterPreview().status, 'applied');
        };
        apply();
        setHoveredState('model', 'model');
        assert.equal(getClusterPreview().status, 'applied');
        setSnapshot({ ...getSnapshot(), roots: { ...getSnapshot().roots } });
        assert.equal(getClusterPreview().result, null);
        apply();
        setSelectedSupportIds(['a']);
        assert.equal(getClusterPreview().result, null);
        apply();
        clearHistory();
        assert.equal(getClusterPreview().result, null);
    } finally { fixture.cleanup(); }
});

test('planning failures return a recoverable error without live mutations or history', () => {
    const fixture = clusterPreviewFixture();
    const trunk = getSnapshot().trunks.a;
    const descriptor = Object.getOwnPropertyDescriptor(trunk, 'contactCone')!;
    try {
        Object.defineProperty(trunk, 'contactCone', { configurable: true, get() { throw new Error('contact invariant failed'); } });
        const before = getSnapshot();
        assert.equal(previewClusterOptimization(fixture.context, options), 'failed');
        assert.equal(getSnapshot(), before);
        assert.equal(getClusterRenderSnapshot(), null);
        assert.equal(getClusterPreview().status, 'idle');
        assert.equal(getUndoCount(), 0);
        Object.defineProperty(trunk, 'contactCone', descriptor);
        assert.equal(previewClusterOptimization(fixture.context, options), null, 'a later valid preview can recover');
    } finally {
        Object.defineProperty(trunk, 'contactCone', descriptor);
        fixture.cleanup();
    }
});

test('zero reduction and stale options never mutate supports or history', () => {
    const fixture = clusterPreviewFixture();
    try {
        const before = getSnapshot();
        const unchanged = { ...options, reductionPercent: 0 };
        previewClusterOptimization(fixture.context, unchanged);
        assert.equal(applyClusterOptimization(fixture.context, unchanged), false);
        assert.equal(getSnapshot(), before);
        assert.equal(getUndoCount(), 0);
        previewClusterOptimization(fixture.context, options);
        assert.equal(applyClusterOptimization(fixture.context, { ...options, maxReachMm: 1 }), false);
        assert.equal(getClusterPreview().status, 'stale');
        assert.equal(getUndoCount(), 0);
        previewClusterOptimization(fixture.context, options);
        assert.equal(applyClusterOptimization({ ...fixture.context, gridSettings: { ...fixture.context.gridSettings, spacingMm: fixture.context.gridSettings.spacingMm + 1 } }, options), false);
        assert.equal(getClusterPreview().status, 'stale', 'changed grid context cannot apply the old generated braces');
    } finally { fixture.cleanup(); }
});

test('equal normalized settings objects keep the reviewed proposal applicable', () => {
    const fixture = clusterPreviewFixture();
    try {
        previewClusterOptimization(fixture.context, options);
        assert.equal(applyClusterOptimization({
            ...fixture.context,
            autoBracingSettings: { ...fixture.context.autoBracingSettings },
            gridSettings: { ...fixture.context.gridSettings },
        }, options), true);
        assert.equal(getClusterPreview().status, 'applied');
    } finally { fixture.cleanup(); }
});

test('selection, support topology, and own or neighbouring geometry changes invalidate a proposal', () => {
    const fixture = clusterPreviewFixture();
    const neighbour = new THREE.BoxGeometry(1, 1, 1);
    try {
        const context = { ...fixture.context, plateModelIds: ['model', 'neighbour'] };
        previewClusterOptimization(context, options);
        setSelectedSupportIds(['a']);
        assert.equal(getClusterPreview().status, 'stale');
        setSelectedSupportIds(['a', 'b']);
        previewClusterOptimization(context, options);
        setSnapshot({ ...getSnapshot(), roots: { ...getSnapshot().roots } });
        assert.equal(getClusterRenderSnapshot(), null);
        setSelectedSupportIds(['a', 'b']);
        previewClusterOptimization(context, options);
        registerMeshForAutoBrace('model', fixture.geometry, fixture.transform);
        assert.equal(getClusterPreview().status, 'stale');
        previewClusterOptimization(context, options);
        registerMeshForAutoBrace('neighbour', neighbour, new THREE.Matrix4().makeTranslation(100, 0, 0));
        assert.equal(getClusterPreview().status, 'stale', 'newly registered neighbour also invalidates');
        assert.equal(applyClusterOptimization(context, options), false);
        assert.equal(getUndoCount(), 0);
    } finally { neighbour.dispose(); fixture.cleanup(); }
});

test('explicit model/plate scope is required and empty selection never expands to the model', () => {
    const fixture = clusterPreviewFixture();
    try {
        assert.equal(previewClusterOptimization({ ...fixture.context, modelId: 'other' }, options), 'model');
        assert.equal(previewClusterOptimization({ ...fixture.context, plateId: 'other' }, options), 'plate');
        setSelectedSupportIds([]);
        assert.equal(previewClusterOptimization(fixture.context, options), 'selection');
        assert.equal(getClusterRenderSnapshot(), null);
        assert.equal(Object.keys(getSnapshot().trunks).length, 2);
        assert.equal(getUndoCount(), 0);
    } finally { fixture.cleanup(); }
});

test('single-model clearance checks the active model even with no neighbouring collision meshes', () => {
    const fixture = clusterPreviewFixture();
    const wall = new THREE.BoxGeometry(1, 100, 100);
    wall.computeBoundsTree();
    try {
        registerMeshForAutoBrace('model', wall, new THREE.Matrix4().makeTranslation(2, 0, 20));
        previewClusterOptimization(fixture.context, options);
        assert.equal(getClusterPreview().result?.changedCount, 0);
        assert.equal(applyClusterOptimization(fixture.context, options), false);
        assert.equal(getUndoCount(), 0);
    } finally { wall.dispose(); fixture.cleanup(); }
});

test('proposal rendering derives only the kickstand-owned roots and knots from the proposed snapshot', () => {
    const fixture = clusterPreviewFixture();
    try {
        const live = getSnapshot();
        const proposal: SupportState = {
            ...live,
            roots: { ...live.roots, 'stand-root': { ...live.roots['root-a'], id: 'stand-root' } },
            knots: {
                'stand-knot': { id: 'stand-knot', parentShaftId: 'seg-a', pos: { x: 0, y: 0, z: 8 } },
                unrelated: { id: 'unrelated', parentShaftId: 'seg-b', pos: { x: 4, y: 0, z: 10 } },
            },
            kickstands: { stand: { id: 'stand', typeId: 'kickstand', modelId: 'model', rootId: 'stand-root', hostKnotId: 'stand-knot' } as Kickstand },
        };
        assert.deepEqual(Object.keys(getOwnedPrimitives('kickstand', 'roots', proposal)), ['stand-root']);
        assert.deepEqual(Object.keys(getOwnedPrimitives('kickstand', 'knots', proposal)), ['stand-knot']);
        assert.equal(getSnapshot(), live);
        assert.deepEqual(getOwnedPrimitives('kickstand', 'roots'), {});
    } finally { fixture.cleanup(); }
});


test('Cluster respects the active plate lock for Preview and a previously reviewed Apply', () => {
    const fixture = clusterPreviewFixture();
    try {
        const locked = { ...fixture.context, isPlateLocked: true };
        assert.equal(previewClusterOptimization(locked, options), 'locked');
        assert.equal(getClusterRenderSnapshot(), null);
        assert.equal(previewClusterOptimization(fixture.context, options), null);
        assert.equal(applyClusterOptimization(locked, options), false);
        assert.equal(getClusterPreview().status, 'stale');
        assert.equal(getUndoCount(), 0);
        assert.equal(previewClusterOptimization(fixture.context, options), null);
        assert.equal(applyClusterOptimization(fixture.context, options), true);
        assert.equal(getUndoCount(), 1);
    } finally { fixture.cleanup(); }
});
