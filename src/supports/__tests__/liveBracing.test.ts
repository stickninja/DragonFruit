import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import * as THREE from 'three';
import { clearHistory, getUndoCount, peekUndo, redo, undo } from '@/history/historyStore';
import { buildAutoBracedSnapshot, runAutoBracing } from '../autoBracing/autoBrace';
import { commitManualSupportPlacement } from '../autoBracing/liveBracing';
import { getMeshEntryForAutoBrace, registerMeshForAutoBrace, unregisterMeshForAutoBrace } from '../autoBracing/meshGeometryStore';
import { createDefaultAutoBracingSettings } from '../autoBracing/settings';
import { addAction, SUPPORT_EDIT_REPLACE } from '../history/actionTypes';
import { pushSupportHistory } from '../history/supportHistory';
import { registerSupportHistoryHandlers } from '../history/useSupportHistoryHandlers';
import { getSettings, setSettings, updateAutoBracingSettings, updateGridSettings } from '../Settings/state';
import { createDefaultSettings } from '../Settings/types';
import { addKnot, addRoot, addSupportEntity, cloneSupportState, getSnapshot, resetStore, setSnapshot } from '../state';
import type { Branch, Roots, Trunk } from '../types';

function fixture(id: string, x: number, modelId = 'live-model', y = 0, top = 20): { root: Roots; trunk: Trunk } {
    return {
        root: {
            id: `root-${id}`, modelId, diameter: 3, diskHeight: 0.5, coneHeight: 0.5,
            transform: { pos: { x, y, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
        },
        trunk: {
            id, typeId: 'trunk', modelId, rootId: `root-${id}`,
            segments: [{ id: `seg-${id}`, diameter: 1, topJoint: { id: `joint-${id}`, diameter: 1.125, pos: { x, y, z: top } } }],
        },
    };
}

function insert(build: ReturnType<typeof fixture>): void {
    addRoot(build.root);
    addSupportEntity('trunk', build.trunk);
}

function place(build: ReturnType<typeof fixture>): void {
    commitManualSupportPlacement('trunk', new Set([build.trunk.id]), () => insert(build), () => {
        pushSupportHistory({ type: addAction('trunk'), payload: { trunk: build.trunk, roots: [build.root] } });
    });
}

function attachmentSignatures(): string[] {
    const state = getSnapshot();
    return Object.values(state.braces).map(brace => [brace.startKnotId, brace.endKnotId].map(id => {
        const knot = state.knots[id];
        return `${knot.parentShaftId}:${JSON.stringify(knot.pos)}`;
    }).sort().join('|'));
}

beforeEach(() => {
    resetStore();
    clearHistory();
    setSettings(createDefaultSettings());
    updateGridSettings({ enabled: false });
    updateAutoBracingSettings({ autoBraceWhilePlacing: true });
});

test('the second adjacent manual trunk creates native braces and one complete undo/redo action', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        insert(fixture('a', 0));
        const before = cloneSupportState(getSnapshot());
        place(fixture('b', 4));
        const after = cloneSupportState(getSnapshot());
        assert.ok(Object.keys(after.braces).length > 0);
        assert.equal(getUndoCount(), 1);
        assert.equal(peekUndo()?.type, SUPPORT_EDIT_REPLACE);
        assert.equal(Object.keys(after.kickstands).length, 0);
        for (const brace of Object.values(after.braces)) {
            assert.equal(brace.typeId, 'brace');
            assert.equal(brace.generatedBy, 'autoBracing');
            assert.ok(after.knots[brace.startKnotId]);
            assert.ok(after.knots[brace.endKnotId]);
        }
        undo();
        assert.deepEqual(getSnapshot(), before);
        redo();
        assert.deepEqual(getSnapshot(), after);
    } finally {
        unregister();
    }
});

test('disabled live bracing keeps the legacy placement history and geometry', () => {
    updateAutoBracingSettings({ autoBraceWhilePlacing: false });
    insert(fixture('a', 0));
    place(fixture('b', 4));
    assert.equal(Object.keys(getSnapshot().braces).length, 0);
    assert.equal(Object.keys(getSnapshot().kickstands).length, 0);
    assert.equal(getUndoCount(), 1);
    assert.equal(peekUndo()?.type, addAction('trunk'));
});

