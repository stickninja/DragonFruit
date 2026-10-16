import * as THREE from 'three';
import { SUPPORT_TYPES } from '../../supportTypeRegistry';
import type { Roots, SupportState, Trunk } from '../../types';

export function scene(xs = [0, 4]): SupportState {
    const state = { roots: {}, knots: {}, selectedId: null, hoveredId: null } as unknown as SupportState;
    for (const descriptor of SUPPORT_TYPES) Object.assign(state, { [descriptor.location.key]: {} });
    xs.forEach((x, index) => {
        const id = String.fromCharCode(97 + index);
        const root: Roots = { id: `root-${id}`, modelId: 'model', diameter: 3, diskHeight: 0.5, coneHeight: 1.5,
            transform: { pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } } };
        const trunk: Trunk = { id, typeId: 'trunk', modelId: 'model', rootId: root.id,
            segments: [{ id: `seg-${id}`, diameter: 1.2,
                topJoint: { id: `socket-${id}`, pos: { x, y: 0, z: 20 }, diameter: 1.3 } }],
            contactCone: { id: `cone-${id}`, pos: { x, y: 0, z: 23 }, normal: { x: 0, y: 0, z: -1 },
                surfaceNormal: { x: 0, y: 0, z: -1 }, placementSurface: 'exterior', socketJointId: `socket-${id}`,
                profile: { contactDiameterMm: 0.4, bodyDiameterMm: 1.2, lengthMm: 3, penetrationMm: 0.05 } } };
        state.roots[root.id] = root;
        state.trunks[id] = trunk;
    });
    return state;
}

export function boxMesh(width = 100, depth = 100, height = 2, x = 0, y = 0, z = 24): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, depth, height);
    geometry.computeBoundsTree();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    mesh.updateMatrixWorld(true);
    return mesh;
}
