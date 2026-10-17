import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeBVH } from '../../../utils/bvh';
import { createDefaultAutoBracingSettings } from '../../autoBracing/settings';
import { registerMeshForAutoBrace, unregisterMeshForAutoBrace } from '../../autoBracing/meshGeometryStore';
import { resolveSegmentEndpoints } from '../../SupportPrimitives/Knot/segmentEndpoints';
import { getFinalSocketPosition } from '../../SupportPrimitives/ContactCone/contactConeUtils';
import { segmentDistanceSq } from '../../PlacementLogic/segmentDistance';
import { getSnapshot, loadFromImportFormat, setSnapshot } from '../../state';
import { buildSupportExportFromStores } from '../../../features/scene/voxl/codec';
import { parseVoxlBinaryV2, serializeVoxlDocumentV2 } from '../../../features/scene/voxl/codec-v2';
import { testInput } from '../../../features/scene/voxl/__tests__/voxlTestSupport';
import type { SupportState } from '../../types';
import { scene, boxMesh } from './clusterFixture';
import { buildClusterOptimization, DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS } from '../clusterOptimization';
import {
    buildGridOptimization, DEFAULT_GRID_OPTIMIZATION_OPTIONS, GRID_MAX_CANDIDATE_CHECKS,
    type GridOptimizationContext, type GridOptimizationOptions,
} from '../gridOptimization';

initializeBVH();

const bounds = { minX: -50, maxX: 50, minY: -50, maxY: 50 };
const options = { ...DEFAULT_GRID_OPTIMIZATION_OPTIONS, spacingMm: 4, maxMoveMm: 4 };
const plan = (snapshot: SupportState, selectedIds = Object.keys(snapshot.trunks), changes: Partial<GridOptimizationOptions> = {}, context: Partial<GridOptimizationContext> = {}) =>
    buildGridOptimization(snapshot, selectedIds, { ...options, ...changes }, { modelId: 'model', mesh: boxMesh(), plateBounds: bounds, ...context });

function dependentScene(): SupportState {
    const input = scene([1, 7]);
    input.knots.ka = { id: 'ka', parentShaftId: 'seg-a', t: 0.5, pos: { x: 1, y: 0, z: 11 }, diameter: 1.3 };
    input.knots.kb = { id: 'kb', parentShaftId: 'seg-b', t: 0.8, pos: { x: 7, y: 0, z: 16.4 }, diameter: 1.3 };
    input.braces.manual = { id: 'manual', typeId: 'brace', modelId: 'model', startKnotId: 'ka', endKnotId: 'kb', profile: { diameter: 0.6 } };
    input.branches.child = { id: 'child', typeId: 'branch', modelId: 'model', parentKnotId: 'ka',
        segments: [{ id: 'child-shaft', diameter: 1.2, topJoint: { id: 'child-top', diameter: 1.3, pos: { x: 1, y: 4, z: 16 } } }],
        contactCone: { ...input.trunks.a.contactCone!, id: 'child-cone', pos: { x: 1, y: 4, z: 19 }, socketJointId: 'child-top' } };
    input.leaves.leaf = { id: 'leaf', typeId: 'leaf', modelId: 'model', parentKnotId: 'ka',
        contactCone: { ...input.trunks.a.contactCone!, id: 'leaf-cone', socketJointId: undefined,
            pos: { x: 1, y: 3, z: 14 }, normal: { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 },
            surfaceNormal: { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 },
            profile: { ...input.trunks.a.contactCone!.profile, lengthMm: Math.sqrt(18) } } };
    delete input.leaves.leaf.contactCone.socketJointId;
    return input;
}

