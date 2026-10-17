import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeBVH } from '../../../utils/bvh';
import { buildTrunkDataFromPlacement } from '../../SupportTypes/Trunk/trunkBuilder';
import { resolveSegmentEndpoints } from '../../SupportPrimitives/Knot/segmentEndpoints';
import { getSnapshot, loadFromImportFormat, setSnapshot } from '../../state';
import { buildSupportExportFromStores } from '../../../features/scene/voxl/codec';
import { parseVoxlBinaryV2, serializeVoxlDocumentV2 } from '../../../features/scene/voxl/codec-v2';
import { testInput } from '../../../features/scene/voxl/__tests__/voxlTestSupport';
import { getUndoCount, undo, redo } from '@/history/historyStore';
import { registerSupportHistoryHandlers } from '../../history/useSupportHistoryHandlers';
import { setSelectedSupportIds } from '../../interaction/supportMultiSelection';
import { registerMeshForAutoBrace } from '../../autoBracing/meshGeometryStore';
import { previewClusterOptimization, applyClusterOptimization } from '../clusterPreview';
import { previewGridOptimization, applyGridOptimization, cancelGridPreview } from '../gridPreview';
import { clusterPreviewFixture } from './clusterPreviewFixture';
import type { Knot, SupportState } from '../../types';
import { sourceGraft } from '../optimizationGeometry';
import { buildClusterOptimization, DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS } from '../clusterOptimization';
import { buildGridOptimization, DEFAULT_GRID_OPTIMIZATION_OPTIONS } from '../gridOptimization';
import { boxMesh, scene } from './clusterFixture';

initializeBVH();

function builtScene(): SupportState {
    const state = scene([]);
    for (const [id, x] of [['a', 0.7], ['b', 4.7]] as const) {
        const built = buildTrunkDataFromPlacement({ modelId: 'model', tipPos: { x, y: 0, z: 33 },
            tipNormal: { x: 0, y: 0, z: -1 }, overrides: { rootsDiskHeightMm: 0.5, rootsConeHeightMm: 1.5,
                rootsDiameterMm: 3, shaftDiameterMm: 1.2, tipLengthMm: 3, tipBodyDiameterMm: 1.2, tipContactDiameterMm: 0.4 } },
        { basePos: { x, y: 0, z: 0 }, socketPos: { x, y: 0, z: 30 }, unsnappedBottomPos: { x, y: 0, z: 0 },
            snappedNodeKey: null, joints: [], constructionJoints: [] });
        built.root.id = `root-${id}`;
        built.trunk.id = id;
        built.trunk.rootId = built.root.id;
        state.roots[built.root.id] = built.root;
        state.trunks[id] = built.trunk;
    }
    return state;
}

function graft(state: SupportState) {
    const knots = new Map<string, Knot[]>();
    for (const knot of Object.values(state.knots)) knots.set(knot.parentShaftId, [...knots.get(knot.parentShaftId) ?? [], knot]);
    const result = sourceGraft(state, state.trunks.a, knots, new Set());
    assert.notEqual(typeof result, 'string');
    if (typeof result === 'string') throw new Error(result);
    return result;
}

const planners = {
    Cluster: (state: SupportState, mesh = boxMesh(100, 100, 2, 0, 0, 34)) => buildClusterOptimization(state, ['a', 'b'],
        DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, { modelId: 'model', mesh }),
    Grid: (state: SupportState, mesh = boxMesh(100, 100, 2, 0, 0, 34)) => buildGridOptimization(state, ['a', 'b'],
        DEFAULT_GRID_OPTIMIZATION_OPTIONS, { modelId: 'model', mesh, plateBounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 } }),
};

test('ordinary builder construction joint is bypassed while the root anchor and exact socket endpoint remain', () => {
    const input = builtScene();
    assert.equal(input.trunks.a.segments.length, 2);
    const result = graft(input);
    assert.equal(result.segmentIndex, 1);
    assert.deepEqual([...result.fullyRemovedSegmentIds], [input.trunks.a.segments[0].id]);
    assert.equal(result.sourceT, 1);
    assert.deepEqual(result.point, input.trunks.a.segments[1].topJoint!.pos);
    assert.equal(result.point.z, 30);
    assert.equal(result.endpoints.start.z, 2);
    assert.equal(result.fallbacks![0].point.z, 20.2);
});

