import { buildAutoBracedSnapshot } from '../autoBracing/autoBrace';
import type { AutoBracingSettings } from '../autoBracing/settings';
import type { GridSettings } from '../Settings/types';
import { bezierToLineSegments } from '../Curves/BezierUtils';
import { distance3D } from '../PlacementLogic/smartPlacementSearchUtils';
import { resolveSegmentEndpoints } from '../SupportPrimitives/Knot/segmentEndpoints';
import { getFinalSocketPosition } from '../SupportPrimitives/ContactCone/contactConeUtils';
import type { ContactCone } from '../SupportPrimitives/ContactCone/types';
import { isAutoBraceableShaftType, SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Knot, Segment, SupportEntityAny, SupportState, Trunk, Vec3 } from '../types';

const EPS = 1e-6;

export const interpolate = (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
});
export const finitePoint = (point: Vec3): boolean => [point.x, point.y, point.z].every(Number.isFinite);

export function junctionTrim(start: Vec3, end: Vec3, axisStart: Vec3, axisEnd: Vec3, radius: number): number {
    const ax = end.x - start.x, ay = end.y - start.y, az = end.z - start.z;
    const bx = axisEnd.x - axisStart.x, by = axisEnd.y - axisStart.y, bz = axisEnd.z - axisStart.z;
    const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    const sin = cross / Math.max(EPS, distance3D(start, end) * distance3D(axisStart, axisEnd));
    return (radius + 0.01) / Math.max(0.01, sin);
}

/** Explicit collection copies also handle the store's non-enumerable collection views. */
export function copyCollections(snapshot: SupportState): SupportState {
    const next = { ...snapshot, roots: { ...snapshot.roots }, knots: { ...snapshot.knots } };
    for (const descriptor of SUPPORT_TYPES) {
        Object.assign(next, { [descriptor.location.key]: { ...snapshot[descriptor.location.key] } });
    }
    return next;
}

export function syncSupportMap(snapshot: SupportState): void {
    const supports: Record<string, SupportEntityAny> = {};
    for (const descriptor of SUPPORT_TYPES) {
        for (const entity of Object.values(snapshot[descriptor.location.key])) supports[entity.id] = entity;
    }
    snapshot.supports = supports;
}

