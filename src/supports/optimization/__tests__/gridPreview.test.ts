import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { getSnapshot, setSnapshot, setHoveredState } from '../../state';
import { setSelectedSupportIds } from '../../interaction/supportMultiSelection';
import { registerMeshForAutoBrace } from '../../autoBracing/meshGeometryStore';
import { registerSupportHistoryHandlers } from '../../history/useSupportHistoryHandlers';
import { getUndoCount, getRedoCount, undo, redo, clearHistory } from '@/history/historyStore';
import { DEFAULT_GRID_OPTIMIZATION_OPTIONS as options } from '../gridOptimization';
import { applyGridOptimization, cancelGridPreview, getGridPreview, getGridRenderSnapshot, previewGridOptimization } from '../gridPreview';
import { getOptimizationRenderSnapshot } from '../optimizationPreview';
import { DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS as clusterOptions } from '../clusterOptimization';
import { getClusterPreview, previewClusterOptimization } from '../clusterPreview';
import { gridPreviewFixture } from './gridPreviewFixture';

test('Grid previews a real shift without live edits; shared rendering and Cancel restore original geometry', () => {
    const f = gridPreviewFixture();
    try {
        const before = getSnapshot();
        assert.equal(previewGridOptimization(f.context, options), null);
        const proposal = getGridRenderSnapshot()!;
        assert.equal(getSnapshot(), before);
        assert.notEqual(proposal.roots['root-a'].transform.pos.x, before.roots['root-a'].transform.pos.x);
        assert.equal(proposal.trunks.a.contactCone, before.trunks.a.contactCone);
        assert.equal(Object.keys(proposal.trunks).length, 2);
        assert.equal(getGridPreview().result!.changedCount, 1);
        assert.equal(getGridPreview().result!.alignedTrunkCount, 2);
        assert.equal(getOptimizationRenderSnapshot(), proposal);
        assert.equal(getUndoCount(), 0);
        setHoveredState('model', 'model');
        assert.equal(getOptimizationRenderSnapshot(), proposal);
        cancelGridPreview();
        assert.equal(getOptimizationRenderSnapshot(), null);
        assert.equal(getSnapshot().roots, before.roots);
    } finally { f.cleanup(); }
});

test('Grid Apply is one typed undo/redo operation and preserves complete contacts', () => {
    const f = gridPreviewFixture();
    const dispose = registerSupportHistoryHandlers();
    try {
        const before = structuredClone(getSnapshot());
        previewGridOptimization(f.context, options);
        const proposed = structuredClone(getGridRenderSnapshot());
        assert.equal(applyGridOptimization(f.context, options), true);
        assert.equal(getUndoCount(), 1);
        assert.equal(getGridPreview().status, 'applied');
        assert.deepEqual(getSnapshot().trunks.a.contactCone, before.trunks.a.contactCone);
        assert.equal(applyGridOptimization(f.context, options), false);
        undo();
        assert.equal(getGridPreview().result, null);
        assert.deepEqual(getSnapshot().roots, before.roots);
        assert.deepEqual(getSnapshot().trunks, before.trunks);
        assert.equal(getRedoCount(), 1);
        redo();
        assert.deepEqual(getSnapshot().roots, proposed!.roots);
        assert.deepEqual(getSnapshot().trunks, proposed!.trunks);
        assert.equal(getUndoCount(), 1);
    } finally { dispose(); f.cleanup(); }
});

test('Grid and Cluster previews are mutually exclusive and each can replace the other', () => {
    const f = gridPreviewFixture();
    try {
        previewClusterOptimization(f.context, clusterOptions);
        assert.equal(getClusterPreview().status, 'ready');
        previewGridOptimization(f.context, options);
        assert.equal(getClusterPreview().status, 'idle');
        assert.equal(getGridPreview().status, 'ready');
        previewClusterOptimization(f.context, clusterOptions);
        assert.equal(getGridPreview().status, 'idle');
        assert.equal(getClusterPreview().status, 'ready');
        assert.equal(getUndoCount(), 0);
    } finally { f.cleanup(); }
});