function assertKnotsAttached(snapshot: SupportState): void {
    for (const knot of Object.values(snapshot.knots)) {
        const support = [...Object.values(snapshot.trunks), ...Object.values(snapshot.branches)]
            .find(item => item.segments.some(segment => segment.id === knot.parentShaftId));
        assert.ok(support, `knot ${knot.id} retains its host`);
        const index = support.segments.findIndex(segment => segment.id === knot.parentShaftId);
        const root = 'rootId' in support ? snapshot.roots[support.rootId] : undefined;
        const hostKnot = 'parentKnotId' in support ? snapshot.knots[support.parentKnotId] : undefined;
        const ends = resolveSegmentEndpoints(support, support.segments[index], index, { root, hostKnot })!;
        if (knot.t !== undefined) assert.ok(Math.hypot(
            ends.start.x + (ends.end.x - ends.start.x) * knot.t - knot.pos.x,
            ends.start.y + (ends.end.y - ends.start.y) * knot.t - knot.pos.y,
            ends.start.z + (ends.end.z - ends.start.z) * knot.t - knot.pos.z,
        ) < 1e-6, `knot ${knot.id} remains on its shaft`);
    }
}

test('aligns selected off-grid roots with vertical lower legs and preserves exact cones, IDs and input', () => {
    const input = scene([1, 7, 20]);
    const before = JSON.stringify(input);
    const result = plan(input, ['a', 'b']);
    assert.equal(result.changedCount, 2);
    assert.equal(result.alignedTrunkCount, 2);
    assert.equal(result.selectedTrunkCount, 2);
    assert.equal(result.contactCountBefore, 2);
    assert.equal(result.contactCountAfter, 2);
    assert.equal(Object.keys(result.snapshot.trunks).length, 3);
    assert.equal(JSON.stringify(input), before);
    assert.equal(result.snapshot.trunks.c, input.trunks.c);
    assert.equal(result.snapshot.roots['root-c'], input.roots['root-c']);
    for (const [id, x] of [['a', 0], ['b', 8]] as const) {
        const trunk = result.snapshot.trunks[id];
        const root = result.snapshot.roots[trunk.rootId];
        assert.equal(root.transform.pos.x, x);
        assert.equal(root.transform.pos.y, 0);
        assert.equal(root.transform.pos.z, input.roots[trunk.rootId].transform.pos.z);
        assert.equal(trunk.contactCone, input.trunks[id].contactCone);
        assert.deepEqual(getFinalSocketPosition(trunk.contactCone!), input.trunks[id].segments[0].topJoint!.pos);
        assert.equal(trunk.segments.length, input.trunks[id].segments.length + 1, 'only the necessary vertical leg is added');
        assert.equal(trunk.segments[1].id, input.trunks[id].segments[0].id);
        assert.equal(trunk.segments[1].topJoint, input.trunks[id].segments[0].topJoint);
        const leg = resolveSegmentEndpoints(trunk, trunk.segments[0], 0, { root })!;
        assert.equal(leg.start.x, leg.end.x);
        assert.equal(leg.start.y, leg.end.y);
        assert.ok(leg.end.z > leg.start.z);
    }
    assert.deepEqual(plan(input, ['a', 'b']).snapshot, result.snapshot, 'stable IDs and geometry');
});

test('a reused Grid first span starts at its new knee and preserves later joints, cone and binary serialization', async () => {
    const input = scene([1]);
    const first = input.trunks.a.segments[0];
    first.bottomJoint = { id: 'old-base', diameter: 1.3, pos: { x: 1, y: 0, z: 2 } };
    const upper = { id: 'upper-a', diameter: 1.2, bottomJoint: first.topJoint,
        topJoint: { id: 'upper-socket', diameter: 1.3, pos: { x: 2, y: 0, z: 24 } } };
    input.trunks.a.segments.push(upper);
    input.trunks.a.contactCone = { ...input.trunks.a.contactCone!, pos: { x: 2, y: 0, z: 27 }, socketJointId: upper.topJoint.id };
    const before = JSON.stringify(input);
    const proposal = plan(input, ['a'], {}, { mesh: boxMesh(100, 100, 2, 0, 0, 28) });
    assert.equal(proposal.changedCount, 1);
    const trunk = proposal.snapshot.trunks.a;
    assert.equal(trunk.segments.length, 3);
    assert.equal(trunk.segments[1].id, first.id);
    assert.equal(trunk.segments[1].diameter, first.diameter);
    assert.equal(trunk.segments[1].topJoint, first.topJoint);
    assert.equal(trunk.segments[1].bottomJoint, trunk.segments[0].topJoint);
    assert.notEqual(trunk.segments[1].bottomJoint, first.bottomJoint);
    assert.equal(trunk.segments[2], upper);
    assert.equal(trunk.contactCone, input.trunks.a.contactCone);
    assert.equal(trunk.contactCone!.socketJointId, upper.topJoint.id);
    assert.equal(JSON.stringify(input), before);
    const original = getSnapshot();
    try {
        const binary = await serializeVoxlDocumentV2({ ...testInput(['model']), supports: buildSupportExportFromStores(proposal.snapshot) }, new Map());
        loadFromImportFormat(parseVoxlBinaryV2(binary).document.supports);
        assert.deepEqual(getSnapshot().trunks.a.segments, trunk.segments);
        assert.deepEqual(getSnapshot().trunks.a.contactCone, trunk.contactCone);
    } finally { setSnapshot(original); }
});