for (const [tool, plan] of Object.entries(planners)) {
    test(`${tool} bypasses the builder's unused central joint without phantom collisions and round trips exact contacts`, async () => {
        const input = builtScene();
        const before = JSON.stringify(input);
        const result = plan(input);
        assert.ok(result.changedCount > 0);
        assert.equal(result.contactCountBefore, 2);
        assert.equal(result.contactCountAfter, 2);
        const output = result.snapshot.branches.a ?? result.snapshot.trunks.a;
        const terminal = input.trunks.a.segments[1];
        assert.equal(output.segments.length, tool === 'Cluster' ? 1 : 2);
        assert.equal(output.segments.at(-1)!.id, terminal.id);
        assert.equal(output.segments.at(-1)!.topJoint, terminal.topJoint);
        assert.equal(output.contactCone, input.trunks.a.contactCone);
        assert.equal(output.segments.some(segment => segment.id === input.trunks.a.segments[0].id), false);
        assert.deepEqual(plan(input).snapshot, result.snapshot);
        assert.equal(JSON.stringify(input), before);
        const original = getSnapshot();
        try {
            const binary = await serializeVoxlDocumentV2({ ...testInput(['model']), supports: buildSupportExportFromStores(result.snapshot) }, new Map());
            loadFromImportFormat(parseVoxlBinaryV2(binary).document.supports);
            const restored = getSnapshot().branches.a ?? getSnapshot().trunks.a;
            assert.deepEqual(restored.segments, output.segments);
            assert.deepEqual(restored.contactCone, output.contactCone);
        } finally { setSnapshot(original); }
    });

    test(`${tool} cuts in a constrained terminal span and remaps branch, leaf, manual and independent knots locally`, () => {
        const input = builtScene();
        const terminal = input.trunks.a.segments[1];
        for (const [index, kind] of ['branch', 'leaf', 'manual', 'free'].entries()) {
            const z = 26 + index * 0.5;
            input.knots[kind] = { id: kind, parentShaftId: terminal.id,
                pos: { x: 0.7, y: 0, z }, t: (z - 20.2) / 9.8, diameter: 1.3 };
        }
        input.branches.child = { id: 'child', modelId: 'model', typeId: 'branch', parentKnotId: 'branch', segments: [],
            contactCone: { ...input.trunks.a.contactCone!, id: 'child-cone', socketJointId: undefined, pos: { x: 0.7, y: 5, z: 33 } } };
        input.leaves.child = { id: 'leaf-child', modelId: 'model', typeId: 'leaf', parentKnotId: 'leaf',
            contactCone: { ...input.trunks.a.contactCone!, id: 'leaf-cone', socketJointId: undefined, pos: { x: 0.7, y: 6, z: 33 } } };
        input.knots.other = { id: 'other', parentShaftId: input.trunks.b.segments[1].id, pos: { x: 4.7, y: 0, z: 28 }, t: (28 - 20.2) / 9.8 };
        input.braces.manual = { id: 'manual', typeId: 'brace', modelId: 'model', startKnotId: 'manual', endKnotId: 'other', profile: { diameter: 0.6 } };
        const before = JSON.stringify(input);
        const chosen = graft(input);
        assert.equal(chosen.segmentIndex, 1);
        assert.ok(Math.abs(chosen.point.z - 24.3) < 1e-9);
        const result = plan(input);
        assert.ok(result.changedCount > 0);
        const support = result.snapshot.branches.a ?? result.snapshot.trunks.a;
        const index = support.segments.findIndex(segment => segment.id === terminal.id);
        const ends = resolveSegmentEndpoints(support, support.segments[index], index, {
            root: 'rootId' in support ? result.snapshot.roots[support.rootId as string] : undefined,
            hostKnot: 'parentKnotId' in support ? result.snapshot.knots[support.parentKnotId as string] : undefined,
        })!;
        assert.ok(Math.abs(ends.start.z - 24.3) < 1e-9);
        for (const kind of ['branch', 'leaf', 'manual', 'free']) {
            const knot = result.snapshot.knots[kind];
            assert.deepEqual(knot.pos, input.knots[kind].pos);
            assert.equal(knot.parentShaftId, terminal.id);
            assert.ok(Math.abs(ends.start.z + (ends.end.z - ends.start.z) * knot.t! - knot.pos.z) < 1e-9);
        }
        assert.equal(result.snapshot.branches.child, input.branches.child);
        assert.equal(result.snapshot.leaves.child, input.leaves.child);
        assert.equal(result.snapshot.braces.manual, input.braces.manual);
        assert.equal(support.contactCone, input.trunks.a.contactCone);
        assert.equal(JSON.stringify(input), before);
    });
}

