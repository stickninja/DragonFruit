import assert from 'node:assert/strict';
import test from 'node:test';
import { getUndoCount } from '@/history/historyStore';
import { getModelIdForSupportEntityId, getSnapshot, setSnapshot } from '../../state';
import type { Brace } from '../../types';
import { setSelectedSupportIds } from '../../interaction/supportMultiSelection';
import { applyClusterOptimization, clusterSelectionError, getClusterPreview, previewClusterOptimization } from '../clusterPreview';
import { DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS } from '../clusterOptimization';
import { applyGridOptimization, gridSelectionError, getGridPreview, previewGridOptimization, type GridPreviewContext } from '../gridPreview';
import { DEFAULT_GRID_OPTIMIZATION_OPTIONS } from '../gridOptimization';
import { gridPreviewFixture } from './gridPreviewFixture';
import { addMarqueeDependents } from './optimizationSelectionFixture';

const tools = [
    { name: 'Cluster', selectionError: clusterSelectionError, getPreview: getClusterPreview,
        apply: (context: GridPreviewContext) => applyClusterOptimization(context, DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS),
        preview: (context: GridPreviewContext) => previewClusterOptimization(context, DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS) },
    { name: 'Grid', selectionError: gridSelectionError, getPreview: getGridPreview,
        apply: (context: GridPreviewContext) => applyGridOptimization(context, DEFAULT_GRID_OPTIMIZATION_OPTIONS),
        preview: (context: GridPreviewContext) => previewGridOptimization(context, DEFAULT_GRID_OPTIMIZATION_OPTIONS) },
];

for (const tool of tools) {
    test(`${tool.name} accepts the actual same-model marquee IDs without expanding trunk selection`, () => {
        const fixture = gridPreviewFixture();
        try {
            const ids = addMarqueeDependents();
            assert.deepEqual([...ids].sort(), ['a', 'b', 'brace', 'branch', 'root-a', 'root-b']);
            for (const id of ids) assert.equal(getModelIdForSupportEntityId(id), 'model', id);
            setSelectedSupportIds(ids);
            const before = getSnapshot();
            assert.equal(tool.selectionError(fixture.context), null);
            assert.equal(tool.preview(fixture.context), null);
            const result = tool.getPreview().result!;
            assert.equal(result.selectedTrunkCount, 2);
            assert.ok(result.skipped.every((skip) => skip.supportId === 'a' || skip.supportId === 'b'));
            assert.equal(result.contactCountBefore, 2, 'independently selected branches do not inflate trunk contact counts');
            assert.equal(result.contactCountAfter, result.contactCountBefore);
            assert.equal(getSnapshot(), before);
            assert.equal(getUndoCount(), 0);
            setSelectedSupportIds(ids.filter((id) => id !== 'root-a'));
            assert.equal(tool.getPreview().status, 'stale', 'removing only a root still invalidates the proposal');
            assert.equal(tool.apply(fixture.context), false);
            assert.equal(getSnapshot(), before);
            assert.equal(getUndoCount(), 0);
        } finally { fixture.cleanup(); }
    });

    test(`${tool.name} resolves selected primitives but rejects missing, unowned, foreign and wrong-plate selections`, () => {
        const fixture = gridPreviewFixture();
        try {
            addMarqueeDependents();
            for (const id of ['root-a', 'knot-a', 'seg-a', 'socket-a', 'braceSegment:brace', 'seg-branch', 'joint-branch']) {
                setSelectedSupportIds(['a', 'b', id]);
                assert.equal(tool.selectionError(fixture.context), null, id);
            }
            const before = getSnapshot();
            setSnapshot({ ...before,
                roots: { ...before.roots, foreign: { ...before.roots['root-a'], id: 'foreign', modelId: 'other-model' } },
                braces: { ...before.braces, unowned: { ...before.braces.brace, id: 'unowned', modelId: undefined } as unknown as Brace },
                knots: { ...before.knots, orphan: { id: 'orphan', parentShaftId: 'missing-shaft', pos: { x: 0, y: 0, z: 1 } } },
            });
            for (const id of ['missing', 'foreign', 'unowned', 'braceSegment:unowned', 'orphan']) {
                setSelectedSupportIds(['a', 'b', id]);
                assert.equal(tool.preview(fixture.context), 'model', id);
                assert.equal(tool.getPreview().proposal, null);
            }
            setSelectedSupportIds(['a', 'b', 'root-a']);
            assert.equal(tool.preview({ ...fixture.context, plateId: 'other-plate' }), 'plate');
            assert.equal(tool.preview({ ...fixture.context, isPlateLocked: true }), 'locked');
            setSelectedSupportIds(['root-a', 'root-b', 'brace', 'branch']);
            assert.equal(tool.preview(fixture.context), 'selection', 'primitives do not count as selected trunks');
            assert.equal(getUndoCount(), 0);
        } finally { fixture.cleanup(); }
    });
}