test('a free first-span knot retains its shaft and world position instead of being discarded for Grid alignment', () => {
    const input = scene([1]);
    input.knots.free = { id: 'free', parentShaftId: 'seg-a', t: 1 / 3, pos: { x: 1, y: 0, z: 8 }, diameter: 1.3 };
    const before = JSON.stringify(input);
    const proposal = plan(input);
    assert.equal(proposal.changedCount, 1);
    assert.equal(proposal.snapshot.trunks.a.segments.length, 3);
    assert.equal(proposal.snapshot.trunks.a.segments[2].id, 'seg-a');
    assert.deepEqual(proposal.snapshot.knots.free.pos, input.knots.free.pos);
    assert.equal(proposal.snapshot.knots.free.parentShaftId, 'seg-a');
    assertKnotsAttached(proposal.snapshot);
    assert.equal(JSON.stringify(input), before);
});

test('Grid endpoint reuse still checks the contact cone below its socket and retained upper bends', () => {
    const input = scene([1]);
    const cone = input.trunks.a.contactCone!;
    const length = Math.hypot(1, 1.5);
    input.trunks.a.contactCone = { ...cone, pos: { x: 0, y: 0, z: 18.5 },
        normal: { x: 1 / length, y: 0, z: 1.5 / length }, profile: { ...cone.profile, lengthMm: length } };
    const blocked = plan(input, ['a'], { maxMoveMm: 1 });
    assert.equal(blocked.changedCount, 0);
    assert.equal(blocked.snapshot, input);
    assert.equal(blocked.skipped[0].reason, 'collision');
    const bend = scene([1]);
    const socket = bend.trunks.a.segments[0].topJoint!;
    bend.trunks.a.segments.push({ id: 'retained-bend', diameter: 1.2, type: 'bezier',
        bottomJoint: socket, topJoint: { ...socket, id: 'bend-top' },
        controlPoint1: { x: -2, y: 0, z: 15 }, controlPoint2: { x: -2, y: 0, z: 15 },
        startTangent: { x: -1, y: 0, z: -1 }, endTangent: { x: 1, y: 0, z: 1 }, tension: 1, bias: 0.5, resolution: 32 });
    const bendBlocked = plan(bend, ['a'], { maxMoveMm: 1 });
    assert.equal(bendBlocked.changedCount, 0);
    assert.equal(bendBlocked.snapshot, bend);
    assert.equal(bendBlocked.skipped[0].reason, 'collision');
});

test('changed-spacing Grid then Cluster retains the earlier upper route without adding redundant graft joints', () => {
    const input = scene([0.7, 4.7]);
    const first = plan(input, ['a', 'b'], { spacingMm: 2, maxMoveMm: 2 });
    assert.equal(first.changedCount, 2);
    const second = plan(first.snapshot, ['a', 'b'], { spacingMm: 3, maxMoveMm: 2 });
    assert.equal(second.changedCount, 1);
    const result = buildClusterOptimization(second.snapshot, ['a', 'b'], DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, { modelId: 'model', mesh: boxMesh() });
    assert.equal(result.changedCount, 1);
    for (const branch of Object.values(result.snapshot.branches)) {
        const prior = second.snapshot.trunks[branch.id];
        assert.equal(branch.segments.length, prior.segments.length);
        assert.equal(branch.segments[0].id, prior.segments[0].id);
        assert.equal(branch.segments[0].topJoint, prior.segments[0].topJoint);
        for (let index = 1; index < prior.segments.length; index++) assert.equal(branch.segments[index], prior.segments[index]);
        assert.equal(branch.contactCone, input.trunks[branch.id].contactCone);
    }
    assert.deepEqual(plan(first.snapshot, ['a', 'b'], { spacingMm: 3, maxMoveMm: 2 }), second);
});

