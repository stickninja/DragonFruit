import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { resolveAutoBraceDiameter } from '../autoBracing/braceDiameter';
import { createDefaultAutoBracingSettings } from '../autoBracing/settings';
import { resolveBraceEndpointDiameters } from '../SupportTypes/Brace/braceDiameters';
import { buildSupportExportGroup } from '../exportGeometry/seam';
import { supportProxyGeometryOf } from '../proxyGeometry/seam';
import { createEmptySupportCollections, knotHostId } from '../supportTypeRegistry';
import { cloneSupportState, getSnapshot, loadFromImportFormat, recomputeSpanHostKnotGeometry, resetStore } from '../state';
import { buildSupportExportFromStores } from '@/features/scene/voxl/codec';
import type { Brace, Knot, SupportState } from '../types';
import '../SupportTypes/Brace/braceRegistration';
import { resolveBracePathDiameterAtT } from '../interaction/shared/placement/snapping/supportPathTargets';
import { JOINT_DIAMETER_OFFSET_MM } from '../constants';

test('relative diameter uses the smaller local parent without the fixed minimum', () => {
    const settings = { ...createDefaultAutoBracingSettings(), braceSizingMode: 'relative' as const };
    assert.equal(resolveAutoBraceDiameter(settings, 0.8, 2), 0.4);
    assert.equal(resolveAutoBraceDiameter(settings, 2, 0.8), 0.4);
    assert.equal(resolveAutoBraceDiameter({ ...settings, braceDiameterPercent: 25 }, 1.2, 4), 0.3);
    assert.equal(resolveAutoBraceDiameter({ ...settings, braceSizingMode: 'fixed', braceDiameterMm: 1.5 }, 0.8, 2), 1.5);
    for (const bad of [NaN, Infinity, 0, -1]) {
        assert.equal(resolveAutoBraceDiameter(settings, bad, 2), settings.braceDiameterMm);
    }
});

function fixture() {
    const start: Knot = { id: 'start', parentShaftId: 'a', t: 0.2, pos: { x: 0, y: 0, z: 2 }, diameter: 0.3 };
    const end: Knot = { id: 'end', parentShaftId: 'b', t: 0.8, pos: { x: 0, y: 0, z: 6 }, diameter: 2.2 };
    const brace: Brace = { id: 'brace', typeId: 'brace', modelId: 'model', startKnotId: start.id, endKnotId: end.id, profile: { diameter: 0.4, uniformDiameter: true } };
    const state = { ...createEmptySupportCollections(), selectedId: null, hoveredId: null, roots: {}, knots: { start, end }, braces: { brace }, supports: { brace } } as SupportState;
    return { start, end, brace, state };
}

test('uniform relative braces agree in detail sizing, proxy and exported geometry', () => {
    const { start, end, brace, state } = fixture();
    assert.deepEqual(resolveBraceEndpointDiameters(brace, start, end), { startDiameter: 0.4, endDiameter: 0.4 });
    const recipe = supportProxyGeometryOf('brace');
    assert.ok(recipe);
    const diameters: number[] = [];
    recipe.build(brace as never, {
        state, includeDetailedPrimitives: false,
        pushShaft: (shaft) => diameters.push(shaft.diameter),
        pushSegmentShafts: () => {}, pushRoot: () => {}, pushJoint: () => {}, pushCone: () => {},
    });
    assert.deepEqual(diameters, [0.4]);
    const exported = buildSupportExportGroup('brace', brace, { supportState: state, modelIdOf: () => 'model' });
    assert.ok(exported);
    const bounds = new THREE.Box3().setFromObject(exported);
    assert.ok(Math.abs((bounds.max.x - bounds.min.x) - 0.4) < 1e-6);
    assert.ok(Math.abs((bounds.max.z - bounds.min.z) - 4) < 1e-6);
    exported.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    const legacy = resolveBraceEndpointDiameters({ ...brace, profile: { diameter: 0.4 } }, start, end);
    assert.ok(legacy.startDiameter < legacy.endDiameter, 'legacy braces keep host taper');
});

test('uniform diameter metadata survives snapshot cloning and scene import/export', () => {
    resetStore();
    try {
        const { state } = fixture();
        assert.deepEqual(cloneSupportState(state).braces.brace.profile, state.braces.brace.profile);
        const wire = buildSupportExportFromStores(state);
        wire.knots.push({ id: 'hosted', parentShaftId: knotHostId('brace', 'brace'), t: 0.5, pos: { x: 0, y: 0, z: 4 }, diameter: 8 });
        loadFromImportFormat(JSON.parse(JSON.stringify(wire)));
        assert.deepEqual(getSnapshot().braces.brace.profile, state.braces.brace.profile);
        const recomputed = recomputeSpanHostKnotGeometry(getSnapshot().braces, getSnapshot().knots);
        assert.equal(recomputed.knots.hosted.diameter, 0.4 + JOINT_DIAMETER_OFFSET_MM);
        assert.equal(resolveBracePathDiameterAtT(state.braces.brace, state.knots, 0.25), 0.4);
    } finally {
        resetStore();
    }
});