export function contacts(snapshot: SupportState, selected?: ReadonlySet<string>): string[] {
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

export function contactSocketJointIds(snapshot: SupportState): Set<string> {
    const ids = new Set<string>();
    for (const descriptor of SUPPORT_TYPES) for (const entity of Object.values(snapshot[descriptor.location.key])) {
        for (const field of descriptor.contactFields) {
            const cone = (entity as unknown as Record<string, ContactCone>)[field];
            if (cone?.socketJointId) ids.add(cone.socketJointId);
        }
    }
    return ids;
}

export function referencedKnots(snapshot: SupportState): Set<string> {
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
export function removeInternalAutoBraces(snapshot: SupportState, selected: ReadonlySet<string>, affectedSegmentIds?: ReadonlySet<string>): number {
    const selectedSegments = new Set([...selected].flatMap(id => snapshot.trunks[id]?.segments.map(s => s.id) ?? []));
    const removedKnots = new Set<string>();
    let removed = 0;
    for (const brace of Object.values(snapshot.braces)) {
        if (brace.generatedBy !== 'autoBracing') continue;
        const start = snapshot.knots[brace.startKnotId];
        const end = snapshot.knots[brace.endKnotId];
        if (!start || !end || !selectedSegments.has(start.parentShaftId) || !selectedSegments.has(end.parentShaftId)) continue;
        if (affectedSegmentIds && !affectedSegmentIds.has(start.parentShaftId) && !affectedSegmentIds.has(end.parentShaftId)) continue;
        delete snapshot.braces[brace.id];
        removedKnots.add(start.id);
        removedKnots.add(end.id);
        removed++;
    }
    const referenced = referencedKnots(snapshot);
    for (const id of removedKnots) if (!referenced.has(id)) delete snapshot.knots[id];
    return removed;
}

export function uniqueIdFactory(snapshot: SupportState): (base: string) => string {
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

export interface Graft {
    segmentIndex: number;
    fullyRemovedSegmentIds: ReadonlySet<string>;
    /** Parameter on the original retained span, not the whole rooted prefix. */
    sourceT: number;
    point: Vec3;
    endpoints: { start: Vec3; end: Vec3 };
    hostedKnots: Array<{ knot: Knot; t: number }>;
    fallbacks?: readonly Graft[];
}

export interface SupportSpan { ownerId: string; segmentId?: string; start: Vec3; end: Vec3; radius: number }

/** A bounded XY broadphase; very wide spans use the small overflow set. */
export class SpanIndex {
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

export function supportSpans(snapshot: SupportState, modelIds: ReadonlySet<string>): SupportSpan[] {
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
export function sourceGraft(snapshot: SupportState, source: Trunk, knotsByShaft: Map<string, Knot[]>, sharedRoots: ReadonlySet<string>, socketJointIds = contactSocketJointIds(snapshot)): Graft | 'unsupported-geometry' | 'dependent-geometry' {
    const root = snapshot.roots[source.rootId];
    const segment = source.segments[0];
    if (!root || root.modelId !== source.modelId || !source.contactCone || !segment
        || segment.type === 'bezier' || !segment.topJoint || !Number.isFinite(segment.diameter) || !(segment.diameter > 0)
        || !Number.isFinite(segment.topJoint.diameter) || !(segment.topJoint.diameter > 0)) return 'unsupported-geometry';
    const endpoints = resolveSegmentEndpoints({ ...source, typeId: 'trunk' }, segment, 0, { root });
    if (!endpoints || !finitePoint(endpoints.start) || !finitePoint(endpoints.end)
        || endpoints.end.z - endpoints.start.z < 1) return 'unsupported-geometry';
    if (knotsByShaft.has(source.id) || knotsByShaft.has(source.rootId)) return 'dependent-geometry';
    // A kickstand also stores a lower permitted parameter on its host span.
    // Keep that span unchanged rather than quietly changing its constraint.
    if (Object.values(snapshot.kickstands).some(stand => stand.hostSegmentId === segment.id)) return 'dependent-geometry';
    if (sharedRoots.has(source.rootId)) return 'dependent-geometry';
    function atSpan(index: number, span: { start: Vec3; end: Vec3 }): Graft | 'dependent-geometry' {
        const member = source.segments[index];
        const length = distance3D(span.start, span.end);
        let sourceT = 1;
        const hostedKnots: Graft['hostedKnots'] = [];
        for (const knot of knotsByShaft.get(member.id) ?? []) {
            // Project onto this retained span; its earlier collinear spans may disappear.
            const a = span.start, b = span.end, p = knot.pos;
            if (!finitePoint(p)) return 'dependent-geometry';
            const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)
                + (p.z - a.z) * (b.z - a.z)) / (length * length);
            if (!Number.isFinite(t) || t < -EPS || t > 1 + EPS || distance3D(interpolate(a, b, t), p) > 0.001) return 'dependent-geometry';
            hostedKnots.push({ knot, t });
            sourceT = Math.min(sourceT, t - Math.max(0.25, member.diameter + 0.5) / length);
        }
        if (sourceT <= EPS || (hostedKnots.length > 0 && sourceT >= 1)) return 'dependent-geometry';
        return { segmentIndex: index, fullyRemovedSegmentIds: new Set(source.segments.slice(0, index).map(item => item.id)),
            sourceT, point: sourceT === 1 ? span.end : interpolate(span.start, span.end, sourceT),
            endpoints: { start: endpoints!.start, end: span.end }, hostedKnots };
    }
    const initial = atSpan(0, endpoints);
    if (typeof initial === 'string') return initial;
    const candidates = [initial];
    const axis = { x: endpoints.end.x - endpoints.start.x, y: endpoints.end.y - endpoints.start.y, z: endpoints.end.z - endpoints.start.z };
    const axisLength = distance3D(endpoints.start, endpoints.end);
    let previous = endpoints;
    for (let index = 1; index < source.segments.length; index++) {
        const prior = source.segments[index - 1], member = source.segments[index];
        if ((knotsByShaft.get(prior.id)?.length ?? 0) > 0 || socketJointIds.has(prior.topJoint!.id)) break;
        if (member.type === 'bezier' || !member.topJoint || !finitePoint(member.topJoint.pos)
            || !Number.isFinite(member.diameter) || !(member.diameter > 0) || Math.abs(member.diameter - segment.diameter) > EPS
            || !Number.isFinite(member.topJoint.diameter) || !(member.topJoint.diameter > 0) || Math.abs(member.topJoint.diameter - segment.topJoint.diameter) > EPS
            || Object.values(snapshot.kickstands).some(stand => stand.hostSegmentId === member.id)) break;
        const span = resolveSegmentEndpoints({ ...source, typeId: 'trunk' }, member, index, { root });
        if (!span || !finitePoint(span.start) || !finitePoint(span.end) || distance3D(span.start, previous.end) > EPS) break;
        if (member.bottomJoint && (member.bottomJoint.id !== prior.topJoint!.id
            || !finitePoint(member.bottomJoint.pos) || distance3D(member.bottomJoint.pos, previous.end) > EPS
            || !Number.isFinite(member.bottomJoint.diameter) || Math.abs(member.bottomJoint.diameter - prior.topJoint!.diameter) > EPS)) break;
        const delta = { x: span.end.x - span.start.x, y: span.end.y - span.start.y, z: span.end.z - span.start.z };
        const offset = { x: span.end.x - endpoints.start.x, y: span.end.y - endpoints.start.y, z: span.end.z - endpoints.start.z };
        const lineDistance = Math.hypot(offset.y * axis.z - offset.z * axis.y,
            offset.z * axis.x - offset.x * axis.z, offset.x * axis.y - offset.y * axis.x) / axisLength;
        if (delta.x * axis.x + delta.y * axis.y + delta.z * axis.z <= EPS * axisLength || lineDistance > EPS) break;
        const candidate = atSpan(index, span);
        if (typeof candidate !== 'string' && candidate.point.z > candidates[candidates.length - 1].point.z + EPS) candidates.push(candidate);
        if (typeof candidate === 'string' || candidate.hostedKnots.length > 0) break;
        previous = span;
    }
    const best = candidates.pop()!;
    return candidates.length ? { ...best, fallbacks: candidates.reverse() } : best;
}

export function rebuildSelectedBraces(snapshot: SupportState, selected: ReadonlySet<string>, settings: AutoBracingSettings, gridSettings?: GridSettings, changedSupportIds?: ReadonlySet<string>): number {
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
        changedSupportIds: changedSupportIds ?? grounded, allowTwoSupports: true, gridSettings,
    });
    for (const key of ['roots', 'knots', 'braces', 'kickstands'] as const) {
        Object.assign(snapshot[key], rebuilt.snapshot[key]);
    }
    return rebuilt.generatedBraceCount;
}

