import type * as THREE from 'three';
import type { AutoBracingSettings } from '../autoBracing/settings';
import type { GridSettings } from '../Settings/types';
import { isCollisionSegmentBlocked } from '../PlacementLogic/CollisionAvoidance';
import { segmentDistanceSq } from '../PlacementLogic/segmentDistance';
import {
    distance3D, getLengthAwareMaxAngleFromVerticalDeg, memberDepartureAngleFromVerticalDeg,
} from '../PlacementLogic/smartPlacementSearchUtils';
import { resolveSegmentEndpoints } from '../SupportPrimitives/Knot/segmentEndpoints';
import { SUPPORT_TYPES } from '../supportTypeRegistry';
import type { Branch, Knot, Segment, SupportState, Trunk } from '../types';

import {
    contacts, contactSocketJointIds, copyCollections, finitePoint, interpolate, junctionTrim,
    rebuildSelectedBraces, removeInternalAutoBraces, sourceGraft, SpanIndex,
    supportSpans, syncSupportMap, uniqueIdFactory, type SupportSpan,
} from './optimizationGeometry';

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
    const socketJointIds = contactSocketJointIds(next);
    // Stable ordering makes repeated previews and saves reproducible.
    const ordered = eligible.toSorted((a, b) => a.id.localeCompare(b.id));
    for (const source of ordered) {
        if (result.remainingTrunkCount <= target) break;
        if (keepers.has(source.id)) continue;
        const preferredGraft = sourceGraft(next, source, knotsByShaft, sharedRoots, socketJointIds);
        if (typeof preferredGraft === 'string') {
            result.skipped.push({ supportId: source.id, reason: preferredGraft });
            continue;
        }
        let attached = false;
        let collision = false;
        const sourceRoot = next.roots[source.rootId];
        for (const graft of [preferredGraft, ...(preferredGraft.fallbacks ?? [])]) {
            const retainedSegment = source.segments[graft.segmentIndex];
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
                    if (segment.type === 'bezier' || segment.diameter + EPS < retainedSegment.diameter) continue;
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
                        const clearance = retainedSegment.diameter / 2 + SHAFT_CLEARANCE_MM;
                        const crossesSupport = [...obstacleIndex.query(position, graft.point, clearance)].some(id =>
                            (spansByOwner.get(id) ?? []).some(other => {
                                if (id === source.id && other.segmentId && graft.fullyRemovedSegmentIds.has(other.segmentId)) return false;
                                const combined = retainedSegment.diameter / 2 + other.radius;
                                // Only the intentional junction volumes overlap. Test the
                                // rest of this same host/source too, including their bends.
                                let from = position, to = graft.point;
                                if (id === host.id) from = interpolate(position, graft.point, Math.min(1,
                                    junctionTrim(position, graft.point, ends.start, ends.end, combined) / span));
                                if (id === source.id) {
                                    // The consumed prefix is absent; only the retained
                                    // terminal span starts at the graft.
                                    to = interpolate(graft.point, position, Math.min(1,
                                        junctionTrim(position, graft.point, graft.endpoints.start, graft.endpoints.end, combined) / span));
                                }
                                const otherStart = id === source.id && other.segmentId === retainedSegment.id
                                    ? graft.point : other.start;
                                return segmentDistanceSq(from, to, otherStart, other.end) < combined * combined;
                            }));
                        if (crossesSupport || collisionMeshes.some(mesh => isCollisionSegmentBlocked(position, graft.point, clearance, mesh))) {
                            collision = true;
                            continue;
                        }
                        const knot: Knot = { id: createId(`cluster-${source.id}-knot`), parentShaftId: segment.id,
                            t, pos: position, diameter: segment.diameter + 0.1 };
                        let lowerSegments: Segment[];
                        if (graft.sourceT === 1) {
                            const diagonal = { ...retainedSegment };
                            delete diagonal.bottomJoint;
                            lowerSegments = [diagonal];
                        } else {
                            const joint = { id: createId(`cluster-${source.id}-joint`), pos: graft.point,
                                diameter: retainedSegment.topJoint!.diameter };
                            lowerSegments = [{ id: createId(`cluster-${source.id}-shaft`),
                                diameter: retainedSegment.diameter, topJoint: joint },
                            { ...retainedSegment, bottomJoint: joint }];
                        }
                        const common: Omit<Trunk, 'rootId' | 'baseDiameterMm'> & { rootId?: string; baseDiameterMm?: number } = { ...source };
                        delete common.rootId;
                        delete common.baseDiameterMm;
                        const branch: Branch = { ...common, typeId: 'branch', parentKnotId: knot.id,
                            segments: [...lowerSegments, ...source.segments.slice(graft.segmentIndex + 1)] };
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
