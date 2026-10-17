import type { ClusterOptimizationContext } from './clusterOptimization';
import { gridNodeKeyFromXY, gridSnappedXYFromKey } from '../PlacementLogic/Grid/gridMath';
import { buildNearestCandidateNodeKeys } from '../PlacementLogic/Grid/nearestCandidateNodeKeys';
import { isCollisionSegmentBlocked } from '../PlacementLogic/CollisionAvoidance';
import { segmentDistanceSq } from '../PlacementLogic/segmentDistance';
import {
    distance3D, getLengthAwareMaxAngleFromVerticalDeg, memberDepartureAngleFromVerticalDeg,
    TRUNK_DIAGONAL_LEAN_FROM_VERTICAL_DEG,
} from '../PlacementLogic/smartPlacementSearchUtils';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Knot, Roots, SupportState, Trunk, Vec3 } from '../types';
import {
    contacts, contactSocketJointIds, copyCollections, finitePoint, interpolate, junctionTrim,
    rebuildSelectedBraces, referencedKnots, removeInternalAutoBraces, sourceGraft, SpanIndex,
    supportSpans, syncSupportMap, uniqueIdFactory, type Graft, type SupportSpan,
} from './optimizationGeometry';

export interface GridOptimizationOptions {
    spacingMm: number;
    maxMoveMm: number;
    /** Maximum new diagonal angle, measured from vertical and capped at 45°. */
    maxJoinAngleDeg: number;
}

export const DEFAULT_GRID_OPTIMIZATION_OPTIONS: GridOptimizationOptions = {
    spacingMm: 2, maxMoveMm: 2, maxJoinAngleDeg: 45,
};

