import * as THREE from 'three';
import { initializeBVH } from '@/utils/bvh';
import { getSnapshot, setSnapshot } from '../../state';
import { setSelectedSupportIds } from '../../interaction/supportMultiSelection';
import { registerMeshForAutoBrace, unregisterMeshForAutoBrace } from '../../autoBracing/meshGeometryStore';
import { createDefaultAutoBracingSettings } from '../../autoBracing/settings';
import { clearHistory } from '@/history/historyStore';
import { cancelClusterPreview, type ClusterPreviewContext } from '../clusterPreview';
import { scene } from './clusterFixture';
import { createDefaultSettings } from '../../Settings/types';

initializeBVH();

export function clusterPreviewFixture() {
    const previous = getSnapshot();
    const geometry = new THREE.BoxGeometry(100, 100, 2);
    geometry.computeBoundsTree();
    const transform = new THREE.Matrix4().makeTranslation(0, 0, 24);
    registerMeshForAutoBrace('model', geometry, transform);
    setSnapshot(scene());
    setSelectedSupportIds(['a', 'b']);
    clearHistory();
    const context: ClusterPreviewContext = {
        modelId: 'model', plateId: 'plate', modelPlateId: 'plate', plateModelIds: ['model'],
        autoBracingSettings: createDefaultAutoBracingSettings(),
        gridSettings: createDefaultSettings().grid,
    };
    return {
        context, geometry, transform,
        cleanup() {
            cancelClusterPreview();
            unregisterMeshForAutoBrace('model');
            unregisterMeshForAutoBrace('neighbour');
            geometry.dispose();
            setSnapshot(previous);
            setSelectedSupportIds([]);
            clearHistory();
        },
    };
}
