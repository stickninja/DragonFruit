import { CTB_MOTION_KEYS, type CtbTimingConfigV1 } from './ctbTiming';

/** User declaration for this printer's firmware, not an app-verified hardware test. */
export type CtbMotionCapability = { firmware: string; confirmed: boolean };

export function sanitizeCtbMotionCapability(input: unknown): CtbMotionCapability | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const source = input as Record<string, unknown>;
  const firmware = typeof source.firmware === 'string' ? source.firmware.trim() : '';
  return { firmware, confirmed: Boolean(firmware) && source.confirmed === true };
}

export function hasCtbMotionOverrides(config: CtbTimingConfigV1): boolean {
  return config.overrides.some((rule) => CTB_MOTION_KEYS.some((key) => rule.motion?.[key] !== undefined));
}

export function getCtbMotionCapabilityError(
  formatVersion: string, settingsMode: string, capability?: CtbMotionCapability,
): string | null {
  const version = formatVersion.trim().toLowerCase().replace(/^ctb/, '');
  if (!/^v?[45](enc)?$/.test(version) || !['simple', 'twostage'].includes(settingsMode.trim().toLowerCase())) {
    return 'Range motion overrides require CTB V4 or V5 (plain or encrypted) and Simple or Two Stage settings.';
  }
  if (!capability?.confirmed || !capability.firmware.trim()) {
    return 'Range motion overrides are unavailable until you identify the printer firmware and confirm that it supports per-layer motion in Printer Settings. Bottom and normal motion settings remain available. Remove range motion overrides or confirm support before export.';
  }
  return null;
}
