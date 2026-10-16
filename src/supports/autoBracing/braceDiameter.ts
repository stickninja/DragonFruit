import { normalizeAutoBracingSettings, type AutoBracingSettings } from './settings';

/** Parent diameters are evaluated on their shafts at the two attachment points. */
export function resolveAutoBraceDiameter(
    settings: Partial<AutoBracingSettings>,
    parentDiameterA: number,
    parentDiameterB: number,
): number {
    const normalized = normalizeAutoBracingSettings(settings);
    if (normalized.braceSizingMode === 'relative'
        && Number.isFinite(parentDiameterA) && parentDiameterA > 0
        && Number.isFinite(parentDiameterB) && parentDiameterB > 0) {
        return Math.min(parentDiameterA, parentDiameterB) * normalized.braceDiameterPercent / 100;
    }
    return normalized.braceDiameterMm;
}

export function buildBraceProfile(braceDiameterMm: number): { diameter: number } {
    return { diameter: braceDiameterMm };
}
