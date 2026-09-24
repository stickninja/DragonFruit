/** Material-owned CTB timing. Model layer numbers are one-based, inclusive. */
export type CtbLayerTimingValues = {
  lightOffDelaySec: number;
  waitTimeBeforeCureSec: number;
  waitTimeAfterCureSec: number;
  waitTimeAfterLiftSec: number;
};

export type CtbTimingOverride = {
  id: string;
  startLayer: number;
  endLayer: number;
  values: Partial<CtbLayerTimingValues>;
};

export type CtbTimingConfigV1 = {
  enabled: boolean;
  defaults: { bottom: CtbLayerTimingValues; normal: CtbLayerTimingValues };
  overrides: CtbTimingOverride[];
  startupDummy: boolean;
};

export const CTB_TIMING_KEYS = [
  'lightOffDelaySec',
  'waitTimeBeforeCureSec',
  'waitTimeAfterCureSec',
  'waitTimeAfterLiftSec',
] as const satisfies readonly (keyof CtbLayerTimingValues)[];

const ZERO_TIMING: CtbLayerTimingValues = {
  lightOffDelaySec: 0,
  waitTimeBeforeCureSec: 0,
  waitTimeAfterCureSec: 0,
  waitTimeAfterLiftSec: 0,
};

function nonNegative(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function timingValues(input: unknown, fallback: CtbLayerTimingValues): CtbLayerTimingValues {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    lightOffDelaySec: nonNegative(source.lightOffDelaySec, fallback.lightOffDelaySec),
    waitTimeBeforeCureSec: nonNegative(source.waitTimeBeforeCureSec, fallback.waitTimeBeforeCureSec),
    waitTimeAfterCureSec: nonNegative(source.waitTimeAfterCureSec, fallback.waitTimeAfterCureSec),
    waitTimeAfterLiftSec: nonNegative(source.waitTimeAfterLiftSec, fallback.waitTimeAfterLiftSec),
  };
}

/** Undefined means the material has never opted into the new timing feature. */
export function sanitizeCtbTimingConfig(input: unknown): CtbTimingConfigV1 | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const source = input as Record<string, unknown>;
  const defaults = source.defaults && typeof source.defaults === 'object'
    ? source.defaults as Record<string, unknown> : {};
  const overrides = Array.isArray(source.overrides) ? source.overrides : [];
  return {
    enabled: source.enabled === true,
    defaults: {
      bottom: timingValues(defaults.bottom, ZERO_TIMING),
      normal: timingValues(defaults.normal, ZERO_TIMING),
    },
    overrides: overrides.flatMap((raw, index): CtbTimingOverride[] => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
      const rule = raw as Record<string, unknown>;
      const startLayer = Number(rule.startLayer);
      const endLayer = Number(rule.endLayer);
      if (!Number.isSafeInteger(startLayer) || !Number.isSafeInteger(endLayer)
        || startLayer < 1 || endLayer < startLayer) return [];
      const valuesSource = rule.values && typeof rule.values === 'object' && !Array.isArray(rule.values)
        ? rule.values as Record<string, unknown> : {};
      const values: Partial<CtbLayerTimingValues> = {};
      for (const key of CTB_TIMING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(valuesSource, key)) {
          const parsed = Number(valuesSource[key]);
          if (Number.isFinite(parsed) && parsed >= 0) values[key] = parsed;
        }
      }
      return [{
        id: typeof rule.id === 'string' && rule.id.trim() ? rule.id.trim() : `range-${index + 1}`,
        startLayer,
        endLayer,
        values,
      }];
    }),
    startupDummy: source.startupDummy === true,
  };
}

export function createCtbTimingConfig(bottom?: Partial<CtbLayerTimingValues>, normal?: Partial<CtbLayerTimingValues>): CtbTimingConfigV1 {
  return {
    enabled: false,
    defaults: {
      bottom: timingValues(bottom, ZERO_TIMING),
      normal: timingValues(normal, ZERO_TIMING),
    },
    overrides: [],
    startupDummy: false,
  };
}

export function resolveCtbTimingValues(config: CtbTimingConfigV1, modelLayerNumber: number, bottomLayerCount: number): CtbLayerTimingValues {
  const result = { ...(modelLayerNumber <= bottomLayerCount ? config.defaults.bottom : config.defaults.normal) };
  for (const rule of config.overrides) {
    if (modelLayerNumber < rule.startLayer || modelLayerNumber > rule.endLayer) continue;
    for (const key of CTB_TIMING_KEYS) {
      if (rule.values[key] !== undefined) result[key] = rule.values[key]!;
    }
  }
  return result;
}