test('local insertion preserves manual braces, unrelated generated braces and kickstands', () => {
    insert(fixture('a', 0));
    insert(fixture('far-a', 100));
    insert(fixture('far-b', 104));
    const initial = cloneSupportState(getSnapshot());
    const far = buildAutoBracedSnapshot(initial, createDefaultAutoBracingSettings(), { changedSupportIds: new Set(['far-b']) }).snapshot;
    const existingBrace = Object.values(far.braces)[0];
    far.braces.manual = { ...existingBrace, id: 'manual', generatedBy: undefined };
    // An existing generated stabiliser must not be regenerated or removed.
    far.kickstands.existing = {
        id: 'existing', typeId: 'kickstand', modelId: 'other-model', rootId: 'existing-root',
        hostKnotId: 'existing-host', hostSegmentId: 'other-segment', hostMinT: 0, segments: [], generatedBy: 'autoBracing',
        profile: { bodyDiameterMm: 1, terminalStartDiameterMm: 1, terminalEndDiameterMm: 1 },
    };
    setSnapshot(far);
    const preserved = cloneSupportState(getSnapshot());
    place(fixture('b', 4));
    const after = getSnapshot();
    for (const [id, brace] of Object.entries(preserved.braces)) assert.deepEqual(after.braces[id], brace);
    for (const [id, knot] of Object.entries(preserved.knots)) assert.deepEqual(after.knots[id], knot);
    assert.deepEqual(after.kickstands, preserved.kickstands);
    assert.deepEqual(after.trunks['far-a'], preserved.trunks['far-a']);
    for (const brace of Object.values(after.braces).filter(b => !preserved.braces[b.id])) {
        assert.ok([brace.startKnotId, brace.endKnotId].some(id => after.knots[id].parentShaftId === 'seg-b'));
    }
});

test('repeated placements retain prior links and rerunning a local insertion makes no duplicate', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        insert(fixture('a', 0));
        place(fixture('b', 4));
        const beforeThird = cloneSupportState(getSnapshot());
        place(fixture('c', 8));
        assert.equal(getUndoCount(), 2);
        for (const [id, brace] of Object.entries(beforeThird.braces)) assert.deepEqual(getSnapshot().braces[id], brace);
        const signatures = attachmentSignatures();
        assert.equal(new Set(signatures).size, signatures.length);
        const repeat = buildAutoBracedSnapshot(getSnapshot(), getSettings().autoBracing, { changedSupportIds: new Set(['c']) });
        assert.equal(repeat.changed, false);
        assert.equal(repeat.generatedBraceCount, 0);
        undo();
        assert.deepEqual(getSnapshot(), beforeThird);
        redo();
        assert.deepEqual(attachmentSignatures(), signatures);
    } finally {
        unregister();
    }
});

test('local bracing respects model scope, distance, grid axes, height and registered mesh clearance', () => {
    for (const candidate of [fixture('b', 4, 'other-model'), fixture('b', 30), fixture('b', 4, 'live-model', 0, 3)]) {
        resetStore();
        insert(fixture('a', 0));
        place(candidate);
        assert.equal(Object.keys(getSnapshot().braces).length, 0);
        assert.ok(getSnapshot().trunks.b);
    }
    resetStore();
    updateGridSettings({ enabled: true, spacingMm: 1 });
    insert(fixture('a', 0));
    place(fixture('b', 4, 'live-model', 4));
    assert.equal(Object.keys(getSnapshot().braces).length, 0);
    resetStore();
    updateGridSettings({ enabled: false });
    const geometry = new THREE.BoxGeometry(2, 20, 50);
    registerMeshForAutoBrace('live-model', geometry, new THREE.Matrix4().makeTranslation(2, 0, 20));
    try {
        insert(fixture('a', 0));
        place(fixture('b', 4));
        assert.equal(Object.keys(getSnapshot().braces).length, 0);
        assert.ok(getSnapshot().trunks.b);
    } finally {
        unregisterMeshForAutoBrace('live-model');
        geometry.dispose();
    }
});

