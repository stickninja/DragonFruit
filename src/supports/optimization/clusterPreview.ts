import { msg } from '@lingui/core/macro';
import { subscribeHistory } from '@/history/historyStore';
import { getSnapshot, setSnapshot, subscribe } from '../state';
import type { SupportState } from '../types';
import { SUPPORT_COLLECTION_KEYS, SUPPORT_TYPES } from '../supportTypeRegistry';
import { clearSelectedSupportIds, getSelectedSupportIds, subscribeSupportMultiSelection } from '../interaction/supportMultiSelection';
import { getMeshEntryForAutoBrace, subscribeToAutoBraceMeshes } from '../autoBracing/meshGeometryStore';
import type { AutoBracingSettings } from '../autoBracing/settings';
import type { GridSettings } from '../Settings/types';
import { pushSupportHistory } from '../history/supportHistory';
import { SUPPORT_EDIT_REPLACE } from '../history/actionTypes';
import { buildClusterOptimization, type ClusterOptimizationOptions, type ClusterOptimizationResult } from './clusterOptimization';

export const CLUSTER_HISTORY_LABEL = msg({ message: 'Cluster optimization', context: 'Undo history entry' });

export interface ClusterPreviewContext {
    modelId: string | null;
    plateId: string | null;
    modelPlateId: string | null;
    plateModelIds: readonly string[];
    autoBracingSettings: AutoBracingSettings;
    gridSettings: GridSettings;
}

type Proposal = {
    before: SupportState;
    selectedIds: readonly string[];
    context: ClusterPreviewContext;
    options: ClusterOptimizationOptions;
    autoBracingKey: string;
    gridKey: string;
    meshEntry: NonNullable<ReturnType<typeof getMeshEntryForAutoBrace>>;
    collisionEntries: Map<string, NonNullable<ReturnType<typeof getMeshEntryForAutoBrace>>>;
    result: ClusterOptimizationResult;
};

export type ClusterPreviewError = 'selection' | 'model' | 'plate' | 'mesh' | 'failed';
type PreviewState = {
    proposal: Proposal | null;
    result: ClusterOptimizationResult | null;
    status: 'idle' | 'ready' | 'stale' | 'applied';
};

let state: PreviewState = { proposal: null, result: null, status: 'idle' };
const listeners = new Set<() => void>();
let cleanups: (() => void)[] = [];

