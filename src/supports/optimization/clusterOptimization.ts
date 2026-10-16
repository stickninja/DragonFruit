import type * as THREE from 'three';
import { buildAutoBracedSnapshot } from '../autoBracing/autoBrace';
import type { AutoBracingSettings } from '../autoBracing/settings';
import type { GridSettings } from '../Settings/types';
import { bezierToLineSegments } from '../Curves/BezierUtils';
import { isCollisionSegmentBlocked } from '../PlacementLogic/CollisionAvoidance';
import { segmentDistanceSq } from '../PlacementLogic/segmentDistance';
import {
    distance3D, getLengthAwareMaxAngleFromVerticalDeg, memberDepartureAngleFromVerticalDeg,
} from '../PlacementLogic/smartPlacementSearchUtils';
import { resolveSegmentEndpoints } from '../SupportPrimitives/Knot/segmentEndpoints';
import { getFinalSocketPosition } from '../SupportPrimitives/ContactCone/contactConeUtils';
import type { ContactCone } from '../SupportPrimitives/ContactCone/types';
import { isAutoBraceableShaftType, SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Branch, Knot, Segment, SupportEntityAny, SupportState, Trunk, Vec3 } from '../types';

export interface ClusterOptimizationOptions {
    reductionPercent: number;
    maxReachMm: number;
    /** Maximum departure angle measured from vertical. */
    maxJoinAngleDeg: number;
}

export const DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS: ClusterOptimizationOptions = {
    reductionPercent: 50, maxReachMm: 8, maxJoinAngleDeg: 45,
};

export type ClusterSkipReason =
    | 'wrong-model-or-plate' | 'unsupported-geometry' | 'dependent-geometry'
    | 'no-compatible-parent' | 'collision' | 'search-limit';

export interface ClusterOptimizationContext {
    modelId: string;
    mesh: THREE.Mesh;
    plateId?: string;
    modelPlateId?: string;
    /** Include neighbouring models on the active plate when available. */
    collisionMeshes?: readonly THREE.Mesh[];
    /** Support collision subjects on the active plate; defaults to this model. */
    collisionModelIds?: readonly string[];
    /** Allows selected, wholly internal generated braces to be rebuilt. */
    autoBracingSettings?: AutoBracingSettings;
    /** Captured grid policy for deterministic automatic-brace regeneration. */
    gridSettings?: GridSettings;
}

export interface ClusterOptimizationResult {
    snapshot: SupportState;
    changedCount: number;
    selectedTrunkCount: number;
    targetTrunkCount: number;
    remainingTrunkCount: number;
    contactCountBefore: number;
    contactCountAfter: number;
    skipped: Array<{ supportId: string; reason: ClusterSkipReason }>;
    candidateChecks: number;
    /** Hosts surviving the spatial broadphase, before segment sampling. */
    hostChecks: number;
    removedAutoBraceCount: number;
    generatedAutoBraceCount: number;
}

const EPS = 1e-6;
const SHAFT_CLEARANCE_MM = 0.48;
/** Every expensive geometry query is charged against this run-wide bound. */
export const CLUSTER_MAX_CANDIDATE_CHECKS = 6000;
const MAX_HOST_SAMPLES = 64;

const interpolate = (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
});
const finitePoint = (point: Vec3): boolean => [point.x, point.y, point.z].every(Number.isFinite);

function junctionTrim(start: Vec3, end: Vec3, axisStart: Vec3, axisEnd: Vec3, radius: number): number {
    const ax = end.x - start.x, ay = end.y - start.y, az = end.z - start.z;
    const bx = axisEnd.x - axisStart.x, by = axisEnd.y - axisStart.y, bz = axisEnd.z - axisStart.z;
    const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    const sin = cross / Math.max(EPS, distance3D(start, end) * distance3D(axisStart, axisEnd));
    return (radius + 0.01) / Math.max(0.01, sin);
}

/** Explicit collection copies also handle the store's non-enumerable collection views. */
function copyCollections(snapshot: SupportState): SupportState {
    const next = { ...snapshot, roots: { ...snapshot.roots }, knots: { ...snapshot.knots } };
    for (const descriptor of SUPPORT_TYPES) {
        Object.assign(next, { [descriptor.location.key]: { ...snapshot[descriptor.location.key] } });
    }
    return next;
}

function syncSupportMap(snapshot: SupportState): void {
    const supports: Record<string, SupportEntityAny> = {};
    for (const descriptor of SUPPORT_TYPES) {
        for (const entity of Object.values(snapshot[descriptor.location.key])) supports[entity.id] = entity;
    }
    snapshot.supports = supports;
}

