import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeBVH } from '../../../utils/bvh';
import { createDefaultAutoBracingSettings } from '../../autoBracing/settings';
import { buildAutoBracedSnapshot } from '../../autoBracing/autoBrace';
import { registerMeshForAutoBrace, unregisterMeshForAutoBrace } from '../../autoBracing/meshGeometryStore';
import { resolveSegmentEndpoints } from '../../SupportPrimitives/Knot/segmentEndpoints';
import { getFinalSocketPosition } from '../../SupportPrimitives/ContactCone/contactConeUtils';
import { getSnapshot, loadFromImportFormat, setSnapshot } from '../../state';
import { buildSupportExportFromStores } from '../../../features/scene/voxl/codec';
import { parseVoxlBinaryV2, serializeVoxlDocumentV2 } from '../../../features/scene/voxl/codec-v2';
import { testInput } from '../../../features/scene/voxl/__tests__/voxlTestSupport';
import { getSettings, setSettings } from '../../Settings/state';
import type { SupportState } from '../../types';
import { scene, boxMesh } from './clusterFixture';
import { buildClusterOptimization, DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, CLUSTER_MAX_CANDIDATE_CHECKS } from '../clusterOptimization';

initializeBVH();

const plan = (snapshot: SupportState, selectedIds = Object.keys(snapshot.trunks), mesh = boxMesh()) =>
    buildClusterOptimization(snapshot, selectedIds, DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, { modelId: 'model', mesh });

test('reduces selected trunks into existing parent shafts, preserving exact contact geometry and the input', () => {
    const input = scene([0, 4, 8, 12]);
    const before = JSON.stringify(input);
    const result = plan(input);
    assert.equal(result.changedCount, 2);
    assert.equal(result.targetTrunkCount, 2);
    assert.equal(result.remainingTrunkCount, 2);
    assert.equal(result.contactCountBefore, 4);
    assert.equal(result.contactCountAfter, 4);
    assert.ok(result.candidateChecks > 0 && result.candidateChecks <= CLUSTER_MAX_CANDIDATE_CHECKS);
    assert.equal(JSON.stringify(input), before);
    for (const branch of Object.values(result.snapshot.branches)) {
        const old = input.trunks[branch.id];
        assert.equal(branch.contactCone, old.contactCone);
        assert.deepEqual(getFinalSocketPosition(branch.contactCone!), old.segments[0].topJoint!.pos);
        assert.equal(result.snapshot.roots[old.rootId], undefined);
        const parent = result.snapshot.knots[branch.parentKnotId];
        assert.ok(Object.values(result.snapshot.trunks).some(host => host.segments.some(segment => segment.id === parent.parentShaftId)));
    }
    assert.deepEqual(plan(input).snapshot, result.snapshot, 'IDs and geometry are deterministic');
});

test('retains dependent knots, branches, leaves, and manual braces at identical world positions', () => {
    const input = scene();
    input.knots.ka = { id: 'ka', parentShaftId: 'seg-a', t: 0.5, pos: { x: 0, y: 0, z: 11 }, diameter: 1.3 };
    input.knots.kb = { id: 'kb', parentShaftId: 'seg-b', t: 0.8, pos: { x: 4, y: 0, z: 16.4 }, diameter: 1.3 };
    input.braces.manual = { id: 'manual', typeId: 'brace', modelId: 'model', startKnotId: 'ka', endKnotId: 'kb', profile: { diameter: 0.6 } };
    input.branches.child = { id: 'child', typeId: 'branch', modelId: 'model', parentKnotId: 'ka', segments: [], contactCone: { ...input.trunks.a.contactCone!, id: 'child-cone' } };
    input.leaves.leaf = { id: 'leaf', typeId: 'leaf', modelId: 'model', parentKnotId: 'ka', contactCone: { ...input.trunks.a.contactCone!, id: 'leaf-cone' } };
    const result = plan(input);
    assert.equal(result.changedCount, 1);
    assert.equal(result.snapshot.braces.manual, input.braces.manual);
    assert.equal(result.snapshot.branches.child, input.branches.child);
    assert.equal(result.snapshot.leaves.leaf, input.leaves.leaf);
    assert.deepEqual(result.snapshot.knots.ka.pos, input.knots.ka.pos);
    const branch = result.snapshot.branches.a;
    const segment = branch.segments.find(item => item.id === 'seg-a')!;
    const endpoints = resolveSegmentEndpoints(branch, segment, 1, { hostKnot: result.snapshot.knots[branch.parentKnotId] })!;
    const knot = result.snapshot.knots.ka;
    assert.ok(Math.abs(endpoints.start.z + (endpoints.end.z - endpoints.start.z) * knot.t! - knot.pos.z) < 1e-9);
});

