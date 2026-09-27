import {
  CTB_TIMING_KEYS,
  CTB_MOTION_KEYS,
  resolveCtbTimingValues,
  type CtbTimingConfigV1,
  type CtbLayerTimingValues,
  type CtbMotion,
} from './ctbTiming';
import { getCtbMotionCapabilityError, hasCtbMotionOverrides, type CtbMotionCapability } from './ctbMotionCapability';
export type { CtbMotion } from './ctbTiming';

export type CtbResolvedLayer = {
  modelLayerNumber: number | null;
  positionZMm: number;
  exposureSec: number;
  lightOffDelaySec: number;
  waitTimeBeforeCureSec: number;
  waitTimeAfterCureSec: number;
  waitTimeAfterLiftSec: number;
  liftDistanceMm: number;
  liftDistance2Mm: number;
  liftSpeedMmMin: number;
  liftSpeed2MmMin: number;
  retractDistance2Mm: number;
  retractSpeedMmMin: number;
  retractSpeed2MmMin: number;
  pwm: number;
  isDummy: boolean;
};

export type CtbLayerPlanV1 = {
  version: 1;
  modelLayerCount: number;
  startupDummy: boolean;
  bottomDefaults: CtbLayerTimingValues;
  normalDefaults: CtbLayerTimingValues;
  layers: CtbResolvedLayer[];
};

export type CtbLayerPlanInput = {
  metadata: Record<string, unknown>;
  config: CtbTimingConfigV1;
  modelLayerCount: number;
  layerHeightMm: number;
  settingsMode: string;
  formatVersion: string;
  motionCapability?: CtbMotionCapability;
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function readOptionalNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const ctb = object(metadata.ctb);
  const exportCtb = object(object(metadata.export).ctb);
  const value = [ctb[key], object(ctb.timing)[key], exportCtb[key], object(exportCtb.timing)[key], object(metadata.material)[key]]
    .find((candidate) => typeof candidate === 'number' && Number.isFinite(candidate));
  return value as number | undefined;
}

function readNumber(metadata: Record<string, unknown>, key: string): number {
  return readOptionalNumber(metadata, key) ?? 0;
}

function resolveMotion(metadata: Record<string, unknown>, bottom: boolean, mode: string): CtbMotion {
  const normalLift1 = readNumber(metadata, 'liftDistanceMm');
  const normalLift2 = readOptionalNumber(metadata, 'liftDistance2Mm') ?? normalLift1;
  const normalLiftSpeed1 = readNumber(metadata, 'liftSpeedMmMin');
  const normalLiftSpeed2 = readOptionalNumber(metadata, 'liftSpeed2MmMin') ?? normalLiftSpeed1;
  const normalRetract1 = readNumber(metadata, 'retractSpeedMmMin');
  const normalRetract2 = readOptionalNumber(metadata, 'retractSpeed2MmMin') ?? normalRetract1;
  const bottomLift1 = readNumber(metadata, 'bottomLiftDistanceMm');
  const bottomLift2 = readOptionalNumber(metadata, 'bottomLiftDistance2Mm') ?? bottomLift1;
  const bottomLiftSpeed1 = readNumber(metadata, 'bottomLiftSpeedMmMin');
  const bottomLiftSpeed2 = readOptionalNumber(metadata, 'bottomLiftSpeed2MmMin') ?? bottomLiftSpeed1;
  const bottomRetract1 = readOptionalNumber(metadata, 'bottomRetractSpeedMmMin') ?? normalRetract1;
  const bottomRetract2 = readOptionalNumber(metadata, 'bottomRetractSpeed2MmMin') ?? normalRetract2;
  const normalRetractDistance2 = readOptionalNumber(metadata, 'retractDistance2Mm')
    ?? readOptionalNumber(metadata, 'retractDistanceMm') ?? normalLift1;
  const bottomRetractDistance2 = readOptionalNumber(metadata, 'bottomRetractHeight2Mm') ?? normalRetractDistance2;
  const singleStage = mode === 'simple' || mode === 'allfields';
  return {
    liftDistanceMm: bottom ? bottomLift1 : normalLift1,
    liftDistance2Mm: singleStage ? 0 : bottom ? bottomLift2 : normalLift2,
    liftSpeedMmMin: bottom ? bottomLiftSpeed1 : normalLiftSpeed1,
    liftSpeed2MmMin: singleStage ? 0 : bottom ? bottomLiftSpeed2 : normalLiftSpeed2,
    retractDistance2Mm: singleStage ? 0 : Math.min(bottom ? bottomRetractDistance2 : normalRetractDistance2,
      (bottom ? bottomLift1 + bottomLift2 : normalLift1 + normalLift2)),
    retractSpeedMmMin: bottom ? bottomRetract1 : normalRetract1,
    retractSpeed2MmMin: singleStage ? 0 : bottom ? bottomRetract2 : normalRetract2,
  };
}