function contacts(snapshot: SupportState, selected?: ReadonlySet<string>): string[] {
    const result: string[] = [];
    for (const descriptor of SUPPORT_TYPES) {
        for (const entity of Object.values(snapshot[descriptor.location.key])) {
            if (selected && !selected.has(entity.id)) continue;
            const fields = entity as unknown as Record<string, unknown>;
            for (const field of descriptor.contactFields) {
                if (fields[field]) result.push(JSON.stringify(fields[field]));
            }
        }
    }
    return result.sort();
}

function referencedKnots(snapshot: SupportState): Set<string> {
    const result = new Set<string>();
    for (const descriptor of SUPPORT_TYPES) {
        const fields = descriptor.edges.filter(edge => edge.to === 'knots').map(edge => edge.field);
        for (const entity of Object.values(snapshot[descriptor.location.key])) {
            for (const field of fields) {
                const id = (entity as unknown as Record<string, unknown>)[field];
                if (typeof id === 'string') result.add(id);
            }
        }
    }
    return result;
}

/** Only disposable generated braces entirely inside this explicit selection. */
function removeInternalAutoBraces(snapshot: SupportState, selected: ReadonlySet<string>): number {
    const selectedSegments = new Set([...selected].flatMap(id => snapshot.trunks[id]?.segments.map(s => s.id) ?? []));
    const removedKnots = new Set<string>();
    let removed = 0;
    for (const brace of Object.values(snapshot.braces)) {
        if (brace.generatedBy !== 'autoBracing') continue;
        const start = snapshot.knots[brace.startKnotId];
        const end = snapshot.knots[brace.endKnotId];
        if (!start || !end || !selectedSegments.has(start.parentShaftId) || !selectedSegments.has(end.parentShaftId)) continue;
        delete snapshot.braces[brace.id];
        removedKnots.add(start.id);
        removedKnots.add(end.id);
        removed++;
    }
    const referenced = referencedKnots(snapshot);
    for (const id of removedKnots) if (!referenced.has(id)) delete snapshot.knots[id];
    return removed;
}

function uniqueIdFactory(snapshot: SupportState): (base: string) => string {
    const ids = new Set<string>([...Object.keys(snapshot.roots), ...Object.keys(snapshot.knots)]);
    for (const descriptor of SUPPORT_TYPES) {
        for (const entity of Object.values(snapshot[descriptor.location.key])) {
            ids.add(entity.id);
            if ('segments' in entity) for (const segment of entity.segments) {
                ids.add(segment.id);
                if (segment.topJoint) ids.add(segment.topJoint.id);
                if (segment.bottomJoint) ids.add(segment.bottomJoint.id);
            }
        }
    }
    return base => {
        let id = base;
        let index = 1;
        while (ids.has(id)) id = `${base}-${index++}`;
        ids.add(id);
        return id;
    };
}

interface Graft {
    sourceT: number;
    point: Vec3;
    endpoints: { start: Vec3; end: Vec3 };
    hostedKnots: Array<{ knot: Knot; t: number }>;
}

interface SupportSpan { ownerId: string; segmentId?: string; start: Vec3; end: Vec3; radius: number }

/** A bounded XY broadphase; very wide spans use the small overflow set. */
class SpanIndex {
    private cells = new Map<string, Set<string>>();
    private wide = new Set<string>();
    constructor(private size: number) {}
    add(id: string, start: Vec3, end: Vec3, margin = 0): void {
        const x0 = Math.floor((Math.min(start.x, end.x) - margin) / this.size);
        const x1 = Math.floor((Math.max(start.x, end.x) + margin) / this.size);
        const y0 = Math.floor((Math.min(start.y, end.y) - margin) / this.size);
        const y1 = Math.floor((Math.max(start.y, end.y) + margin) / this.size);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) { this.wide.add(id); return; }
        for (let dx = 0; dx <= x1 - x0; dx++) for (let dy = 0; dy <= y1 - y0; dy++) {
            const x = x0 + dx, y = y0 + dy;
            const key = `${x},${y}`;
            const ids = this.cells.get(key) ?? new Set<string>();
            ids.add(id);
            this.cells.set(key, ids);
        }
    }
    query(start: Vec3, end: Vec3, margin: number): Set<string> {
        const ids = new Set(this.wide);
        const x0 = Math.floor((Math.min(start.x, end.x) - margin) / this.size);
        const x1 = Math.floor((Math.max(start.x, end.x) + margin) / this.size);
        const y0 = Math.floor((Math.min(start.y, end.y) - margin) / this.size);
        const y1 = Math.floor((Math.max(start.y, end.y) + margin) / this.size);
        for (let dx = 0; dx <= x1 - x0; dx++) for (let dy = 0; dy <= y1 - y0; dy++) {
            const x = x0 + dx, y = y0 + dy;
            for (const id of this.cells.get(`${x},${y}`) ?? []) ids.add(id);
        }
        return ids;
    }
}