test('tiny positive and negative snaps keep distinct knee and graft joint volumes clear', () => {
    for (const x of [0.1, -0.1, 0.7, -0.7]) {
        const input = scene([x]);
        const result = plan(input);
        assert.equal(result.changedCount, 1);
        assert.equal(result.snapshot.roots['root-a'].transform.pos.x, 0);
        const segments = result.snapshot.trunks.a.segments;
        const knee = segments[0].topJoint!;
        const graft = segments[1].topJoint!;
        assert.ok(Math.hypot(knee.pos.x - graft.pos.x, knee.pos.y - graft.pos.y, knee.pos.z - graft.pos.z) > knee.diameter);
    }
});

test('retains branch, leaf and manual brace world geometry while remapping retained shaft knots', () => {
    const input = dependentScene();
    const result = plan(input);
    assert.equal(result.changedCount, 2);
    for (const key of ['ka', 'kb']) assert.deepEqual(result.snapshot.knots[key].pos, input.knots[key].pos);
    assert.equal(result.snapshot.branches.child, input.branches.child);
    assert.equal(result.snapshot.leaves.leaf, input.leaves.leaf);
    assert.equal(result.snapshot.braces.manual, input.braces.manual);
    assertKnotsAttached(result.snapshot);
});

test('low manual attachments, shared roots and kickstand hosts are protected', () => {
    const input = dependentScene();
    input.knots.ka.pos.z = 2.5;
    input.knots.ka.t = 0.5 / 18;
    const result = plan(input, ['a']);
    assert.equal(result.snapshot, input);
    assert.equal(result.skipped[0].reason, 'dependent-geometry');
    const shared = scene([1, 7]);
    shared.trunks.b.rootId = shared.trunks.a.rootId;
    assert.equal(plan(shared).changedCount, 0);
    const stand = scene([1]);
    stand.kickstands.ks = { id: 'ks', typeId: 'kickstand', modelId: 'model', rootId: 'ks-root', hostKnotId: 'ks-knot', hostSegmentId: 'seg-a', hostMinT: 0.1,
        segments: [], profile: { bodyDiameterMm: 1.2, terminalStartDiameterMm: 1.2, terminalEndDiameterMm: 1.2 } };
    const protectedStand = plan(stand);
    assert.equal(protectedStand.changedCount, 0);
    assert.equal(protectedStand.snapshot, stand);
});

test('occupied nodes retain their existing owner and alternate nodes are tried within the movement limit', () => {
    const input = scene([1, 0]);
    input.trunks.b.segments[0].topJoint!.pos.x = -8;
    input.trunks.b.contactCone!.pos.x = -8;
    const blocked = plan(input, ['a'], { maxMoveMm: 1 });
    assert.equal(blocked.snapshot, input);
    assert.equal(blocked.skipped[0].reason, 'occupied-node');
    const alternate = plan(input, ['a']);
    assert.equal(alternate.changedCount, 1);
    assert.equal(alternate.snapshot.roots['root-a'].transform.pos.x, 4);
    assert.equal(alternate.snapshot.trunks.b, input.trunks.b);
    assert.equal(alternate.snapshot.roots['root-b'], input.roots['root-b']);
    assert.equal(Object.keys(alternate.snapshot.roots).length, 2);
    assert.equal(Object.keys(alternate.snapshot.trunks).length, 2);
});