test('low manual braces prevent unsafe grafts instead of detaching a dependent', () => {
    const input = scene();
    input.knots.ka = { id: 'ka', parentShaftId: 'seg-a', pos: { x: 0, y: 0, z: 2.5 } };
    input.knots.kb = { id: 'kb', parentShaftId: 'seg-b', pos: { x: 4, y: 0, z: 2.5 } };
    input.braces.manual = { id: 'manual', modelId: 'model', startKnotId: 'ka', endKnotId: 'kb', profile: { diameter: 0.6 } };
    const result = plan(input);
    assert.equal(result.changedCount, 0);
    assert.equal(result.snapshot, input);
    assert.equal(result.snapshot.braces.manual, input.braces.manual);
});

test('existing low auto braces are rebuilt within selected shafts so a braced forest can optimize', () => {
    const input = scene([0, 4, 8, 12]);
    const mesh = boxMesh();
    for (const [index, trunk] of Object.values(input.trunks).entries()) {
        const knotId = `auto-knot-${trunk.id}`;
        input.knots[knotId] = { id: knotId, parentShaftId: trunk.segments[0].id, pos: { x: index * 4, y: 0, z: 2.5 } };
        if (index > 0) input.braces[`auto-${index}`] = {
            id: `auto-${index}`, modelId: 'model', typeId: 'brace', generatedBy: 'autoBracing',
            startKnotId: `auto-knot-${String.fromCharCode(96 + index)}`, endKnotId: knotId, profile: { diameter: 0.6 },
        };
    }
    assert.equal(plan(input).changedCount, 0, 'retaining near-root brace attachments leaves no safe graft');
    registerMeshForAutoBrace('model', mesh.geometry, mesh.matrixWorld);
    try {
        const result = buildClusterOptimization(input, Object.keys(input.trunks), DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, {
            modelId: 'model', mesh, autoBracingSettings: createDefaultAutoBracingSettings(),
        });
        assert.equal(result.changedCount, 2);
        assert.equal(result.removedAutoBraceCount, 3);
        assert.ok(result.generatedAutoBraceCount > 0);
        for (const brace of Object.values(result.snapshot.braces)) {
            assert.ok(result.snapshot.knots[brace.startKnotId]);
            assert.ok(result.snapshot.knots[brace.endKnotId]);
        }
        for (const knot of Object.values(result.snapshot.knots)) assert.ok(
            [...Object.values(result.snapshot.trunks), ...Object.values(result.snapshot.branches)].some(support => support.segments.some(segment => segment.id === knot.parentShaftId)),
            `knot ${knot.id} must stay attached`,
        );
    } finally {
        unregisterMeshForAutoBrace('model');
    }
});

test('unselected supports, outside automatic braces, and their knots remain exact', () => {
    const input = scene([0, 4, 7]);
    input.knots.ka = { id: 'ka', parentShaftId: 'seg-a', pos: { x: 0, y: 0, z: 12 } };
    input.knots.kc = { id: 'kc', parentShaftId: 'seg-c', pos: { x: 7, y: 0, z: 12 } };
    input.braces.outside = { id: 'outside', modelId: 'model', generatedBy: 'autoBracing', startKnotId: 'ka', endKnotId: 'kc', profile: { diameter: 0.6 } };
    const result = buildClusterOptimization(input, ['a', 'b'], DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, {
        modelId: 'model', mesh: boxMesh(), autoBracingSettings: createDefaultAutoBracingSettings(),
    });
    assert.equal(result.changedCount, 1);
    assert.equal(result.snapshot.trunks.c, input.trunks.c);
    assert.equal(result.snapshot.roots['root-c'], input.roots['root-c']);
    assert.equal(result.snapshot.braces.outside, input.braces.outside);
    assert.equal(result.snapshot.knots.kc, input.knots.kc);
    assert.equal(result.removedAutoBraceCount, 0);
});