function supportSpans(snapshot: SupportState, modelIds: ReadonlySet<string>): SupportSpan[] {
    const result: SupportSpan[] = [];
    const add = (ownerId: string, start: Vec3, end: Vec3, diameter: number, curve?: {
        controlPoint1: Vec3; controlPoint2: Vec3; resolution: number;
    }, segmentId?: string) => {
        const points = curve ? bezierToLineSegments(start, curve.controlPoint1, curve.controlPoint2, end,
            Math.min(64, Math.max(8, curve.resolution))) : [start, end];
        for (let i = 1; i < points.length; i++) result.push({ ownerId, segmentId,
            start: points[i - 1], end: points[i], radius: diameter / 2 });
    };
    for (const descriptor of SUPPORT_TYPES) {
        for (const entity of Object.values(snapshot[descriptor.location.key])) {
            if (!modelIds.has(entity.modelId)) continue;
            for (const field of descriptor.contactFields) {
                const cone = (entity as unknown as Record<string, ContactCone>)[field];
                if (!cone?.normal || !cone.profile || !('lengthMm' in cone.profile)) continue;
                add(entity.id, cone.pos, getFinalSocketPosition(cone), Math.max(cone.profile.bodyDiameterMm, cone.profile.contactDiameterMm));
            }
            if (!descriptor.hasSegments || !('segments' in entity)) continue;
            const rootId = (entity as { rootId?: string }).rootId;
            const knotEdge = descriptor.edges.find(edge => edge.to === 'knots' && edge.ownership === 'hostedBy');
            const knotId = knotEdge ? (entity as unknown as Record<string, string>)[knotEdge.field] : undefined;
            entity.segments.forEach((segment: Segment, index: number) => {
                const endpoints = resolveSegmentEndpoints({ ...entity, typeId: descriptor.id }, segment, index, {
                    root: rootId ? snapshot.roots[rootId] : undefined,
                    hostKnot: knotId ? snapshot.knots[knotId] : undefined,
                });
                if (endpoints) add(entity.id, endpoints.start, endpoints.end, segment.diameter,
                    segment.type === 'bezier' ? segment : undefined, segment.id);
            });
        }
    }
    for (const brace of Object.values(snapshot.braces)) {
        if (!modelIds.has(brace.modelId)) continue;
        const start = snapshot.knots[brace.startKnotId], end = snapshot.knots[brace.endKnotId];
        if (start && end) add(brace.id, start.pos, end.pos, brace.profile.diameter, brace.curve);
    }
    return result;
}

/** Keep every existing knot at the same world point above the new diagonal. */
function sourceGraft(snapshot: SupportState, source: Trunk, knotsByShaft: Map<string, Knot[]>, sharedRoots: ReadonlySet<string>): Graft | ClusterSkipReason {
    const root = snapshot.roots[source.rootId];
    const segment = source.segments[0];
    if (!root || root.modelId !== source.modelId || !source.contactCone || !segment
        || segment.type === 'bezier' || !segment.topJoint || !(segment.diameter > 0)) return 'unsupported-geometry';
    const endpoints = resolveSegmentEndpoints({ ...source, typeId: 'trunk' }, segment, 0, { root });
    if (!endpoints || !finitePoint(endpoints.start) || !finitePoint(endpoints.end)
        || endpoints.end.z - endpoints.start.z < 1) return 'unsupported-geometry';
    const length = distance3D(endpoints.start, endpoints.end);
    let sourceT = 1 - 0.25 / length;
    const hostedKnots: Graft['hostedKnots'] = [];
    if (knotsByShaft.has(source.id) || knotsByShaft.has(source.rootId)) return 'dependent-geometry';
    for (const knot of knotsByShaft.get(segment.id) ?? []) {
        // Resolve from geometry even for legacy knots without a trustworthy t.
        const a = endpoints.start, b = endpoints.end, p = knot.pos;
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)
            + (p.z - a.z) * (b.z - a.z)) / (length * length);
        if (t < -EPS || t > 1 + EPS || distance3D(interpolate(a, b, t), p) > 0.001) return 'dependent-geometry';
        hostedKnots.push({ knot, t });
        sourceT = Math.min(sourceT, t - Math.max(0.25, segment.diameter + 0.5) / length);
    }
    // A kickstand also stores a lower permitted parameter on its host span.
    // Keep that span unchanged rather than quietly changing its constraint.
    if (Object.values(snapshot.kickstands).some(stand => stand.hostSegmentId === segment.id)) return 'dependent-geometry';
    if (sharedRoots.has(source.rootId) || sourceT <= EPS) return 'dependent-geometry';
    return { sourceT, point: interpolate(endpoints.start, endpoints.end, sourceT), endpoints, hostedKnots };
}

