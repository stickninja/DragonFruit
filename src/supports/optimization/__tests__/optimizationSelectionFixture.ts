import { collectSupportMarqueeShapes } from '@/components/scene/SceneCanvas/supportMarqueeShapes';
import { getSnapshot, setSnapshot } from '../../state';

/** A same-model marquee catches roots as well as trunks and their dependents. */
export function addMarqueeDependents() {
    const before = getSnapshot();
    const a = before.roots['root-a'].transform.pos;
    const b = before.roots['root-b'].transform.pos;
    setSnapshot({
        ...before,
        knots: {
            ...before.knots,
            'knot-a': { id: 'knot-a', parentShaftId: 'seg-a', t: 0.5, pos: { ...a, z: 10 }, diameter: 1.2 },
            'knot-b': { id: 'knot-b', parentShaftId: 'seg-b', t: 0.5, pos: { ...b, z: 10 }, diameter: 1.2 },
        },
        branches: {
            ...before.branches,
            branch: {
                id: 'branch', typeId: 'branch', modelId: 'model', parentKnotId: 'knot-a',
                segments: [{ id: 'seg-branch', diameter: 1.2,
                    topJoint: { id: 'joint-branch', pos: { ...a, y: 2, z: 20 }, diameter: 1.3 } }],
                contactCone: { ...before.trunks.a.contactCone!, id: 'cone-branch',
                    pos: { ...a, y: 2, z: 23 }, socketJointId: 'joint-branch' },
            },
        },
        braces: {
            ...before.braces,
            brace: { id: 'brace', typeId: 'brace', modelId: 'model',
                startKnotId: 'knot-a', endKnotId: 'knot-b', profile: { diameter: 0.8 } },
        },
    });
    return collectSupportMarqueeShapes(getSnapshot()).map((shape) => shape.id);
}