test('contact ownership blocks a node even when the owner root stands elsewhere', () => {
    const input = scene([1, 20]);
    input.trunks.b.contactCone!.pos.x = 0;
    const result = plan(input, ['a'], { maxMoveMm: 1 });
    assert.equal(result.changedCount, 0);
    assert.equal(result.skipped[0].reason, 'occupied-node');
    assert.equal(result.snapshot, input);
});

test('two selected roots competing for the same node never overlap or lose contacts', () => {
    const input = scene([1, -1]);
    const result = plan(input, ['a', 'b'], { maxMoveMm: 1 });
    assert.equal(result.changedCount, 0);
    assert.equal(result.snapshot, input);
    assert.equal(result.contactCountAfter, 2);
});

test('full shaft diameters, broad roots and unrelated manual braces block crossing layouts', () => {
    const input = scene([1, 4]);
    input.trunks.b.segments[0].diameter = 8;
    const thick = plan(input, ['a'], { maxMoveMm: 1 });
    assert.equal(thick.changedCount, 0);
    assert.equal(thick.skipped[0].reason, 'collision');
    input.trunks.b.segments[0].diameter = 1.2;
    input.roots['root-b'].diameter = 8;
    assert.equal(plan(input, ['a'], { maxMoveMm: 1 }).skipped[0].reason, 'collision');
    const manual = scene([1, -8, 8]);
    manual.knots.left = { id: 'left', parentShaftId: 'seg-b', pos: { x: -8, y: 0, z: 10 } };
    manual.knots.right = { id: 'right', parentShaftId: 'seg-c', pos: { x: 8, y: 0, z: 10 } };
    manual.braces.wall = { id: 'wall', typeId: 'brace', modelId: 'model', startKnotId: 'left', endKnotId: 'right', profile: { diameter: 0.6 } };
    const blocked = plan(manual, ['a'], { maxMoveMm: 1 });
    assert.equal(blocked.changedCount, 0);
    assert.equal(blocked.skipped[0].reason, 'collision');
});

test('always collision-checks own mesh and neighboring plate meshes', () => {
    const input = scene([1]);
    const wall = boxMesh(0.5, 20, 30, 0, 0, 10);
    for (const collisionMeshes of [[], [boxMesh()]]) {
        const own = plan(input, ['a'], { maxMoveMm: 1 }, { mesh: wall, collisionMeshes });
        assert.equal(own.changedCount, 0);
        assert.equal(own.skipped[0].reason, 'collision');
    }
    const neighbor = plan(input, ['a'], { maxMoveMm: 1 }, { collisionMeshes: [wall] });
    assert.equal(neighbor.changedCount, 0);
    assert.equal(neighbor.skipped[0].reason, 'collision');
});

test('max movement, vertical-angle room and full root plate bounds can refuse a layout', () => {
    const input = scene([1]);
    const movement = plan(input, ['a'], { maxMoveMm: 0.5 });
    assert.equal(movement.changedCount, 0);
    assert.equal(movement.skipped[0].reason, 'movement-limit');
    const angle = plan(input, ['a'], { maxMoveMm: 1, maxJoinAngleDeg: 5 });
    assert.equal(angle.changedCount, 1, 'sufficient height permits a tight diagonal');
    input.trunks.a.segments[0].topJoint!.pos.z = 5;
    const low = plan(input, ['a'], { maxMoveMm: 1, maxJoinAngleDeg: 10 });
    assert.equal(low.changedCount, 0);
    assert.equal(low.skipped[0].reason, 'angle-limit');
    const edge = plan(scene([1]), ['a'], { maxMoveMm: 1 }, { plateBounds: { minX: -1, maxX: 50, minY: -50, maxY: 50 } });
    assert.equal(edge.changedCount, 0);
    assert.equal(edge.skipped[0].reason, 'out-of-bounds');
});

test('no-op and repeated alignment preserve exact snapshots and bracing', () => {
    const aligned = scene([0, 8]);
    const same = plan(aligned);
    assert.equal(same.snapshot, aligned);
    assert.equal(same.changedCount, 0);
    assert.equal(same.alignedTrunkCount, 2);
    const first = plan(scene([1, 7]));
    const second = plan(first.snapshot);
    assert.equal(second.changedCount, 0);
    assert.equal(second.snapshot, first.snapshot);
    assert.equal(second.alignedTrunkCount, 2);
    assert.equal(plan(scene([1]), []).changedCount, 0);
});