test('Grid rejects stale options, bounds, settings, model, plate and locks before Apply', () => {
    const f = gridPreviewFixture();
    try {
        const contexts = [
            { ...f.context, modelId: 'other' }, { ...f.context, plateId: 'other' },
            { ...f.context, modelPlateId: 'other' }, { ...f.context, plateModelIds: ['model', 'other'] },
            { ...f.context, plateBounds: { ...f.context.plateBounds!, maxX: 30 } },
            { ...f.context, autoBracingSettings: { ...f.context.autoBracingSettings, braceDiameterMm: f.context.autoBracingSettings.braceDiameterMm + 0.1 } },
            { ...f.context, gridSettings: { ...f.context.gridSettings, spacingMm: 3 } },
            { ...f.context, isPlateLocked: true },
        ];
        for (const context of contexts) {
            assert.equal(previewGridOptimization(f.context, options), null);
            assert.equal(applyGridOptimization(context, options), false);
            assert.equal(getGridPreview().status, 'stale');
        }
        previewGridOptimization(f.context, options);
        assert.equal(applyGridOptimization(f.context, { ...options, spacingMm: 3 }), false);
        assert.equal(getGridPreview().status, 'stale');
        assert.equal(getSnapshot(), f.original);
        assert.equal(getUndoCount(), 0);
        assert.equal(previewGridOptimization({ ...f.context, isPlateLocked: true }, options), 'locked');
        assert.equal(previewGridOptimization({ ...f.context, plateBounds: null }, options), 'plate');
    } finally { f.cleanup(); }
});

test('Grid allows one selected trunk and immediately invalidates graph, selection and either mesh changes', () => {
    const f = gridPreviewFixture();
    const neighbor = new THREE.BoxGeometry(1, 1, 1);
    try {
        setSelectedSupportIds(['a']);
        assert.equal(previewGridOptimization(f.context, options), null);
        assert.equal(getGridPreview().result!.selectedTrunkCount, 1);
        setSelectedSupportIds([]);
        assert.equal(getGridPreview().status, 'stale');
        assert.equal(previewGridOptimization(f.context, options), 'selection');
        setSelectedSupportIds(['a', 'b']);
        previewGridOptimization(f.context, options);
        setSnapshot({ ...getSnapshot(), roots: { ...getSnapshot().roots } });
        assert.equal(getGridPreview().status, 'stale');
        previewGridOptimization(f.context, options);
        registerMeshForAutoBrace('model', f.geometry, new THREE.Matrix4().makeTranslation(0, 0, 25));
        assert.equal(getGridPreview().status, 'stale');
        previewGridOptimization({ ...f.context, plateModelIds: ['model', 'neighbour'] }, options);
        registerMeshForAutoBrace('neighbour', neighbor, new THREE.Matrix4());
        assert.equal(getGridPreview().status, 'stale');
        assert.equal(getGridRenderSnapshot(), null);
        assert.equal(getUndoCount(), 0);
    } finally { neighbor.dispose(); f.cleanup(); }
});

test('Grid no-op never applies and completed feedback clears on subsequent selection, graph or history changes', () => {
    const f = gridPreviewFixture();
    try {
        assert.equal(previewGridOptimization(f.context, { ...options, maxMoveMm: 0 }), null);
        assert.equal(applyGridOptimization(f.context, { ...options, maxMoveMm: 0 }), false);
        assert.equal(getUndoCount(), 0);
        const apply = () => {
            setSnapshot(f.original); setSelectedSupportIds(['a', 'b']);
            previewGridOptimization(f.context, options);
            assert.equal(applyGridOptimization({ ...f.context, gridSettings: { ...f.context.gridSettings } }, options), true);
        };
        apply(); setHoveredState('model', 'model'); assert.equal(getGridPreview().status, 'applied');
        setSelectedSupportIds(['a']); assert.equal(getGridPreview().result, null);
        apply(); setSnapshot({ ...getSnapshot(), roots: { ...getSnapshot().roots } }); assert.equal(getGridPreview().result, null);
        apply(); clearHistory(); assert.equal(getGridPreview().result, null);
    } finally { f.cleanup(); }
});
