import { msg } from '@lingui/core/macro';
import { buildGridOptimization, type GridOptimizationContext } from './gridOptimization';
import { createOptimizationPreview, type OptimizationPreviewContext, type OptimizationPreviewError } from './optimizationPreview';

export const GRID_HISTORY_LABEL = msg({ message: 'Grid optimization', context: 'Undo history entry' });
export interface GridPreviewContext extends OptimizationPreviewContext {
    plateBounds: GridOptimizationContext['plateBounds'] | null;
}
export type GridPreviewError = OptimizationPreviewError;

const controller = createOptimizationPreview({
    minimumTrunks: 1,
    historyLabel: GRID_HISTORY_LABEL,
    contextError: (context: GridPreviewContext) => context.plateBounds ? null : 'plate',
    build: (before, ids, options: Parameters<typeof buildGridOptimization>[2], context: GridPreviewContext, meshEntry, collisions) => buildGridOptimization(before, ids, options, {
        modelId: context.modelId!, mesh: meshEntry.mesh,
        plateId: context.plateId!, modelPlateId: context.modelPlateId!, plateBounds: context.plateBounds!,
        autoBracingSettings: context.autoBracingSettings, gridSettings: context.gridSettings,
        collisionMeshes: [...collisions.values()].map((entry) => entry.mesh), collisionModelIds: context.plateModelIds,
    }),
});
export const getGridPreview = controller.getPreview;
export const subscribeGridPreview = controller.subscribePreview;
export const getGridRenderSnapshot = controller.renderSnapshot;
export const cancelGridPreview = controller.cancel;
export const invalidateGridPreview = controller.invalidate;
export const gridSelectionError = controller.selectionError;
export const previewGridOptimization = controller.preview;
export const applyGridOptimization = controller.apply;
