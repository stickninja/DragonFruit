import { msg } from '@lingui/core/macro';
import { buildClusterOptimization } from './clusterOptimization';
import { createOptimizationPreview, type OptimizationPreviewContext, type OptimizationPreviewError } from './optimizationPreview';

export const CLUSTER_HISTORY_LABEL = msg({ message: 'Cluster optimization', context: 'Undo history entry' });
export type ClusterPreviewContext = OptimizationPreviewContext;
export type ClusterPreviewError = OptimizationPreviewError;

const controller = createOptimizationPreview({
    minimumTrunks: 2,
    historyLabel: CLUSTER_HISTORY_LABEL,
    build: (before, ids, options: Parameters<typeof buildClusterOptimization>[2], context: ClusterPreviewContext, meshEntry, collisions) => buildClusterOptimization(before, ids, options, {
        modelId: context.modelId!, mesh: meshEntry.mesh,
        plateId: context.plateId!, modelPlateId: context.modelPlateId!,
        autoBracingSettings: context.autoBracingSettings, gridSettings: context.gridSettings,
        collisionMeshes: [...collisions.values()].map((entry) => entry.mesh), collisionModelIds: context.plateModelIds,
    }),
});
export const getClusterPreview = controller.getPreview;
export const subscribeClusterPreview = controller.subscribePreview;
export const getClusterRenderSnapshot = controller.renderSnapshot;
export const cancelClusterPreview = controller.cancel;
export const invalidateClusterPreview = controller.invalidate;
export const clusterSelectionError = controller.selectionError;
export const previewClusterOptimization = controller.preview;
export const applyClusterOptimization = controller.apply;
