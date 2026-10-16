import { getSnapshot, setSnapshot } from '../../state';
import { setSelectedSupportIds } from '../../interaction/supportMultiSelection';
import { cancelGridPreview, type GridPreviewContext } from '../gridPreview';
import { clusterPreviewFixture } from './clusterPreviewFixture';
import { scene } from './clusterFixture';

export function gridPreviewFixture() {
    const base = clusterPreviewFixture();
    setSnapshot(scene([0.7, 4]));
    setSelectedSupportIds(['a', 'b']);
    const context: GridPreviewContext = { ...base.context, plateBounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 } };
    return { ...base, context, original: getSnapshot(), cleanup() { cancelGridPreview(); base.cleanup(); } };
}
