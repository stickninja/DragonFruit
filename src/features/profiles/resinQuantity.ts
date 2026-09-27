export type ResinQuantityUnit = 'mL' | 'g' | 'kg';
export type ResinQuantity = { value: number; unit: ResinQuantityUnit };

export function positiveFinite(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    return value;
}

function numericInput(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export function sanitizeResinQuantity(input: unknown): ResinQuantity | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const source = input as Record<string, unknown>;
    if (source.unit !== 'mL' && source.unit !== 'g' && source.unit !== 'kg') return undefined;
    const value = numericInput(source.value);
    // Preserve the selected unit even when its value is invalid; an invalid
    // weight must never fall back to the legacy millilitre capacity for cost.
    return { value: value != null && value > 0 ? value : 0, unit: source.unit };
}

export function sanitizeUncuredDensityGPerMl(input: unknown): number | undefined {
    const value = numericInput(input);
    return positiveFinite(value) ?? undefined;
}

export function resinQuantityVolumeMl(
    quantity: ResinQuantity | undefined,
    legacyBottleCapacityMl: number,
    uncuredDensityGPerMl?: number,
): number | null {
    if (!quantity) return positiveFinite(legacyBottleCapacityMl);
    const value = positiveFinite(quantity.value);
    if (value == null) return null;
    if (quantity.unit === 'mL') return value;
    const density = positiveFinite(uncuredDensityGPerMl);
    if (density == null) return null;
    const volumeMl = (quantity.unit === 'kg' ? value * 1000 : value) / density;
    return positiveFinite(volumeMl);
}

/** A zero value asks the user to re-enter the amount when density is unavailable. */
export function convertResinQuantityUnit(
    quantity: ResinQuantity,
    unit: ResinQuantityUnit,
    uncuredDensityGPerMl?: number,
): ResinQuantity {
    if (quantity.unit === unit) return { ...quantity };
    const validValue = positiveFinite(quantity.value);
    const density = positiveFinite(uncuredDensityGPerMl);
    if (validValue == null) return { value: 0, unit };
    if (quantity.unit === 'mL' && density == null) return { value: 0, unit };
    if (unit === 'mL' && density == null) return { value: 0, unit };
    const grams = quantity.unit === 'mL' ? validValue * density!
        : quantity.unit === 'kg' ? validValue * 1000 : validValue;
    const converted = unit === 'mL' ? grams / density!
        : unit === 'kg' ? grams / 1000 : grams;
    return { value: positiveFinite(converted) ?? 0, unit };
}

export function resinPrintEstimate(
    printVolumeMl: number,
    bottlePrice: number,
    quantity: ResinQuantity | undefined,
    legacyBottleCapacityMl: number,
    uncuredDensityGPerMl?: number,
): { volumeMl: number | null; massG: number | null; cost: number | null } {
    const volumeMl = Number.isFinite(printVolumeMl) && printVolumeMl >= 0 ? printVolumeMl : null;
    const density = positiveFinite(uncuredDensityGPerMl);
    const bottleVolumeMl = resinQuantityVolumeMl(quantity, legacyBottleCapacityMl, uncuredDensityGPerMl);
    const validPrice = Number.isFinite(bottlePrice) && bottlePrice >= 0;
    const massG = volumeMl != null && density != null ? volumeMl * density : null;
    const cost = volumeMl != null && bottleVolumeMl != null && validPrice ? volumeMl / bottleVolumeMl * bottlePrice : null;
    return {
        volumeMl,
        massG: massG != null && Number.isFinite(massG) ? massG : null,
        cost: cost != null && Number.isFinite(cost) ? cost : null,
    };
}

export function formatResinEstimateLabel(
    printVolumeMl: number,
    profile?: {
        bottlePrice: number;
        bottleCapacityMl: number;
        resinQuantity?: ResinQuantity;
        uncuredDensityGPerMl?: number;
        currencyCode: string;
    } | null,
): string {
    if (!Number.isFinite(printVolumeMl) || printVolumeMl < 0) return '—';
    const parts = [`${printVolumeMl.toFixed(2)} mL`];
    if (!profile) return parts[0];
    const estimate = resinPrintEstimate(
        printVolumeMl, profile.bottlePrice, profile.resinQuantity,
        profile.bottleCapacityMl, profile.uncuredDensityGPerMl,
    );
    if (estimate.massG != null) parts.push(`${estimate.massG.toFixed(2)} g`);
    if (estimate.cost != null) {
        parts.push(`${(profile.currencyCode || 'USD').toUpperCase()} ${estimate.cost.toFixed(2)}`);
    } else {
        parts.push(profile.resinQuantity?.unit !== 'mL' && profile.resinQuantity
            && positiveFinite(profile.uncuredDensityGPerMl) == null ? 'cost needs density' : 'cost unavailable');
    }
    return parts.join(' · ');
}