export function isCtbTimingPlanSupported(formatVersion: string, settingsMode: string): boolean {
  const version = formatVersion.trim().toLowerCase().replace(/^ctb/, '');
  return /^v?[45](enc)?$/.test(version)
    && ['simple', 'twostage', 'allfields'].includes(settingsMode.trim().toLowerCase());
}

export function validateCtbTimingConfigForExport(
  config: CtbTimingConfigV1,
  modelLayerCount: number,
  formatVersion: string,
  settingsMode: string,
  motionCapability?: CtbMotionCapability,
): void {
  if (!config.enabled) throw new Error('CTB timing plan is disabled for this material.');
  if (!isCtbTimingPlanSupported(formatVersion, settingsMode)) {
    throw new Error(`CTB timing requires V4/V5 and Simple, Two Stage, or All Fields mode (selected: ${formatVersion}, ${settingsMode}).`);
  }
  if (hasCtbMotionOverrides(config)) {
    const error = getCtbMotionCapabilityError(formatVersion, settingsMode, motionCapability);
    if (error) throw new Error(error);
  }
  if (!Number.isSafeInteger(modelLayerCount) || modelLayerCount < 1 || modelLayerCount > 1_000_000) {
    throw new Error('CTB timing requires a positive model layer count.');
  }
  for (const kind of ['bottom', 'normal'] as const) {
    for (const key of CTB_TIMING_KEYS) {
      const value = config.defaults[kind][key];
      if (!Number.isFinite(value) || value < 0) throw new Error(`CTB ${kind} ${key} must be a nonnegative finite number.`);
    }
  }
  const ids = new Set<string>();
  for (let index = 0; index < config.overrides.length; index++) {
    const rule = config.overrides[index]!;
    if (!rule.id || ids.has(rule.id)) throw new Error(`CTB timing range ${index + 1} has a missing or duplicate ID.`);
    ids.add(rule.id);
    if (rule.pwmPercent !== undefined && (!Number.isFinite(rule.pwmPercent) || rule.pwmPercent < 0 || rule.pwmPercent > 100)) {
      throw new Error(`CTB PWM range ${index + 1} must be a finite percentage from 0 to 100.`);
    }
    if (!Number.isSafeInteger(rule.startLayer) || !Number.isSafeInteger(rule.endLayer)
      || rule.startLayer < 1 || rule.endLayer < rule.startLayer || rule.endLayer > modelLayerCount) {
      throw new Error(`CTB timing range ${index + 1} must use inclusive model layers from 1 to ${modelLayerCount}.`);
    }
    for (const key of CTB_TIMING_KEYS) {
      const value = rule.values[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new Error(`CTB timing range ${index + 1} ${key} must be a nonnegative finite number.`);
      }
    }
    for (const key of CTB_MOTION_KEYS) {
      const value = rule.motion?.[key];
      if (value === undefined) continue;
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`CTB motion range ${index + 1} ${key} must be a nonnegative finite number.`);
      }
      if (settingsMode.trim().toLowerCase() === 'simple' && STAGE_TWO_KEYS.includes(key) && value !== 0) {
        throw new Error(`CTB motion range ${index + 1} contains Two Stage values. Select Two Stage mode or clear its stage-two overrides.`);
      }
    }
  }
}

const STAGE_TWO_KEYS: readonly (keyof CtbMotion)[] = [
  'liftDistance2Mm', 'liftSpeed2MmMin', 'retractDistance2Mm', 'retractSpeed2MmMin',
];

