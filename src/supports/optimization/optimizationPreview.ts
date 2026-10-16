import type { MessageDescriptor } from '@lingui/core';
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
export interface OptimizationPreviewContext {
    isPlateLocked?: boolean;
    modelId: string | null;
    plateId: string | null;
    modelPlateId: string | null;
    plateModelIds: readonly string[];
    autoBracingSettings: AutoBracingSettings;
    gridSettings: GridSettings;
}

type Proposal<Options, Result, Context> = {
    before: SupportState;
    selectedIds: readonly string[];
    context: Context;
    options: Options;
    contextKey: string;
    optionsKey: string;
    meshEntry: NonNullable<ReturnType<typeof getMeshEntryForAutoBrace>>;
    collisionEntries: Map<string, NonNullable<ReturnType<typeof getMeshEntryForAutoBrace>>>;
    result: Result;
};

export type OptimizationPreviewError = 'selection' | 'model' | 'plate' | 'mesh' | 'locked' | 'failed';
type PreviewState<Options, Result, Context> = {
    proposal: Proposal<Options, Result, Context> | null;
    result: Result | null;
    status: 'idle' | 'ready' | 'stale' | 'applied';
};

type MeshEntry = NonNullable<ReturnType<typeof getMeshEntryForAutoBrace>>;
interface OptimizationResult {
    snapshot: SupportState;
    changedCount: number;
    contactCountBefore: number;
    contactCountAfter: number;
}

let active: { cancel: () => void; renderSnapshot: () => SupportState | null } | null = null;
let renderRevision = 0;
const renderListeners = new Set<() => void>();
export const getOptimizationPreviewRevision = () => renderRevision;
export function subscribeOptimizationPreview(listener: () => void) {
    renderListeners.add(listener);
    return () => { renderListeners.delete(listener); };
}
export const getOptimizationRenderSnapshot = () => active?.renderSnapshot() ?? null;