test('prefix simplification stops at real bends, curves, dimensions, discontinuities, socket references and kickstands', () => {
    const changes: Array<(state: SupportState) => void> = [
        state => { state.trunks.a.segments[1].topJoint!.pos.x += 0.001; },
        state => { Object.assign(state.trunks.a.segments[1], { type: 'bezier' }); },
        state => { state.trunks.a.segments[1].diameter = 1.3; },
        state => { state.trunks.a.segments[1].diameter = 0; },
        state => { state.trunks.a.segments[1].topJoint!.diameter = 1.4; },
        state => { state.trunks.a.segments[1].bottomJoint = { ...state.trunks.a.segments[0].topJoint!, id: 'different' }; },
        state => { state.trunks.a.segments[1].bottomJoint = { ...state.trunks.a.segments[0].topJoint!, pos: { x: 0.7, y: 0, z: 21 } }; },
        state => { state.trunks.b.contactCone!.socketJointId = state.trunks.a.segments[0].topJoint!.id; },
        state => { state.kickstands.guard = { id: 'guard', typeId: 'kickstand', modelId: 'model', rootId: 'guard-root',
            hostKnotId: 'guard-knot', hostSegmentId: state.trunks.a.segments[1].id, hostMinT: 0.1, segments: [],
            profile: { bodyDiameterMm: 1.2, terminalStartDiameterMm: 1.2, terminalEndDiameterMm: 1.2 } }; },
    ];
    for (const change of changes) {
        const input = builtScene();
        change(input);
        assert.equal(graft(input).segmentIndex, 0);
    }
    const low = builtScene();
    const member = low.trunks.a.segments[1];
    low.knots.low = { id: 'low', parentShaftId: member.id, pos: { x: 0.7, y: 0, z: 21 }, diameter: 1.3 };
    const fallback = graft(low);
    assert.equal(fallback.segmentIndex, 0, 'a terminal cut below the old viable graft offers no benefit');
    assert.equal(fallback.fallbacks, undefined);
    const protectedFirst = builtScene();
    protectedFirst.knots.free = { id: 'free', parentShaftId: protectedFirst.trunks.a.segments[0].id, pos: { x: 0.7, y: 0, z: 15 } };
    assert.equal(graft(protectedFirst).segmentIndex, 0, 'a free knot is a real dependency on a consumed span');
});

test('both planners fall back to the original graft when only the higher route is blocked', () => {
    function split(xs: number[]) {
        const input = scene(xs);
        for (const source of Object.values(input.trunks)) {
            const first = source.segments[0];
            const socket = first.topJoint!;
            const mid = { ...socket, id: `mid-${source.id}`, pos: { ...socket.pos, z: 10 } };
            source.segments = [{ ...first, topJoint: mid }, { ...first, id: `upper-${source.id}`, bottomJoint: mid }];
        }
        return input;
    }
    const clusterInput = split([0, 4]);
    const clusterBefore = JSON.stringify(clusterInput);
    const cluster = buildClusterOptimization(clusterInput, ['a', 'b'], DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS,
        { modelId: 'model', mesh: boxMesh(), collisionMeshes: [boxMesh(0.5, 100, 4, 2, 0, 17)] });
    assert.equal(cluster.changedCount, 1);
    assert.equal(cluster.snapshot.branches.a.segments[0].topJoint!.pos.z, 10);
    assert.equal(cluster.snapshot.branches.a.segments[1], clusterInput.trunks.a.segments[1]);
    assert.equal(JSON.stringify(clusterInput), clusterBefore);
    const gridInput = split([1]);
    const gridBefore = JSON.stringify(gridInput);
    const grid = buildGridOptimization(gridInput, ['a'], { ...DEFAULT_GRID_OPTIMIZATION_OPTIONS, maxMoveMm: 1 },
        { modelId: 'model', mesh: boxMesh(), collisionMeshes: [boxMesh(0.2, 100, 2, 0, 0, 16)],
            plateBounds: { minX: -1.5, maxX: 1.5, minY: -1.5, maxY: 1.5 } });
    assert.equal(grid.changedCount, 1);
    assert.equal(grid.snapshot.trunks.a.segments[1].topJoint!.pos.z, 10);
    assert.equal(grid.snapshot.trunks.a.segments[2], gridInput.trunks.a.segments[1]);
    assert.equal(JSON.stringify(gridInput), gridBefore);
});

function exportedGraph(): string {
    const exported = buildSupportExportFromStores(getSnapshot());
    return JSON.stringify({ ...exported, meta: undefined });
}

test('builder-prefix preview Apply and one-step Undo/Redo preserve the complete graph for both tools', () => {
    for (const tool of ['Cluster', 'Grid']) {
        const fixture = clusterPreviewFixture();
        const dispose = registerSupportHistoryHandlers();
        try {
            fixture.transform.elements[14] = 34;
            registerMeshForAutoBrace('model', fixture.geometry, fixture.transform);
            setSnapshot(builtScene());
            setSelectedSupportIds(['a', 'b']);
            const before = exportedGraph();
            if (tool === 'Cluster') {
                assert.equal(previewClusterOptimization(fixture.context, DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS), null);
                assert.equal(applyClusterOptimization(fixture.context, DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS), true);
            } else {
                const context = { ...fixture.context, plateBounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 } };
                assert.equal(previewGridOptimization(context, DEFAULT_GRID_OPTIMIZATION_OPTIONS), null);
                assert.equal(applyGridOptimization(context, DEFAULT_GRID_OPTIMIZATION_OPTIONS), true);
            }
            const after = exportedGraph();
            assert.notEqual(after, before);
            assert.equal(getUndoCount(), 1);
            const output = getSnapshot().branches.a ?? getSnapshot().trunks.a;
            assert.equal(output.segments.length, tool === 'Cluster' ? 1 : 2);
            undo();
            assert.equal(exportedGraph(), before);
            redo();
            assert.equal(exportedGraph(), after);
        } finally { cancelGridPreview(); dispose(); fixture.cleanup(); }
    }
});