export const getClusterPreview = () => state;
export function subscribeClusterPreview(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function publish(next: PreviewState) {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    state = next;
    listeners.forEach((listener) => listener());
}

function selectionMatches(ids: readonly string[]) {
    const current = getSelectedSupportIds();
    return ids.length === current.length && ids.every((id) => current.includes(id));
}

function proposalIsCurrent(proposal: Proposal) {
    const current = getSnapshot();
    return SUPPORT_COLLECTION_KEYS.every((key) => current[key] === proposal.before[key])
        && selectionMatches(proposal.selectedIds)
        && getMeshEntryForAutoBrace(proposal.context.modelId!) === proposal.meshEntry
        && proposal.context.plateModelIds.every((id) => getMeshEntryForAutoBrace(id)
            === (id === proposal.context.modelId ? proposal.meshEntry : proposal.collisionEntries.get(id)));
}

/** Only ephemeral rendering reads this proposal. Scene serialization reads the live store. */
export function getClusterRenderSnapshot(): SupportState | null {
    return state.proposal && proposalIsCurrent(state.proposal) ? state.proposal.result.snapshot : null;
}

export function cancelClusterPreview() {
    publish({ proposal: null, result: null, status: 'idle' });
}

export function invalidateClusterPreview() {
    if (state.status === 'applied') { cancelClusterPreview(); return; }
    if (!state.proposal) return;
    publish({ proposal: null, result: null, status: 'stale' });
}

export function clusterSelectionError(context: ClusterPreviewContext): ClusterPreviewError | null {
    const selectedIds = getSelectedSupportIds();
    const snapshot = getSnapshot();
    if (selectedIds.filter((id) => snapshot.trunks[id]).length < 2) return 'selection';
    if (!context.modelId || selectedIds.some((id) => {
        const entity = SUPPORT_TYPES.map((type) => snapshot[type.location.key][id]).find(Boolean);
        return !entity || !('modelId' in entity) || entity.modelId !== context.modelId;
    })) return 'model';
    if (!context.plateId || context.modelPlateId !== context.plateId) return 'plate';
    if (!getMeshEntryForAutoBrace(context.modelId)) return 'mesh';
    return null;
}

export function previewClusterOptimization(context: ClusterPreviewContext, options: ClusterOptimizationOptions): ClusterPreviewError | null {
    cancelClusterPreview();
    const error = clusterSelectionError(context);
    if (error) return error;
    const before = getSnapshot();
    const selectedIds = [...getSelectedSupportIds()];
    const meshEntry = getMeshEntryForAutoBrace(context.modelId!)!;
    const collisionEntries = new Map(context.plateModelIds.flatMap((id) => {
        const entry = getMeshEntryForAutoBrace(id);
        return entry && id !== context.modelId ? [[id, entry] as const] : [];
    }));
    let result: ClusterOptimizationResult;
    try {
        result = buildClusterOptimization(before, selectedIds, options, {
            modelId: context.modelId!, mesh: meshEntry.mesh,
            plateId: context.plateId!, modelPlateId: context.modelPlateId!,
            autoBracingSettings: context.autoBracingSettings,
            gridSettings: context.gridSettings,
            collisionMeshes: [...collisionEntries.values()].map((entry) => entry.mesh),
            collisionModelIds: context.plateModelIds,
        });
    } catch {
        return 'failed';
    }
    const proposal: Proposal = {
        before, selectedIds, context: { ...context, plateModelIds: [...context.plateModelIds] },
        options: { ...options }, meshEntry, collisionEntries, result,
        autoBracingKey: JSON.stringify(context.autoBracingSettings), gridKey: JSON.stringify(context.gridSettings),
    };
    publish({ proposal, result, status: 'ready' });
    const invalidateIfChanged = () => { if (!proposalIsCurrent(proposal)) invalidateClusterPreview(); };
    cleanups = [subscribe(invalidateIfChanged), subscribeSupportMultiSelection(invalidateIfChanged), subscribeToAutoBraceMeshes(invalidateIfChanged)];
    return null;
}

/** Revalidate the exact proposal, then commit one typed, synchronously undoable change. */
export function applyClusterOptimization(context: ClusterPreviewContext, options: ClusterOptimizationOptions): boolean {
    const proposal = state.proposal;
    if (!proposal) return false;
    if (!proposalIsCurrent(proposal) || clusterSelectionError(context)
        || context.modelId !== proposal.context.modelId || context.plateId !== proposal.context.plateId
        || context.modelPlateId !== proposal.context.modelPlateId
        || context.plateModelIds.length !== proposal.context.plateModelIds.length
        || context.plateModelIds.some((id) => !proposal.context.plateModelIds.includes(id))
        || JSON.stringify(context.autoBracingSettings) !== proposal.autoBracingKey
        || JSON.stringify(context.gridSettings) !== proposal.gridKey
        || options.reductionPercent !== proposal.options.reductionPercent
        || options.maxReachMm !== proposal.options.maxReachMm
        || options.maxJoinAngleDeg !== proposal.options.maxJoinAngleDeg) {
        invalidateClusterPreview();
        return false;
    }
    if (!proposal.result.changedCount || proposal.result.contactCountBefore !== proposal.result.contactCountAfter) return false;
    cancelClusterPreview();
    const before = structuredClone(proposal.before);
    const after = structuredClone(proposal.result.snapshot);
    before.selectedId = after.selectedId = null;
    before.selectedCategory = after.selectedCategory = null;
    before.hoveredId = after.hoveredId = null;
    before.hoveredCategory = after.hoveredCategory = 'none';
    clearSelectedSupportIds();
    setSnapshot(after);
    pushSupportHistory({ type: SUPPORT_EDIT_REPLACE, description: CLUSTER_HISTORY_LABEL, payload: { before, after } });
    publish({ proposal: null, result: proposal.result, status: 'applied' });
    const committed = getSnapshot();
    const clearAppliedIfChanged = () => {
        if (!SUPPORT_COLLECTION_KEYS.every((key) => getSnapshot()[key] === committed[key])
            || !selectionMatches([])) cancelClusterPreview();
    };
    // Subscribe after our own commit so later Undo, edits, or selections cannot
    // leave a completed reduction displayed for geometry that is no longer live.
    cleanups = [subscribe(clearAppliedIfChanged), subscribeSupportMultiSelection(clearAppliedIfChanged), subscribeHistory(cancelClusterPreview)];
    return true;
}