/** Shared ephemeral lifecycle; the active tool alone supplies scene rendering. */
export function createOptimizationPreview<Options extends object, Result extends OptimizationResult, Context extends OptimizationPreviewContext>(config: {
    minimumTrunks: number;
    historyLabel: MessageDescriptor;
    contextError?: (context: Context) => OptimizationPreviewError | null;
    build: (before: SupportState, ids: readonly string[], options: Options, context: Context, meshEntry: MeshEntry, collisions: Map<string, MeshEntry>) => Result;
}) {
    let state: PreviewState<Options, Result, Context> = { proposal: null, result: null, status: 'idle' };
    const listeners = new Set<() => void>();
    let cleanups: (() => void)[] = [];

    const getPreview = () => state;
    function subscribePreview(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }

    function publish(next: PreviewState<Options, Result, Context>) {
        cleanups.forEach((cleanup) => cleanup());
        cleanups = [];
        state = next;
        listeners.forEach((listener) => listener());
        renderRevision++;
        renderListeners.forEach((listener) => listener());
    }

    function selectionMatches(ids: readonly string[]) {
        const current = getSelectedSupportIds();
        return ids.length === current.length && ids.every((id) => current.includes(id));
    }

    function proposalIsCurrent(proposal: Proposal<Options, Result, Context>) {
        const current = getSnapshot();
        return SUPPORT_COLLECTION_KEYS.every((key) => current[key] === proposal.before[key])
            && selectionMatches(proposal.selectedIds)
            && getMeshEntryForAutoBrace(proposal.context.modelId!) === proposal.meshEntry
            && proposal.context.plateModelIds.every((id) => getMeshEntryForAutoBrace(id)
                === (id === proposal.context.modelId ? proposal.meshEntry : proposal.collisionEntries.get(id)));
    }

    /** Only ephemeral rendering reads this proposal. Scene serialization reads the live store. */
    function renderSnapshot(): SupportState | null {
        return state.proposal && proposalIsCurrent(state.proposal) ? state.proposal.result.snapshot : null;
    }

    function cancel() {
        publish({ proposal: null, result: null, status: 'idle' });
    }

    function invalidate() {
        if (state.status === 'applied') { cancel(); return; }
        if (!state.proposal) return;
        publish({ proposal: null, result: null, status: 'stale' });
    }

    function selectionError(context: Context): OptimizationPreviewError | null {
        if (context.isPlateLocked) return 'locked';
        const selectedIds = getSelectedSupportIds();
        const snapshot = getSnapshot();
        if (selectedIds.filter((id) => snapshot.trunks[id]).length < config.minimumTrunks) return 'selection';
        if (!context.modelId || selectedIds.some((id) => {
            const entity = SUPPORT_TYPES.map((type) => snapshot[type.location.key][id]).find(Boolean);
            return !entity || !('modelId' in entity) || entity.modelId !== context.modelId;
        })) return 'model';
        if (!context.plateId || context.modelPlateId !== context.plateId) return 'plate';
        if (!getMeshEntryForAutoBrace(context.modelId)) return 'mesh';
        return config.contextError?.(context) ?? null;
    }

    function preview(context: Context, options: Options): OptimizationPreviewError | null {
        active?.cancel();
        active = controller;
        cancel();
        const error = selectionError(context);
        if (error) return error;
        const before = getSnapshot();
        const selectedIds = [...getSelectedSupportIds()];
        const meshEntry = getMeshEntryForAutoBrace(context.modelId!)!;
        const collisionEntries = new Map(context.plateModelIds.flatMap((id) => {
            const entry = getMeshEntryForAutoBrace(id);
            return entry && id !== context.modelId ? [[id, entry] as const] : [];
        }));
        let result: Result;
        try {
            result = config.build(before, selectedIds, options, context, meshEntry, collisionEntries);
        } catch {
            return 'failed';
        }
        const proposal: Proposal<Options, Result, Context> = {
            before, selectedIds, context: structuredClone(context),
            options: { ...options }, meshEntry, collisionEntries, result,
            contextKey: contextKey(context), optionsKey: JSON.stringify(options),
        };
        publish({ proposal, result, status: 'ready' });
        const invalidateIfChanged = () => { if (!proposalIsCurrent(proposal)) invalidate(); };
        cleanups = [subscribe(invalidateIfChanged), subscribeSupportMultiSelection(invalidateIfChanged), subscribeToAutoBraceMeshes(invalidateIfChanged)];
        return null;
    }

    /** Revalidate the exact proposal, then commit one typed, synchronously undoable change. */
    function apply(context: Context, options: Options): boolean {
        const proposal = state.proposal;
        if (!proposal) return false;
        if (!proposalIsCurrent(proposal) || selectionError(context)
            || contextKey(context) !== proposal.contextKey
            || JSON.stringify(options) !== proposal.optionsKey) {
            invalidate();
            return false;
        }
        if (!proposal.result.changedCount || proposal.result.contactCountBefore !== proposal.result.contactCountAfter) return false;
        cancel();
        const before = structuredClone(proposal.before);
        const after = structuredClone(proposal.result.snapshot);
        before.selectedId = after.selectedId = null;
        before.selectedCategory = after.selectedCategory = null;
        before.hoveredId = after.hoveredId = null;
        before.hoveredCategory = after.hoveredCategory = 'none';
        clearSelectedSupportIds();
        setSnapshot(after);
        pushSupportHistory({ type: SUPPORT_EDIT_REPLACE, description: config.historyLabel, payload: { before, after } });
        publish({ proposal: null, result: proposal.result, status: 'applied' });
        const committed = getSnapshot();
        const clearAppliedIfChanged = () => {
            if (!SUPPORT_COLLECTION_KEYS.every((key) => getSnapshot()[key] === committed[key])
                || !selectionMatches([])) cancel();
        };
        // Subscribe after our own commit so later Undo, edits, or selections cannot
        // leave a completed result displayed for geometry that is no longer live.
        cleanups = [subscribe(clearAppliedIfChanged), subscribeSupportMultiSelection(clearAppliedIfChanged), subscribeHistory(cancel)];
        return true;
    }

    const controller = { getPreview, subscribePreview, renderSnapshot, cancel, invalidate, selectionError, preview, apply };
    return controller;
}

function contextKey(context: OptimizationPreviewContext) {
    return JSON.stringify({ ...context, plateModelIds: [...context.plateModelIds].sort() });
}