test('malformed and legacy first spans are conservatively skipped', () => {
    const noSegments = scene([1]);
    noSegments.trunks.a.segments = [];
    const noRoot = scene([1]);
    delete noRoot.roots['root-a'];
    const detached = scene([1]);
    detached.trunks.a.segments[0].bottomJoint = { id: 'detached', diameter: 1.3, pos: { x: 3, y: 0, z: 2 } };
    const rotated = scene([1]);
    rotated.roots['root-a'].transform.rot.x = 0.5;
    const invalidDiameter = scene([1]);
    invalidDiameter.trunks.a.segments[0].diameter = Infinity;
    const curved = scene([1]);
    curved.trunks.a.segments[0] = { ...curved.trunks.a.segments[0], type: 'bezier',
        controlPoint1: { x: 2, y: 0, z: 8 }, controlPoint2: { x: 2, y: 0, z: 16 },
        startTangent: { x: 0, y: 0, z: 1 }, endTangent: { x: 0, y: 0, z: 1 }, tension: 1, bias: 0.5, resolution: 16 };
    for (const input of [noSegments, noRoot, detached, rotated, invalidDiameter, curved]) {
        const result = plan(input);
        assert.equal(result.changedCount, 0);
        assert.equal(result.snapshot, input);
    }
    const legacy = scene([1]);
    legacy.knots.bad = { id: 'bad', parentShaftId: 'seg-a', pos: { x: 3, y: 0, z: 11 } };
    assert.equal(plan(legacy).skipped[0].reason, 'dependent-geometry');
});

test('mixed-model and other-plate selections never modify the excluded graph', () => {
    const input = scene([1, 20]);
    input.trunks.b.modelId = 'other';
    input.roots['root-b'].modelId = 'other';
    const result = plan(input);
    assert.equal(result.changedCount, 1);
    assert.equal(result.snapshot.trunks.b, input.trunks.b);
    assert.equal(result.snapshot.roots['root-b'], input.roots['root-b']);
    assert.ok(result.skipped.some(skip => skip.supportId === 'b' && skip.reason === 'wrong-model-or-plate'));
    const wrongPlate = plan(scene([1]), ['a'], {}, { plateId: 'p1', modelPlateId: 'p2' });
    assert.equal(wrongPlate.changedCount, 0);
    assert.equal(wrongPlate.skipped[0].reason, 'wrong-model-or-plate');
});

test('internal automatic braces regenerate only around changed selected parents', () => {
    const input = scene([1, 7, 20, 28]);
    for (const trunk of Object.values(input.trunks)) input.knots[`k-${trunk.id}`] = {
        id: `k-${trunk.id}`, parentShaftId: trunk.segments[0].id,
        pos: { x: input.roots[trunk.rootId].transform.pos.x, y: 0, z: 2.5 },
    };
    for (const [id, start, end] of [['moving', 'a', 'b'], ['stationary', 'c', 'd']] as const) input.braces[id] = {
        id, typeId: 'brace', generatedBy: 'autoBracing', modelId: 'model', startKnotId: `k-${start}`, endKnotId: `k-${end}`, profile: { diameter: 0.6 },
    };
    assert.equal(plan(input).changedCount, 0, 'low attachments are protected without regeneration');
    const mesh = boxMesh();
    registerMeshForAutoBrace('model', mesh.geometry, mesh.matrixWorld);
    try {
        const result = plan(input, ['a', 'b', 'c', 'd'], {}, {
            mesh, autoBracingSettings: createDefaultAutoBracingSettings(),
            gridSettings: { enabled: false, spacingMm: 4, minBranchAngleDeg: 45, attachSearchStepMm: 1, minRoutedTrunkAngleDeg: 45 },
        });
        assert.equal(result.changedCount, 2);
        assert.equal(result.removedAutoBraceCount, 1);
        assert.equal(result.generatedAutoBraceCount, 4, 'both members of each existing Crosses pattern are retained');
        assert.equal(result.snapshot.braces.stationary, input.braces.stationary);
        assert.equal(result.snapshot.knots['k-c'], input.knots['k-c']);
        assert.equal(result.snapshot.knots['k-d'], input.knots['k-d']);
        assertKnotsAttached(result.snapshot);
        for (const brace of Object.values(result.snapshot.braces)) {
            assert.ok(result.snapshot.knots[brace.startKnotId]);
            assert.ok(result.snapshot.knots[brace.endKnotId]);
        }
    } finally {
        unregisterMeshForAutoBrace('model');
    }
});