test('the model collision oracle blocks a separating wall and other-plate geometry is never joined', () => {
    const input = scene();
    const wall = boxMesh(0.5, 100, 100, 2, 0, 20);
    const blocked = plan(input, ['a', 'b'], wall);
    assert.equal(blocked.changedCount, 0);
    assert.ok(blocked.candidateChecks > 0);
    assert.ok(blocked.skipped.every(skip => skip.reason === 'collision'));
    input.roots['root-b'] = { ...input.roots['root-b'], transform: { ...input.roots['root-b'].transform, pos: { x: 4, y: 0, z: 5 } } };
    assert.equal(plan(input).changedCount, 0);
    const wrongPlate = buildClusterOptimization(scene(), ['a', 'b'], DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, {
        modelId: 'model', mesh: boxMesh(), plateId: 'plate-a', modelPlateId: 'plate-b',
    });
    assert.equal(wrongPlate.changedCount, 0);
    assert.ok(wrongPlate.skipped.every(skip => skip.reason === 'wrong-model-or-plate'));
});

test('selection, ownership, reach, angle, and reduction limits do not force invalid geometry', () => {
    const input = scene([0, 4, 8]);
    assert.equal(plan(input, ['a']).snapshot, input);
    assert.equal(plan(input, []).snapshot, input);
    const zero = buildClusterOptimization(input, ['a', 'b', 'c'], { ...DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, reductionPercent: 0 }, { modelId: 'model', mesh: boxMesh() });
    assert.equal(zero.snapshot, input);
    input.trunks.c = { ...input.trunks.c, modelId: 'other' };
    const subset = plan(input, ['a', 'c']);
    assert.equal(subset.changedCount, 0);
    assert.equal(subset.snapshot, input);
    assert.ok(subset.skipped.some(skip => skip.supportId === 'c' && skip.reason === 'wrong-model-or-plate'));
    assert.equal(buildClusterOptimization(scene(), ['a', 'b'], { ...DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, maxReachMm: 1 }, { modelId: 'model', mesh: boxMesh() }).changedCount, 0);
    const low = scene();
    for (const trunk of Object.values(low.trunks)) trunk.segments[0].topJoint!.pos.z = 5;
    assert.equal(buildClusterOptimization(low, ['a', 'b'], { ...DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, maxJoinAngleDeg: 10 }, { modelId: 'model', mesh: boxMesh() }).changedCount, 0);
});

test('serialized proposals load through the canonical store with branch, cone, and parent links intact', () => {
    const originalStore = getSnapshot();
    const proposal = plan(scene()).snapshot;
    try {
        setSnapshot(JSON.parse(JSON.stringify(proposal)) as SupportState);
        const loaded = getSnapshot();
        assert.equal(Object.keys(loaded.trunks).length, 1);
        assert.equal(Object.keys(loaded.branches).length, 1);
        assert.equal(loaded.supports!.a.typeId, 'branch');
        assert.deepEqual(loaded.branches.a.contactCone, proposal.branches.a.contactCone);
        assert.ok(loaded.knots[loaded.branches.a.parentKnotId]);
    } finally {
        setSnapshot(originalStore);
    }
});