export function validateCtbMotion(motion: CtbMotion, label = 'CTB motion'): void {
  for (const key of CTB_MOTION_KEYS) {
    if (!Number.isFinite(motion[key]) || motion[key] < 0) {
      throw new Error(`${label}: ${key} must be a nonnegative finite number.`);
    }
  }
  const totalLift = motion.liftDistanceMm + motion.liftDistance2Mm;
  if (!Number.isFinite(totalLift) || motion.retractDistance2Mm > totalLift) {
    throw new Error(`${label}: stage-two retract distance must not exceed total lift distance.`);
  }
  for (const [distance, speed] of [
    [motion.liftDistanceMm, motion.liftSpeedMmMin],
    [motion.liftDistance2Mm, motion.liftSpeed2MmMin],
    [totalLift - motion.retractDistance2Mm, motion.retractSpeedMmMin],
    [motion.retractDistance2Mm, motion.retractSpeed2MmMin],
  ]) {
    if (distance! > 0 && speed! <= 0) throw new Error(`${label}: every stage with travel requires a positive speed.`);
  }
}

export function resolveCtbMotion(
  metadata: Record<string, unknown>, settingsMode: string, config: CtbTimingConfigV1, modelLayerNumber: number,
): CtbMotion {
  const mode = settingsMode.trim().toLowerCase();
  const result = resolveMotion(metadata, modelLayerNumber <= Math.trunc(readNumber(metadata, 'bottomLayerCount')), mode);
  for (const rule of config.overrides) {
    if (modelLayerNumber < rule.startLayer || modelLayerNumber > rule.endLayer) continue;
    for (const key of CTB_MOTION_KEYS) {
      const value = rule.motion?.[key];
      if (value === undefined) continue;
      if (mode !== 'twostage' && STAGE_TWO_KEYS.includes(key) && value !== 0) {
        throw new Error(`Model layer ${modelLayerNumber}: select Two Stage mode or clear stage-two motion overrides.`);
      }
      result[key] = value;
    }
  }
  validateCtbMotion(result, `Model layer ${modelLayerNumber}`);
  return result;
}

export type CtbMotionGroup = { startLayer: number; endLayer: number; motion: CtbMotion };

/** Partition at defaults/range boundaries, without allocating one object per layer. */
export function getCtbMotionGroupsForCalculator(
  metadata: Record<string, unknown>, settingsMode: string, config: CtbTimingConfigV1,
  startLayer: number, endLayer: number,
): CtbMotionGroup[] {
  if (!Number.isSafeInteger(startLayer) || !Number.isSafeInteger(endLayer) || startLayer < 1 || endLayer < startLayer) {
    throw new Error('Choose an inclusive model-layer range beginning at layer 1 or later.');
  }
  const boundaries = new Set([startLayer, endLayer + 1]);
  const add = (n: number) => { if (n > startLayer && n <= endLayer) boundaries.add(n); };
  add(Math.trunc(readNumber(metadata, 'bottomLayerCount')) + 1);
  for (const rule of config.overrides) { add(rule.startLayer); add(rule.endLayer + 1); }
  const points = [...boundaries].sort((a, b) => a - b);
  const groups: CtbMotionGroup[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const motion = resolveCtbMotion(metadata, settingsMode, config, points[i]!);
    const previous = groups.at(-1);
    if (previous && CTB_MOTION_KEYS.every((key) => previous.motion[key] === motion[key])) previous.endLayer = points[i + 1]! - 1;
    else groups.push({ startLayer: points[i]!, endLayer: points[i + 1]! - 1, motion });
  }
  return groups;
}

/** Mirrors UVtools' constant-speed lift/retract calculator; explicit waits stay independent. */
export function calculateLightOffDelaySec(targetPreExposureRestSec: number, motion: CtbMotion, motionTimeCorrectionSec = 0): number {
  validateCtbMotion(motion);
  const travel = (distance: number, speed: number) => distance > 0 && speed > 0 ? 60 * distance / speed : 0;
  const retract1Distance = Math.max(0, motion.liftDistanceMm + motion.liftDistance2Mm - motion.retractDistance2Mm);
  const raw = Math.max(0, targetPreExposureRestSec) + Math.max(0, motionTimeCorrectionSec)
    + travel(motion.liftDistanceMm, motion.liftSpeedMmMin)
    + travel(motion.liftDistance2Mm, motion.liftSpeed2MmMin)
    + travel(motion.retractDistance2Mm, motion.retractSpeed2MmMin)
    + travel(retract1Distance, motion.retractSpeedMmMin);
  return Math.round(raw * 100) / 100;
}