test('automatic braces outside the selected graph and their knots remain exact', () => {
    const input = scene([1, 8]);
    input.knots.a = { id: 'a', parentShaftId: 'seg-a', pos: { x: 1, y: 0, z: 11 } };
    input.knots.b = { id: 'b', parentShaftId: 'seg-b', pos: { x: 8, y: 0, z: 11 } };
    input.braces.outside = { id: 'outside', generatedBy: 'autoBracing', modelId: 'model', startKnotId: 'a', endKnotId: 'b', profile: { diameter: 0.6 } };
    const result = plan(input, ['a'], {}, { autoBracingSettings: createDefaultAutoBracingSettings() });
    assert.equal(result.changedCount, 1);
    assert.equal(result.removedAutoBraceCount, 0);
    assert.equal(result.generatedAutoBraceCount, 0);
    assert.equal(result.snapshot.braces.outside, input.braces.outside);
    assert.equal(result.snapshot.knots.b, input.knots.b);
    assertKnotsAttached(result.snapshot);
});

test('stationary internal automatic braces remain obstacles during another selected root move', () => {
    const input = scene([1, 0, 0]);
    for (const [id, y] of [['b', -8], ['c', 8]] as const) {
        input.roots[`root-${id}`].transform.pos.y = y;
        input.trunks[id].segments[0].topJoint!.pos.y = y;
        input.trunks[id].contactCone!.pos.y = y;
        input.knots[`k-${id}`] = { id: `k-${id}`, parentShaftId: `seg-${id}`, pos: { x: 0, y, z: 10 } };
    }
    input.braces.stationary = { id: 'stationary', typeId: 'brace', generatedBy: 'autoBracing', modelId: 'model',
        startKnotId: 'k-b', endKnotId: 'k-c', profile: { diameter: 0.6 } };
    const result = plan(input, ['a', 'b', 'c'], { maxMoveMm: 1 }, { autoBracingSettings: createDefaultAutoBracingSettings() });
    assert.equal(result.changedCount, 0);
    assert.equal(result.snapshot, input);
    assert.equal(result.removedAutoBraceCount, 0);
    assert.ok(result.skipped.some(skip => skip.supportId === 'a' && skip.reason === 'collision'));
});

test('nonfinite hosted knot coordinates never create nonfinite grid geometry', () => {
    const input = scene([1]);
    input.knots.bad = { id: 'bad', parentShaftId: 'seg-a', t: 0.5, pos: { x: 1, y: 0, z: NaN } };
    const result = plan(input);
    assert.equal(result.changedCount, 0);
    assert.equal(result.snapshot, input);
    assert.equal(result.skipped[0].reason, 'dependent-geometry');
});