test('rejects a graft crossing an unrelated support shaft or manual brace', () => {
    const input = scene([0, 4, 2]);
    const shaftBlocked = plan(input, ['a', 'b']);
    assert.equal(shaftBlocked.changedCount, 0);
    assert.ok(shaftBlocked.skipped.every(skip => skip.reason === 'collision'));
    const braced = scene([0, 4, 2, 2]);
    for (const [id, y] of [['c', -10], ['d', 10]] as const) {
        braced.roots[`root-${id}`].transform.pos.y = y;
        braced.trunks[id].segments[0].topJoint!.pos.y = y;
        braced.trunks[id].contactCone!.pos.y = y;
    }
    braced.knots.left = { id: 'left', parentShaftId: 'seg-c', pos: { x: 2, y: -10, z: 15 } };
    braced.knots.right = { id: 'right', parentShaftId: 'seg-d', pos: { x: 2, y: 10, z: 20 } };
    // A curve is a collision subject even when neither endpoint is in the path.
    braced.braces.wall = { id: 'wall', modelId: 'model', startKnotId: 'left', endKnotId: 'right', profile: { diameter: 3 },
        curve: { type: 'bezier', controlPoint1: { x: 2, y: -3, z: 16 }, controlPoint2: { x: 2, y: 3, z: 19 },
            startTangent: { x: 0, y: 1, z: 0 }, endTangent: { x: 0, y: 1, z: 0 }, tension: 1, bias: 0.5, resolution: 16 } };
    const braceBlocked = plan(braced, ['a', 'b']);
    assert.equal(braceBlocked.changedCount, 0);
    assert.ok(braceBlocked.skipped.every(skip => skip.reason === 'collision'));
});

test('always checks own mesh with empty or neighbours-only collision lists', () => {
    const wall = boxMesh(0.5, 100, 100, 2, 0, 20);
    for (const collisionMeshes of [[], [boxMesh()]]) {
        const result = buildClusterOptimization(scene(), ['a', 'b'], DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, {
            modelId: 'model', mesh: wall, collisionMeshes,
        });
        assert.equal(result.changedCount, 0);
        assert.ok(result.candidateChecks > 0);
    }
});

test('a retained bend on the source or host remains a collision subject outside the junction', () => {
    const input = scene();
    const socket = input.trunks.a.segments[0].topJoint!;
    input.trunks.a.segments.push({ id: 'loop', type: 'bezier', diameter: 3,
        bottomJoint: socket, topJoint: { ...socket, id: 'loop-top' },
        controlPoint1: { x: 4, y: 0, z: 14 }, controlPoint2: { x: 4, y: 0, z: 14 },
        startTangent: { x: 1, y: 0, z: -1 }, endTangent: { x: -1, y: 0, z: 1 },
        tension: 1, bias: 0.5, resolution: 32 });
    const result = plan(input);
    assert.equal(result.changedCount, 0);
    assert.ok(result.skipped.every(skip => skip.reason === 'collision'));
});

test('full reach bounds the new graft and larger join limits remain meaningful within shared angle rules', () => {
    const input = scene();
    const tooShort = buildClusterOptimization(input, ['a', 'b'], { ...DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, maxReachMm: 5 }, { modelId: 'model', mesh: boxMesh() });
    assert.equal(tooShort.changedCount, 0, '4mm XY needs more than 5mm total length at 45 degrees');
    const result = buildClusterOptimization(input, ['a', 'b'], { ...DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS, maxReachMm: 5, maxJoinAngleDeg: 75 }, { modelId: 'model', mesh: boxMesh() });
    assert.equal(result.changedCount, 1);
    const branch = Object.values(result.snapshot.branches)[0];
    const knot = result.snapshot.knots[branch.parentKnotId];
    const joint = branch.segments[0].topJoint!.pos;
    assert.ok(Math.hypot(joint.x - knot.pos.x, joint.y - knot.pos.y, joint.z - knot.pos.z) <= 5);
});

test('spatial broadphase avoids host scans for a large out-of-reach selection', () => {
    const input = scene(Array.from({ length: 1500 }, (_, index) => index * 100));
    const result = plan(input);
    assert.equal(result.changedCount, 0);
    assert.equal(result.hostChecks, 0);
    assert.equal(result.candidateChecks, 0);
    assert.equal(result.snapshot, input);
});