test('relative generation uses each actual host segment at the attachment without the fixed diameter floor', () => {
    updateAutoBracingSettings({ braceSizingMode: 'relative', braceDiameterPercent: 50 });
    const a = fixture('a', 0);
    a.trunk.segments = [
        { id: 'a-thin', diameter: 0.4, topJoint: { id: 'a-split', diameter: 0.525, pos: { x: 0, y: 0, z: 5 } } },
        { id: 'a-thick', diameter: 1.6, topJoint: { id: 'a-top', diameter: 1.725, pos: { x: 0, y: 0, z: 20 } } },
    ];
    const b = fixture('b', 4);
    b.trunk.segments[0].diameter = 0.8;
    insert(a);
    place(b);
    const state = getSnapshot();
    const diameters = new Map([['a-thin', 0.4], ['a-thick', 1.6], ['seg-b', 0.8]]);
    for (const brace of Object.values(state.braces)) {
        const start = state.knots[brace.startKnotId];
        const end = state.knots[brace.endKnotId];
        assert.equal(brace.profile.diameter, Math.min(diameters.get(start.parentShaftId)!, diameters.get(end.parentShaftId)!) * 0.5);
        assert.equal(brace.profile.uniformDiameter, true);
    }
    assert.ok(Object.values(state.braces).some(brace => brace.profile.diameter === 0.2));
    assert.ok(Object.values(state.braces).some(brace => brace.profile.diameter === 0.4));
});

test('a relative brace wider than its span is rejected while both trunks remain placed', () => {
    updateAutoBracingSettings({ braceSizingMode: 'relative', braceDiameterPercent: 100 });
    const a = fixture('a', 0);
    const b = fixture('b', 4);
    a.trunk.segments[0].diameter = 6;
    b.trunk.segments[0].diameter = 8;
    insert(a);
    place(b);
    assert.equal(Object.keys(getSnapshot().braces).length, 0);
    assert.equal(Object.keys(getSnapshot().trunks).length, 2);
});

test('explicit Apply resizes the pair created by live placement without changing parent shafts', () => {
    insert(fixture('a', 0));
    place(fixture('b', 4));
    const initial = cloneSupportState(getSnapshot());
    updateAutoBracingSettings({ braceSizingMode: 'relative', braceDiameterPercent: 25 });
    const result = runAutoBracing();
    assert.ok(result.generatedBraceCount > 0);
    assert.ok(result.removedBraceCount > 0);
    assert.deepEqual(getSnapshot().trunks, initial.trunks);
    for (const brace of Object.values(getSnapshot().braces)) {
        assert.equal(brace.profile.diameter, 0.25);
        assert.equal(brace.profile.uniformDiameter, true);
    }
});

test('a native manual branch participates through the same local commit and undo path', () => {
    const unregister = registerSupportHistoryHandlers();
    try {
        insert(fixture('a', 0));
        insert(fixture('host', 4));
        const before = cloneSupportState(getSnapshot());
        const knot = { id: 'branch-host', parentShaftId: 'seg-host', t: 4 / 19, pos: { x: 4, y: 0, z: 5 }, diameter: 1.125 };
        const branch: Branch = {
            id: 'branch', typeId: 'branch', modelId: 'live-model', parentKnotId: knot.id,
            segments: [{ id: 'branch-seg', diameter: 1, topJoint: { id: 'branch-top', diameter: 1.125, pos: { x: 6, y: 0, z: 20 } } }],
        };
        commitManualSupportPlacement('branch', new Set([branch.id]), () => {
            addKnot(knot);
            addSupportEntity('branch', branch);
        }, () => pushSupportHistory({ type: addAction('branch'), payload: { branch, knot } }));
        assert.ok(Object.values(getSnapshot().braces).some(brace =>
            [brace.startKnotId, brace.endKnotId].some(id => getSnapshot().knots[id].parentShaftId === 'branch-seg')));
        assert.equal(getUndoCount(), 1);
        undo();
        assert.deepEqual(getSnapshot(), before);
    } finally {
        unregister();
    }
});

test('an unexpected bracing error keeps the model contact and its one undo action', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    registerMeshForAutoBrace('live-model', geometry, new THREE.Matrix4());
    getMeshEntryForAutoBrace('live-model')!.mesh.raycast = () => { throw new Error('clearance failure'); };
    const originalError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args) => { errors.push(args); };
    try {
        insert(fixture('a', 0));
        place(fixture('b', 4));
        assert.ok(getSnapshot().trunks.b);
        assert.ok(getSnapshot().roots['root-b']);
        assert.equal(Object.keys(getSnapshot().braces).length, 0);
        assert.equal(getUndoCount(), 1);
        assert.equal(errors.length, 1);
    } finally {
        console.error = originalError;
        unregisterMeshForAutoBrace('live-model');
        geometry.dispose();
    }
});