test('regenerated braces are checked against unselected upper shafts and unused new knots are removed', () => {
    const input = scene([1, 7, 4]);
    input.roots['root-c'].transform.pos.y = -8;
    const lower = input.trunks.c.segments[0];
    lower.topJoint!.pos = { x: 4, y: -8, z: 7 };
    input.trunks.c.segments.push({ id: 'upper-c', diameter: 1.2, bottomJoint: lower.topJoint,
        topJoint: { id: 'upper-c-joint', diameter: 1.3, pos: { x: 4, y: 8, z: 21 } } });
    input.trunks.c.contactCone!.pos = { x: 4, y: 8, z: 24 };
    for (const id of ['a', 'b']) input.knots[`k-${id}`] = { id: `k-${id}`, parentShaftId: `seg-${id}`,
        pos: { x: id === 'a' ? 1 : 7, y: 0, z: 2.5 } };
    input.braces.old = { id: 'old', typeId: 'brace', generatedBy: 'autoBracing', modelId: 'model',
        startKnotId: 'k-a', endKnotId: 'k-b', profile: { diameter: 0.6 } };
    const mesh = boxMesh();
    registerMeshForAutoBrace('model', mesh.geometry, mesh.matrixWorld);
    try {
        const result = plan(input, ['a', 'b'], {}, { mesh, autoBracingSettings: createDefaultAutoBracingSettings(),
            gridSettings: { enabled: false, spacingMm: 4, minBranchAngleDeg: 45, attachSearchStepMm: 1, minRoutedTrunkAngleDeg: 45 } });
        assert.equal(result.changedCount, 2);
        assert.equal(result.removedAutoBraceCount, 1);
        assert.ok(result.generatedAutoBraceCount > 0 && result.generatedAutoBraceCount < 4, 'blocked regenerated links are omitted');
        assert.equal(result.snapshot.trunks.c, input.trunks.c);
        for (const brace of Object.values(result.snapshot.braces)) {
            const start = result.snapshot.knots[brace.startKnotId].pos;
            const end = result.snapshot.knots[brace.endKnotId].pos;
            for (const [index, segment] of input.trunks.c.segments.entries()) {
                const obstacle = resolveSegmentEndpoints(input.trunks.c, segment, index, { root: input.roots['root-c'] })!;
                const combined = (segment.diameter + brace.profile.diameter) / 2;
                assert.ok(segmentDistanceSq(start, end, obstacle.start, obstacle.end) >= combined * combined);
            }
        }
        const referenced = new Set(Object.values(result.snapshot.braces).flatMap(brace => [brace.startKnotId, brace.endKnotId]));
        for (const id of Object.keys(result.snapshot.knots)) assert.ok(referenced.has(id), 'rejected links leave no unused new knots');
        assertKnotsAttached(result.snapshot);
    } finally {
        unregisterMeshForAutoBrace('model');
    }
});

test('real binary VOXL roundtrip retains grid roots, exact contacts and dependent graph geometry', async () => {
    const original = getSnapshot();
    const proposal = plan(dependentScene());
    assert.equal(proposal.changedCount, 2);
    try {
        const binary = await serializeVoxlDocumentV2({ ...testInput(['model']), supports: buildSupportExportFromStores(proposal.snapshot) }, new Map());
        loadFromImportFormat(parseVoxlBinaryV2(binary).document.supports);
        const loaded = getSnapshot();
        for (const id of ['a', 'b']) {
            assert.deepEqual(loaded.roots[`root-${id}`], proposal.snapshot.roots[`root-${id}`]);
            assert.deepEqual(loaded.trunks[id].contactCone, proposal.snapshot.trunks[id].contactCone);
            assert.deepEqual(loaded.trunks[id].segments, proposal.snapshot.trunks[id].segments);
        }
        assert.deepEqual(loaded.branches.child, proposal.snapshot.branches.child);
        assert.deepEqual(loaded.leaves.leaf, proposal.snapshot.leaves.leaf);
        assert.deepEqual(loaded.braces.manual, proposal.snapshot.braces.manual);
        assertKnotsAttached(loaded);
    } finally {
        setSnapshot(original);
    }
});

test('bounded grid candidate searches handle a large separated selection without all-pairs geometry scans', () => {
    const input = scene(Array.from({ length: 1500 }, (_, index) => index * 100 + 1));
    const start = performance.now();
    const result = plan(input, Object.keys(input.trunks), {}, {
        plateBounds: { minX: -50, maxX: 150000, minY: -50, maxY: 50 },
    });
    assert.equal(result.changedCount, 1500);
    assert.ok(result.candidateChecks <= GRID_MAX_CANDIDATE_CHECKS);
    assert.equal(result.candidateChecks, 1500);
    assert.ok(performance.now() - start < 10000, 'bounded broadphase fixture stays below a generous 10s guard');
});