test('real binary VOXL save and import retain graft, contact geometry, remapped knots, leaf, and manual brace', async () => {
    const originalStore = getSnapshot();
    const input = scene();
    input.knots.ka = { id: 'ka', parentShaftId: 'seg-a', t: 0.5, pos: { x: 0, y: 0, z: 11 }, diameter: 1.3 };
    input.knots.kb = { id: 'kb', parentShaftId: 'seg-b', t: 0.8, pos: { x: 4, y: 0, z: 16.4 }, diameter: 1.3 };
    input.braces.manual = { id: 'manual', typeId: 'brace', modelId: 'model', startKnotId: 'ka', endKnotId: 'kb', profile: { diameter: 0.6 } };
    input.leaves.leaf = { id: 'leaf', typeId: 'leaf', modelId: 'model', parentKnotId: 'ka',
        contactCone: { ...input.trunks.a.contactCone!, id: 'leaf-cone', socketJointId: undefined,
            pos: { x: 0, y: 3, z: 14 }, normal: { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 },
            surfaceNormal: { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 },
            profile: { ...input.trunks.a.contactCone!.profile, lengthMm: Math.sqrt(18) } } };
    delete input.leaves.leaf.contactCone.socketJointId;
    const result = plan(input);
    assert.equal(result.changedCount, 1);
    try {
        const data = { ...testInput(['model']), supports: buildSupportExportFromStores(result.snapshot) };
        const binary = await serializeVoxlDocumentV2(data, new Map());
        const parsed = parseVoxlBinaryV2(binary).document;
        loadFromImportFormat(parsed.supports);
        const loaded = getSnapshot();
        assert.equal(Object.keys(loaded.trunks).length, 1);
        assert.equal(Object.keys(loaded.branches).length, 1);
        assert.deepEqual(loaded.branches.a.contactCone, result.snapshot.branches.a.contactCone);
        assert.deepEqual(loaded.trunks.b.contactCone, result.snapshot.trunks.b.contactCone);
        assert.deepEqual(loaded.branches.a.segments, result.snapshot.branches.a.segments);
        assert.deepEqual(loaded.braces.manual, result.snapshot.braces.manual);
        for (const key of ['ka', 'kb']) {
            assert.ok(Math.hypot(loaded.knots[key].pos.x - result.snapshot.knots[key].pos.x,
                loaded.knots[key].pos.y - result.snapshot.knots[key].pos.y,
                loaded.knots[key].pos.z - result.snapshot.knots[key].pos.z) < 1e-6);
            assert.equal(loaded.knots[key].parentShaftId, result.snapshot.knots[key].parentShaftId);
        }
        assert.deepEqual(loaded.leaves.leaf.contactCone, result.snapshot.leaves.leaf.contactCone);
        assert.ok(loaded.knots[loaded.branches.a.parentKnotId]);
    } finally {
        setSnapshot(originalStore);
    }
});

test('automatic brace grid override is deterministic while omitted options retain the current-grid default', () => {
    const snapshot = scene();
    snapshot.roots['root-b'].transform.pos.y = 4;
    snapshot.trunks.b.segments[0].topJoint!.pos.y = 4;
    snapshot.trunks.b.contactCone!.pos.y = 4;
    const originalSettings = getSettings();
    const capturedGrid = { ...originalSettings.grid, enabled: false, spacingMm: 4 };
    const mesh = boxMesh();
    const settings = createDefaultAutoBracingSettings();
    const local = { changedSupportIds: new Set(['a', 'b']), allowTwoSupports: true };
    registerMeshForAutoBrace('model', mesh.geometry, mesh.matrixWorld);
    try {
        setSettings({ ...originalSettings, grid: capturedGrid });
        const inherited = buildAutoBracedSnapshot(snapshot, settings, local);
        const explicit = buildAutoBracedSnapshot(snapshot, settings, { ...local, gridSettings: capturedGrid });
        assert.ok(inherited.generatedBraceCount > 0);
        assert.deepEqual(explicit, inherited);
        setSettings({ ...originalSettings, grid: { ...capturedGrid, enabled: true } });
        assert.equal(buildAutoBracedSnapshot(snapshot, settings, local).generatedBraceCount, 0,
            'the existing default still follows current cardinal grid restrictions');
        assert.deepEqual(buildAutoBracedSnapshot(snapshot, settings, { ...local, gridSettings: capturedGrid }), explicit,
            'the captured policy is independent of later live grid changes');
    } finally {
        setSettings(originalSettings);
        unregisterMeshForAutoBrace('model');
    }
});