export function getCtbMotionForCalculator(metadata: Record<string, unknown>, settingsMode: string, bottom: boolean): CtbMotion {
  return resolveMotion(metadata, bottom, settingsMode.trim().toLowerCase());
}

/** Returns file-order CTB records. Call only for an explicitly enabled material timing config. */
export function buildCtbLayerPlan(input: CtbLayerPlanInput): CtbLayerPlanV1 {
  const { metadata, config, modelLayerCount, layerHeightMm } = input;
  const mode = input.settingsMode.trim().toLowerCase();
  validateCtbTimingConfigForExport(config, modelLayerCount, input.formatVersion, mode, input.motionCapability);
  if (!Number.isFinite(layerHeightMm) || layerHeightMm <= 0) {
    throw new Error('CTB timing requires a positive layer height.');
  }
  const bottomCount = Math.min(modelLayerCount, Math.trunc(readNumber(metadata, 'bottomLayerCount')));
  const transitionCount = Math.trunc(readNumber(metadata, 'transitionLayerCount'));
  const bottomExposure = readNumber(metadata, 'bottomExposureSec');
  const normalExposure = readNumber(metadata, 'normalExposureSec');
  const normalPwm = readOptionalNumber(metadata, 'projectorPwmPercent') ?? 100;
  const bottomPwm = readOptionalNumber(metadata, 'bottomProjectorPwmPercent')
    ?? readOptionalNumber(metadata, 'bottomLayerProjectorPwmPercent') ?? 100;
  const layers: CtbResolvedLayer[] = [];
  for (let modelLayerNumber = 1; modelLayerNumber <= modelLayerCount; modelLayerNumber++) {
    const bottom = modelLayerNumber <= bottomCount;
    const transitionIndex = modelLayerNumber - bottomCount;
    const exposureSec = bottom ? bottomExposure
      : transitionIndex <= transitionCount && transitionCount > 0
        ? bottomExposure + (normalExposure - bottomExposure) * transitionIndex / transitionCount
        : normalExposure;
    const waits = resolveCtbTimingValues(config, modelLayerNumber, bottomCount);
    // Preserve legacy zero/missing defaults, while an explicit range zero is off.
    let pwmPercent = (bottom ? bottomPwm : normalPwm) || 100;
    for (const rule of config.overrides) {
      if (modelLayerNumber >= rule.startLayer && modelLayerNumber <= rule.endLayer && rule.pwmPercent !== undefined) {
        pwmPercent = rule.pwmPercent;
      }
    }
    layers.push({
      modelLayerNumber,
      positionZMm: modelLayerNumber * layerHeightMm,
      exposureSec,
      ...waits,
      ...resolveCtbMotion(metadata, mode, config, modelLayerNumber),
      pwm: Math.max(0, Math.min(255, Math.round(pwmPercent * 255 / 100))),
      isDummy: false,
    });
  }
  if (config.startupDummy) {
    const first = layers[0]!;
    // Startup motion belongs to the firmware prelude, never model-layer ranges.
    const dummyMotion = resolveMotion(metadata, 1 <= bottomCount, mode);
    layers.unshift({
      ...first,
      ...dummyMotion,
      modelLayerNumber: null,
      positionZMm: first.positionZMm,
      exposureSec: 0.01,
      lightOffDelaySec: 0,
      waitTimeBeforeCureSec: 0,
      waitTimeAfterCureSec: 0,
      waitTimeAfterLiftSec: 0,
      liftDistanceMm: 0.1,
      liftDistance2Mm: 0,
      retractDistance2Mm: Math.min(dummyMotion.retractDistance2Mm, 0.1),
      pwm: 1,
      isDummy: true,
    });
  }
  return {
    version: 1, modelLayerCount, startupDummy: config.startupDummy,
    bottomDefaults: { ...config.defaults.bottom }, normalDefaults: { ...config.defaults.normal }, layers,
  };
}