function rebuildSelectedBraces(snapshot: SupportState, selected: ReadonlySet<string>, settings: AutoBracingSettings, gridSettings?: GridSettings): number {
    // Brace the surviving grounded skeleton. Offering the newly short graft
    // branches as nearest neighbours can hide the longer trunk-to-trunk pair
    // while leaving no vertical room for that branch's ladder.
    const grounded = new Set([...selected].filter(id => !!snapshot.trunks[id]));
    // The builder sees only selected grounded shafts. All existing primitives
    // and braces remain visible for dependency preservation and unique IDs.
    const scoped = copyCollections(snapshot);
    for (const descriptor of SUPPORT_TYPES) {
        if (!isAutoBraceableShaftType(descriptor.id)) continue;
        Object.assign(scoped, { [descriptor.location.key]: Object.fromEntries(
            Object.entries(snapshot[descriptor.location.key]).filter(([id]) => grounded.has(id)),
        ) });
    }
    const rebuilt = buildAutoBracedSnapshot(scoped, { ...settings, removeExistingBracing: false }, {
        changedSupportIds: grounded, allowTwoSupports: true, gridSettings,
    });
    for (const key of ['roots', 'knots', 'braces', 'kickstands'] as const) {
        Object.assign(snapshot[key], rebuilt.snapshot[key]);
    }
    return rebuilt.generatedBraceCount;
}

/**
 * Plan a manual selection-only consolidation without touching the live store.
 * Existing cones and upper shafts survive; only a clear lower graft replaces
 * each removed root. A target never overrides geometry or graph constraints.
 */