export interface GridOptimizationContext extends ClusterOptimizationContext {
    /** World XY bounds, in the same coordinate frame as existing support roots. */
    plateBounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export type GridSkipReason =
    | 'wrong-model-or-plate' | 'unsupported-geometry' | 'dependent-geometry'
    | 'occupied-node' | 'collision' | 'movement-limit' | 'angle-limit'
    | 'out-of-bounds' | 'search-limit';

export interface GridOptimizationResult {
    snapshot: SupportState;
    changedCount: number;
    selectedTrunkCount: number;
    /** Selected eligible roots already on the requested lattice, plus moved roots. */
    alignedTrunkCount: number;
    contactCountBefore: number;
    contactCountAfter: number;
    skipped: Array<{ supportId: string; reason: GridSkipReason }>;
    candidateChecks: number;
    removedAutoBraceCount: number;
    generatedAutoBraceCount: number;
}

export const GRID_MAX_CANDIDATE_CHECKS = 6000;
const EPS = 1e-6;
const SHAFT_CLEARANCE_MM = 0.48;
const MIN_VERTICAL_LEG_MM = 1;

function validRoot(root: Roots): boolean {
    const { pos, rot, scale } = root.transform;
    return !!pos && !!rot && finitePoint(pos) && [rot.x, rot.y, rot.z, rot.w].every(Number.isFinite)
        && Math.abs(rot.x) < EPS && Math.abs(rot.y) < EPS && Math.abs(rot.z) < EPS
        && Math.abs(Math.abs(rot.w) - 1) < EPS
        && (!scale || [scale.x, scale.y, scale.z].every(value => Math.abs(value - 1) < EPS))
        && Number.isFinite(root.diameter) && root.diameter > 0
        && Number.isFinite(root.diskHeight) && root.diskHeight >= 0
        && Number.isFinite(root.coneHeight) && root.coneHeight >= 0;
}

function insidePlate(point: Vec3, radius: number, bounds: GridOptimizationContext['plateBounds']): boolean {
    return bounds && [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite)
        && point.x - radius >= bounds.minX - EPS && point.x + radius <= bounds.maxX + EPS
        && point.y - radius >= bounds.minY - EPS && point.y + radius <= bounds.maxY + EPS;
}

/** The same root/contact ownership cells and half-step fallback used by DF grid placement. */
class NodeOwners {
    private owners = new Map<string, Map<string, Vec3[]>>();
    constructor(private spacing: number) {}
    add(ownerId: string, points: Vec3[]): void {
        for (const point of points) {
            if (!finitePoint(point)) continue;
            const key = gridNodeKeyFromXY(point.x, point.y, this.spacing);
            const owners = this.owners.get(key) ?? new Map<string, Vec3[]>();
            owners.set(ownerId, [...owners.get(ownerId) ?? [], point]);
            this.owners.set(key, owners);
        }
    }
    occupied(nodeKey: string, sourceId: string): boolean {
        const node = gridSnappedXYFromKey(nodeKey, this.spacing);
        for (const key of buildNearestCandidateNodeKeys(nodeKey, 1)) {
            for (const [ownerId, points] of this.owners.get(key) ?? []) {
                if (ownerId === sourceId) continue;
                if (key === nodeKey || points.some(point => Math.hypot(point.x - node.x, point.y - node.y) <= this.spacing / 2 + EPS)) return true;
            }
        }
        return false;
    }
}

/** Shorten only a valid rooted first span; the retained knot locations never move. */
function gridGraft(snapshot: SupportState, source: Trunk, knots: Map<string, Knot[]>, sharedRoots: ReadonlySet<string>, socketJointIds: Set<string>): Graft | GridSkipReason {
    const root = snapshot.roots[source.rootId];
    if (!root || !root.transform || !validRoot(root)) return 'unsupported-geometry';
    if (source.segments.some(segment => !Number.isFinite(segment.diameter) || segment.diameter <= 0
        || (segment.topJoint && (!finitePoint(segment.topJoint.pos)
            || !Number.isFinite(segment.topJoint.diameter) || segment.topJoint.diameter <= 0)))) return 'unsupported-geometry';
    const graft = sourceGraft(snapshot, source, knots, sharedRoots, socketJointIds);
    if (typeof graft === 'string') return graft;
    const rootTop = { ...root.transform.pos, z: root.transform.pos.z + root.diskHeight + root.coneHeight };
    if (distance3D(graft.endpoints.start, rootTop) > EPS) return 'unsupported-geometry';
    return graft;
}

/**
 * Plan selected-root alignment on DF's existing zero-origin lattice. Contacts,
 * dependent world positions, support types and upper spans are retained. This
 * tool lays out a forest; occupied nodes never cause a merge or contact removal.
 */
export function buildGridOptimization(
    snapshot: SupportState,
    selectedIds: readonly string[],
    options: GridOptimizationOptions,
    context: GridOptimizationContext,
): GridOptimizationResult {
    const selected = new Set(selectedIds);
    const trunks = [...selected].map(id => snapshot.trunks[id]).filter((trunk): trunk is Trunk => !!trunk);
    const spacing = Number.isFinite(options.spacingMm) ? Math.max(0.5, Math.min(30, options.spacingMm)) : 2;
    const maxMove = Number.isFinite(options.maxMoveMm) ? Math.max(0, Math.min(30, options.maxMoveMm)) : spacing;
    const maxAngle = Number.isFinite(options.maxJoinAngleDeg)
        ? Math.max(5, Math.min(TRUNK_DIAGONAL_LEAN_FROM_VERTICAL_DEG, options.maxJoinAngleDeg)) : 45;
    const beforeContacts = contacts(snapshot, selected);
    const result: GridOptimizationResult = {
        snapshot, changedCount: 0, selectedTrunkCount: trunks.length, alignedTrunkCount: 0,
        contactCountBefore: beforeContacts.length, contactCountAfter: beforeContacts.length,
        skipped: [], candidateChecks: 0, removedAutoBraceCount: 0, generatedAutoBraceCount: 0,
    };
    const samePlate = !context.plateId || !context.modelPlateId || context.plateId === context.modelPlateId;
    const eligible = trunks.filter(trunk => {
        if (samePlate && trunk.modelId === context.modelId && snapshot.roots[trunk.rootId]?.modelId === context.modelId) return true;
        result.skipped.push({ supportId: trunk.id, reason: 'wrong-model-or-plate' });
        return false;
    });
    for (const id of selected) if (!snapshot.trunks[id]) result.skipped.push({ supportId: id, reason: 'unsupported-geometry' });
    if (eligible.length === 0) return result;
    const next = copyCollections(snapshot);
    const eligibleIds = new Set(eligible.map(trunk => trunk.id));
    const knotsByShaft = new Map<string, Knot[]>();
    for (const knot of Object.values(next.knots)) {
        const knots = knotsByShaft.get(knot.parentShaftId) ?? [];
        knots.push(knot);
        knotsByShaft.set(knot.parentShaftId, knots);
    }
    const rootsSeen = new Set<string>(), sharedRoots = new Set<string>();
    for (const descriptor of SUPPORT_TYPES) if (descriptor.ownsRoot) {
        for (const entity of Object.values(next[descriptor.location.key])) {
            const rootId = (entity as { rootId: string }).rootId;
            if (rootsSeen.has(rootId)) sharedRoots.add(rootId);
            rootsSeen.add(rootId);
        }
    }
    const collisionModels = new Set([context.modelId, ...(context.collisionModelIds ?? [])]);
    const collisionMeshes = [...new Set([context.mesh, ...(context.collisionMeshes ?? [])])];
    const owners = new NodeOwners(spacing);
    for (const trunk of Object.values(next.trunks)) {
        const root = next.roots[trunk.rootId];
        if (!root || !collisionModels.has(trunk.modelId)) continue;
        owners.add(trunk.id, [root.transform.pos, ...(trunk.contactCone ? [trunk.contactCone.pos] : [])]);
    }
    const obstacleIndex = new SpanIndex(Math.max(1, spacing));
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
    // Roots are collision subjects too: a broad root must not cut a neighbour's
    // shaft even when that neighbour's lattice cell is distinct.
    for (const root of Object.values(next.roots)) {
        if (!collisionModels.has(root.modelId) || !root.transform || !validRoot(root)) continue;
        indexSpans([{ ownerId: root.id, start: root.transform.pos,
            end: { ...root.transform.pos, z: root.transform.pos.z + root.diskHeight + root.coneHeight }, radius: root.diameter / 2 }]);
    }
    const createId = uniqueIdFactory(next);
    const changed = new Set<string>();
    const socketJointIds = contactSocketJointIds(next);
    for (const source of eligible.toSorted((a, b) => a.id.localeCompare(b.id))) {
        const root = next.roots[source.rootId];
        const rootPos = root.transform?.pos;
        if (!rootPos || !root.transform || !validRoot(root)) {
            result.skipped.push({ supportId: source.id, reason: 'unsupported-geometry' });
            continue;
        }
        const preferred = gridNodeKeyFromXY(rootPos.x, rootPos.y, spacing);
        const snapped = gridSnappedXYFromKey(preferred, spacing);
        if (Math.hypot(rootPos.x - snapped.x, rootPos.y - snapped.y) < EPS) {
            result.alignedTrunkCount++;
            continue;
        }
        // Only links touching this source may be released for its attempt.
        // Stationary-to-stationary links remain collision obstacles throughout.
        const sourceSegments = new Set(source.segments.map(segment => segment.id));
        const priorBraces = context.autoBracingSettings ? Object.values(next.braces).filter(brace => {
            const start = next.knots[brace.startKnotId], end = next.knots[brace.endKnotId];
            return brace.generatedBy === 'autoBracing' && ((start && sourceSegments.has(start.parentShaftId)) || (end && sourceSegments.has(end.parentShaftId)));
        }) : [];
        const priorKnots = new Map(priorBraces.flatMap(brace => [next.knots[brace.startKnotId], next.knots[brace.endKnotId]])
            .filter((knot): knot is Knot => !!knot).map(knot => [knot.id, knot]));
        if (priorBraces.length > 0) removeInternalAutoBraces(next, eligibleIds, sourceSegments);
        const removedBraces = priorBraces.filter(brace => !next.braces[brace.id]);
        const removedKnots = [...priorKnots.values()].filter(knot => !next.knots[knot.id]);
        const removedSpans = new Map(removedBraces.map(brace => [brace.id, spansByOwner.get(brace.id) ?? []]));
        for (const brace of removedBraces) spansByOwner.delete(brace.id);
        for (const knot of removedKnots) knotsByShaft.set(knot.parentShaftId,
            (knotsByShaft.get(knot.parentShaftId) ?? []).filter(item => item.id !== knot.id));
        const restoreBraces = () => {
            for (const brace of removedBraces) next.braces[brace.id] = brace;
            for (const knot of removedKnots) {
                next.knots[knot.id] = knot;
                const hosted = knotsByShaft.get(knot.parentShaftId) ?? [];
                hosted.push(knot);
                knotsByShaft.set(knot.parentShaftId, hosted);
            }
            for (const [id, spans] of removedSpans) spansByOwner.set(id, spans);
        };
        const preferredGraft = gridGraft(next, source, knotsByShaft, sharedRoots, socketJointIds);
        if (typeof preferredGraft === 'string') {
            restoreBraces();
            result.skipped.push({ supportId: source.id, reason: preferredGraft });
            continue;
        }
        const candidates = buildNearestCandidateNodeKeys(preferred, 1).map(key => ({ key,
            point: { ...gridSnappedXYFromKey(key, spacing), z: rootPos.z },
        })).toSorted((a, b) => distance3D(a.point, rootPos) - distance3D(b.point, rootPos) || a.key.localeCompare(b.key));
        let reason: GridSkipReason = 'movement-limit';
        for (const graft of [preferredGraft, ...(preferredGraft.fallbacks ?? [])]) {
            const retainedSegment = source.segments[graft.segmentIndex];
            for (const { key, point } of candidates) {
                if (distance3D(point, rootPos) > maxMove + EPS) continue;
                if (!insidePlate(point, root.diameter / 2, context.plateBounds)) { reason = 'out-of-bounds'; continue; }
                if (owners.occupied(key, source.id)) { reason = 'occupied-node'; continue; }
                const anchor = { ...point, z: graft.endpoints.start.z };
                const lateral = Math.hypot(point.x - graft.point.x, point.y - graft.point.y);
                // Use the existing routed-trunk 45° floor for long diagonals; an
                // explicitly tighter user limit is still respected.
                // Leave room for the two joint volumes even for a tiny snap. A
                // sub-diameter diagonal would make the vertical leg overlap the
                // retained shaft beyond its intentional graft junction.
                const lowerDiameter = Math.max(retainedSegment.diameter, retainedSegment.topJoint!.diameter);
                const knee = { ...anchor, z: graft.point.z - Math.max(lowerDiameter + 0.5,
                    lateral / Math.tan(maxAngle * Math.PI / 180)) };
                const spanLength = distance3D(knee, graft.point);
                if (knee.z < anchor.z + MIN_VERTICAL_LEG_MM
                    || memberDepartureAngleFromVerticalDeg(knee, graft.point) > Math.min(maxAngle,
                        getLengthAwareMaxAngleFromVerticalDeg(spanLength, maxAngle, maxAngle)) + EPS) {
                    reason = 'angle-limit'; continue;
                }
                if (result.candidateChecks >= GRID_MAX_CANDIDATE_CHECKS) { reason = 'search-limit'; break; }
                result.candidateChecks++;
                const shaftRadius = lowerDiameter / 2;
                const proposed = [
                    { start: point, end: anchor, radius: root.diameter / 2, isDiagonal: false },
                    { start: anchor, end: knee, radius: shaftRadius, isDiagonal: false },
                    { start: knee, end: graft.point, radius: shaftRadius, isDiagonal: true },
                ];
                const blocked = proposed.some(span => {
                    const crossesSupport = [...obstacleIndex.query(span.start, span.end, span.radius)].some(id =>
                        (spansByOwner.get(id) ?? []).some(other => {
                            if (id === source.rootId) return false;
                            if (id === source.id && other.segmentId && graft.fullyRemovedSegmentIds.has(other.segmentId)) return false;
                            const combined = span.radius + other.radius;
                            let end = span.end;
                            if (id === source.id && span.isDiagonal) end = interpolate(graft.point, knee, Math.min(1,
                                junctionTrim(knee, graft.point, graft.endpoints.start, graft.endpoints.end, combined) / spanLength));
                            const otherStart = id === source.id && other.segmentId === retainedSegment.id ? graft.point : other.start;
                            return segmentDistanceSq(span.start, end, otherStart, other.end) < combined * combined;
                        }));
                    return crossesSupport || collisionMeshes.some(mesh => isCollisionSegmentBlocked(span.start, span.end,
                        span.radius + SHAFT_CLEARANCE_MM, mesh));
                });
                if (blocked) { reason = 'collision'; continue; }
                const kneeJoint = { id: createId(`grid-${source.id}-knee`), pos: knee, diameter: retainedSegment.topJoint!.diameter };
                const graftJoint = graft.sourceT === 1 ? retainedSegment.topJoint!
                    : { id: createId(`grid-${source.id}-joint`), pos: graft.point, diameter: kneeJoint.diameter };
                const trunk: Trunk = { ...source, typeId: 'trunk', segments: [
                    { id: createId(`grid-${source.id}-leg`), diameter: retainedSegment.diameter, topJoint: kneeJoint },
                    ...(graft.sourceT === 1 ? [{ ...retainedSegment, bottomJoint: kneeJoint }] : [
                        { id: createId(`grid-${source.id}-diagonal`), diameter: retainedSegment.diameter, bottomJoint: kneeJoint, topJoint: graftJoint },
                        { ...retainedSegment, bottomJoint: graftJoint },
                    ]), ...source.segments.slice(graft.segmentIndex + 1),
                ] };
                next.trunks[source.id] = trunk;
                next.roots[root.id] = { ...root, transform: { ...root.transform, pos: point } };
                for (const hosted of graft.hostedKnots) next.knots[hosted.knot.id] = {
                    ...hosted.knot, t: (hosted.t - graft.sourceT) / (1 - graft.sourceT),
                };
                // Old broadphase cells may remain, but every query reads only the
                // replacement spans. Keeping ownership reservations is conservative.
                spansByOwner.delete(source.id);
                spansByOwner.delete(root.id);
                const single = { roots: next.roots, knots: next.knots } as SupportState;
                for (const descriptor of SUPPORT_TYPES) Object.assign(single, { [descriptor.location.key]: {} });
                single.trunks = { [source.id]: trunk };
                indexSpans(supportSpans(single, collisionModels));
                indexSpans([{ ownerId: root.id, start: point, end: anchor, radius: root.diameter / 2 }]);
                owners.add(source.id, [point]);
                changed.add(source.id);
                result.changedCount++;
                result.alignedTrunkCount++;
                result.removedAutoBraceCount += removedBraces.length;
                break;
            }
            if (changed.has(source.id) || result.candidateChecks >= GRID_MAX_CANDIDATE_CHECKS) break;
        }
        if (!changed.has(source.id)) {
            restoreBraces();
            result.skipped.push({ supportId: source.id, reason });
        }
    }
    if (result.changedCount === 0) return result;
    if (context.autoBracingSettings && result.removedAutoBraceCount > 0) {
        const existingBraces = new Set(Object.keys(next.braces));
        const existingKnots = new Set(Object.keys(next.knots));
        rebuildSelectedBraces(next, eligibleIds, context.autoBracingSettings, context.gridSettings, changed);
        const shaftOwners = new Map<string, string>();
        const parentRoots = new Map<string, string>();
        const generatedPairs = new Map<string, string>();
        for (const descriptor of SUPPORT_TYPES) for (const entity of Object.values(next[descriptor.location.key])) {
            if ('segments' in entity) for (const segment of entity.segments) shaftOwners.set(segment.id, entity.id);
            if ('rootId' in entity) parentRoots.set(entity.id, entity.rootId);
        }
        // Auto-bracing checks its parent mesh. Also require clearance from the
        // complete retained forest and neighbouring meshes before accepting a
        // regenerated link. Its two intentional host junctions are exempt.
        for (const brace of Object.values(next.braces).toSorted((a, b) => a.id.localeCompare(b.id))) {
            if (existingBraces.has(brace.id)) continue;
            const start = next.knots[brace.startKnotId], end = next.knots[brace.endKnotId];
            const startOwner = shaftOwners.get(start?.parentShaftId ?? '');
            const endOwner = shaftOwners.get(end?.parentShaftId ?? '');
            const pair = [startOwner, endOwner].sort().join(':');
            const radius = brace.profile.diameter / 2;
            const length = start && end ? distance3D(start.pos, end.pos) : 0;
            const blocked = !start || !end || length < EPS || [...obstacleIndex.query(start.pos, end.pos, radius)].some(id =>
                (spansByOwner.get(id) ?? []).some(other => {
                    // Crosses is an existing intentional brace pattern. Keep
                    // the generated X members of this same parent pair while
                    // still checking links between unrelated pairs.
                    if (generatedPairs.get(id) === pair) return false;
                    const combined = radius + other.radius;
                    let from = start.pos, to = end.pos;
                    const otherBrace = next.braces[id];
                    const sharedStart = otherBrace && [otherBrace.startKnotId, otherBrace.endKnotId].includes(start.id);
                    const sharedEnd = otherBrace && [otherBrace.startKnotId, otherBrace.endKnotId].includes(end.id);
                    const trim = Math.min(1, junctionTrim(start.pos, end.pos, other.start, other.end, combined) / length);
                    if (other.ownerId === startOwner || other.ownerId === parentRoots.get(startOwner ?? '') || sharedStart) from = interpolate(start.pos, end.pos, trim);
                    if (other.ownerId === endOwner || other.ownerId === parentRoots.get(endOwner ?? '') || sharedEnd) to = interpolate(end.pos, start.pos, trim);
                    return segmentDistanceSq(from, to, other.start, other.end) < combined * combined;
                })) || collisionMeshes.some(mesh => isCollisionSegmentBlocked(start.pos, end.pos, radius + SHAFT_CLEARANCE_MM, mesh));
            if (blocked) {
                delete next.braces[brace.id];
            } else {
                result.generatedAutoBraceCount++;
                generatedPairs.set(brace.id, pair);
                indexSpans([{ ownerId: brace.id, start: start.pos, end: end.pos, radius }]);
            }
        }
        const referenced = referencedKnots(next);
        for (const id of Object.keys(next.knots)) if (!existingKnots.has(id) && !referenced.has(id)) delete next.knots[id];
    }
    if (JSON.stringify(contacts(snapshot)) !== JSON.stringify(contacts(next))) throw new Error('Grid optimization must preserve every original contact');
    result.contactCountAfter = contacts(next, selected).length;
    syncSupportMap(next);
    result.snapshot = next;
    return result;
}
