import { JOINT_DIAMETER_OFFSET_MM } from '../../constants';
import type { Brace, Knot } from '../../types';

/** Null leaves the legacy host-derived sizing path in charge. */
export function uniformBraceDiameterOf(brace: Brace): number | null {
    return brace.profile?.uniformDiameter ? Math.max(0.001, brace.profile.diameter) : null;
}

/** Shared by detail, batch and proxy rendering; legacy braces retain host taper. */
export function resolveBraceEndpointDiameters(brace: Brace, startKnot: Knot, endKnot: Knot) {
    const profileDiameter = Math.max(0.001, brace.profile?.diameter ?? 1);
    const hostDiameter = (knot: Knot) => uniformBraceDiameterOf(brace)
        ?? Math.min(profileDiameter, Math.max(
            0.001,
            (knot.diameter ?? (profileDiameter + JOINT_DIAMETER_OFFSET_MM)) - JOINT_DIAMETER_OFFSET_MM,
        ));
    return {
        startDiameter: hostDiameter(startKnot),
        endDiameter: hostDiameter(endKnot),
    };
}