export function buildClusterOptimization(
    snapshot: SupportState,
    selectedIds: readonly string[],
    options: ClusterOptimizationOptions,
    context: ClusterOptimizationContext,
): ClusterOptimizationResult {
    const selected = new Set(selectedIds);
    const trunks = [...selected].map(id => snapshot.trunks[id]).filter((item): item is Trunk => !!item);
    const reduction = Number.isFinite(options.reductionPercent) ? Math.max(0, Math.min(75, options.reductionPercent)) : 50;
    const reach = Number.isFinite(options.maxReachMm) ? Math.max(1, Math.min(30, options.maxReachMm)) : 8;
    const joinAngle = Number.isFinite(options.maxJoinAngleDeg) ? Math.max(10, Math.min(75, options.maxJoinAngleDeg)) : 45;
    const target = trunks.length === 0 ? 0 : Math.max(1, Math.ceil(trunks.length * (1 - reduction / 100)));
    const beforeContacts = contacts(snapshot, selected);
    const result: ClusterOptimizationResult = {
        snapshot, changedCount: 0, selectedTrunkCount: trunks.length, targetTrunkCount: target,
        remainingTrunkCount: trunks.length, contactCountBefore: beforeContacts.length,
        contactCountAfter: beforeContacts.length, skipped: [], candidateChecks: 0, hostChecks: 0,
        removedAutoBraceCount: 0, generatedAutoBraceCount: 0,
    };
    if (target >= trunks.length) return result;
    const samePlate = !context.plateId || !context.modelPlateId || context.plateId === context.modelPlateId;
    const eligible = trunks.filter(trunk => {
        if (samePlate && trunk.modelId === context.modelId) return true;
        result.skipped.push({ supportId: trunk.id, reason: 'wrong-model-or-plate' });
        return false;
    });
    const next = copyCollections(snapshot);
    const collisionMeshes = [...new Set([context.mesh, ...(context.collisionMeshes ?? [])])];
    const collisionModels = new Set([context.modelId, ...(context.collisionModelIds ?? [])]);
    const eligibleIds = new Set(eligible.map(trunk => trunk.id));
    if (context.autoBracingSettings) result.removedAutoBraceCount = removeInternalAutoBraces(next, eligibleIds);
    const knotsByShaft = new Map<string, Knot[]>();
    for (const knot of Object.values(next.knots)) {
        const knots = knotsByShaft.get(knot.parentShaftId) ?? [];
        knots.push(knot);
        knotsByShaft.set(knot.parentShaftId, knots);
    }
    const ownedRoots = new Set<string>(), sharedRoots = new Set<string>();
    for (const descriptor of SUPPORT_TYPES) if (descriptor.ownsRoot) {
        for (const entity of Object.values(next[descriptor.location.key])) {
            const id = (entity as { rootId: string }).rootId;
            if (ownedRoots.has(id)) sharedRoots.add(id);
            ownedRoots.add(id);
        }
    }
    const hostIndex = new SpanIndex(reach);
    for (const host of eligible) host.segments.forEach((segment, index) => {
        const ends = resolveSegmentEndpoints({ ...host, typeId: 'trunk' }, segment, index, { root: next.roots[host.rootId] });
        if (ends && finitePoint(ends.start) && finitePoint(ends.end)) hostIndex.add(host.id, ends.start, ends.end);
    });
    const obstacleIndex = new SpanIndex(reach);
    const spansByOwner = new Map<string, SupportSpan[]>();
    const indexSpans = (spans: SupportSpan[]) => {
        for (const span of spans) {
            if (!finitePoint(span.start) || !finitePoint(span.end) || !Number.isFinite(span.radius)) continue;
            const own = spansByOwner.get(span.ownerId) ?? [];
            own.push(span);
            spansByOwner.set(span.ownerId, own);
            obstacleIndex.add(span.ownerId, span.start, span.end, span.radius);
        }
    };
    indexSpans(supportSpans(next, collisionModels));
    const createId = uniqueIdFactory(next);
    const keepers = new Set<string>();
    // Stable ordering makes repeated previews and saves reproducible.
    const ordered = eligible.toSorted((a, b) => a.id.localeCompare(b.id));
    for (const source of ordered) {
        if (result.remainingTrunkCount <= target) break;
        if (keepers.has(source.id)) continue;
        const graft = sourceGraft(next, source, knotsByShaft, sharedRoots);
        if (typeof graft === 'string') {
            result.skipped.push({ supportId: source.id, reason: graft });
            continue;
        }
        let attached = false;
        let collision = false;
        const sourceRoot = next.roots[source.rootId];
        const hosts = [...hostIndex.query(graft.point, graft.point, reach)]
            .map(id => next.trunks[id]).filter((host): host is Trunk => !!host && host.id !== source.id)
            .toSorted((a, b) => distance3D(next.roots[a.rootId]?.transform.pos ?? graft.point, sourceRoot.transform.pos)
                - distance3D(next.roots[b.rootId]?.transform.pos ?? graft.point, sourceRoot.transform.pos)
                || a.id.localeCompare(b.id));
        for (const host of hosts) {
            result.hostChecks++;
            const root = next.roots[host.rootId];
            if (!root || root.modelId !== context.modelId || Math.abs(root.transform.pos.z - sourceRoot.transform.pos.z) > 0.01) continue;
            for (let index = host.segments.length - 1; index >= 0 && !attached; index--) {
                const segment = host.segments[index];
                if (segment.type === 'bezier' || segment.diameter + EPS < source.segments[0].diameter) continue;
                const ends = resolveSegmentEndpoints({ ...host, typeId: 'trunk' }, segment, index, { root });
                if (!ends || !finitePoint(ends.start) || !finitePoint(ends.end)) continue;
                const samples = Math.min(MAX_HOST_SAMPLES, Math.max(1, Math.ceil(distance3D(ends.start, ends.end))));
                for (let sample = samples; sample >= 0; sample--) {
                    const t = sample / samples;
                    const position = interpolate(ends.start, ends.end, t);
                    const lateral = Math.hypot(position.x - graft.point.x, position.y - graft.point.y);
                    if (lateral > reach || lateral < EPS || position.z >= graft.point.z - EPS) continue;
                    const span = distance3D(position, graft.point);
                    if (span > reach + EPS) continue;
                    const allowance = Math.min(joinAngle, getLengthAwareMaxAngleFromVerticalDeg(span, joinAngle));
                    if (memberDepartureAngleFromVerticalDeg(position, graft.point) > allowance + EPS) continue;
                    if (result.candidateChecks >= CLUSTER_MAX_CANDIDATE_CHECKS) break;
                    result.candidateChecks++;
                    const clearance = source.segments[0].diameter / 2 + SHAFT_CLEARANCE_MM;
                    const crossesSupport = [...obstacleIndex.query(position, graft.point, clearance)].some(id =>
                        (spansByOwner.get(id) ?? []).some(other => {
                            const combined = source.segments[0].diameter / 2 + other.radius;
                            // Only the intentional junction volumes overlap. Test the
                            // rest of this same host/source too, including their bends.
                            let from = position, to = graft.point;
                            if (id === host.id) from = interpolate(position, graft.point, Math.min(1,
                                junctionTrim(position, graft.point, ends.start, ends.end, combined) / span));
                            if (id === source.id) {
                                // The lower original first shaft is being removed.
                                to = interpolate(graft.point, position, Math.min(1,
                                    junctionTrim(position, graft.point, graft.endpoints.start, graft.endpoints.end, combined) / span));
                            }
                            const otherStart = id === source.id && other.segmentId === source.segments[0].id
                                ? graft.point : other.start;
                            return segmentDistanceSq(from, to, otherStart, other.end) < combined * combined;
                        }));
                    if (crossesSupport || collisionMeshes.some(mesh => isCollisionSegmentBlocked(position, graft.point, clearance, mesh))) {
                        collision = true;
                        continue;
                    }
                    const knot: Knot = { id: createId(`cluster-${source.id}-knot`), parentShaftId: segment.id,
                        t, pos: position, diameter: segment.diameter + 0.1 };
                    const joint = { id: createId(`cluster-${source.id}-joint`), pos: graft.point,
                        diameter: source.segments[0].topJoint!.diameter };
                    const diagonal: Segment = { id: createId(`cluster-${source.id}-shaft`),
                        diameter: source.segments[0].diameter, topJoint: joint };
                    const common: Omit<Trunk, 'rootId' | 'baseDiameterMm'> & { rootId?: string; baseDiameterMm?: number } = { ...source };
                    delete common.rootId;
                    delete common.baseDiameterMm;
                    const branch: Branch = { ...common, typeId: 'branch', parentKnotId: knot.id,
                        segments: [diagonal, { ...source.segments[0], bottomJoint: joint }, ...source.segments.slice(1)] };
                    next.branches[source.id] = branch;
                    delete next.trunks[source.id];
                    delete next.roots[source.rootId];
                    next.knots[knot.id] = knot;
                    const hostKnots = knotsByShaft.get(knot.parentShaftId) ?? [];
                    hostKnots.push(knot);
                    knotsByShaft.set(knot.parentShaftId, hostKnots);
                    for (const hosted of graft.hostedKnots) next.knots[hosted.knot.id] = {
                        ...hosted.knot, t: (hosted.t - graft.sourceT) / (1 - graft.sourceT),
                    };
                    keepers.add(host.id);
                    spansByOwner.delete(source.id);
                    const single = { roots: next.roots, knots: next.knots } as SupportState;
                    for (const descriptor of SUPPORT_TYPES) Object.assign(single, { [descriptor.location.key]: {} });
                    single.branches = { [branch.id]: branch };
                    indexSpans(supportSpans(single, collisionModels));
                    result.changedCount++;
                    result.remainingTrunkCount--;
                    attached = true;
                    break;
                }
            }
            if (attached || result.candidateChecks >= CLUSTER_MAX_CANDIDATE_CHECKS) break;
        }
        if (!attached) result.skipped.push({ supportId: source.id, reason: result.candidateChecks >= CLUSTER_MAX_CANDIDATE_CHECKS
            ? 'search-limit' : collision ? 'collision' : 'no-compatible-parent' });
        if (result.candidateChecks >= CLUSTER_MAX_CANDIDATE_CHECKS) break;
    }
    // No-op previews keep exactly the original object, including all bracing.
    if (result.changedCount === 0) {
        result.removedAutoBraceCount = 0;
        return result;
    }
    if (context.autoBracingSettings && result.removedAutoBraceCount > 0) {
        result.generatedAutoBraceCount = rebuildSelectedBraces(next, eligibleIds, context.autoBracingSettings, context.gridSettings);
    }
    const afterContacts = contacts(next);
    if (JSON.stringify(contacts(snapshot)) !== JSON.stringify(afterContacts)) {
        throw new Error('Cluster optimization must preserve every original contact');
    }
    result.contactCountAfter = contacts(next, selected).length;
    syncSupportMap(next);
    result.snapshot = next;
    return result;
}
