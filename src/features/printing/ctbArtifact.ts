import type { MaterialProfile, PrinterProfile } from '@/features/profiles/profileStore';
import type { CtbLayerPlanV1 } from '@/features/slicing/ctbLayerTiming';

/** Only the opted-in CTB workflow extends legacy profile-ID invalidation. */
export function sliceProfileFingerprint(printer: PrinterProfile | null, material: MaterialProfile | null): string {
  const identity = `${printer?.id ?? ''}::${material?.id ?? ''}`;
  if (!material?.ctbTimingV1?.enabled || !printer?.display.outputFormat.toLowerCase().includes('ctb')) return identity;
  const timingInputs = Object.fromEntries(Object.entries(material).filter(([key]) =>
    /ctbTimingV1|localSettingsByOutput|layerHeight|exposure|bottomLayerCount|transition|lift|retract|pwm/i.test(key)));
  return `${identity}::${JSON.stringify({ display: printer.display, timingInputs })}`;
}

export function ctbPreviewLayer(plan: CtbLayerPlanV1 | undefined, fileLayerNumber: number, layerHeightMm: number) {
  const layer = plan?.layers[fileLayerNumber - 1];
  return {
    isDummy: layer?.isDummy ?? false,
    modelLayerNumber: layer ? layer.modelLayerNumber : fileLayerNumber,
    positionZMm: layer?.positionZMm ?? fileLayerNumber * layerHeightMm,
    sampleZMm: layer?.isDummy ? null : layer
      ? layer.positionZMm - (plan!.layers[plan!.startupDummy ? 1 : 0].positionZMm / 2)
      : fileLayerNumber * layerHeightMm,
  };
}

/** UVtools-style constant-speed estimate, not a printer firmware prediction. */
export function estimateCtbPlanSeconds(plan: CtbLayerPlanV1): number {
  const travel = (distance: number, speed: number) => distance > 0 && speed > 0 ? distance * 60 / speed : 0;
  return plan.layers.reduce((sum, layer) => {
    const motion = travel(layer.liftDistanceMm, layer.liftSpeedMmMin)
      + travel(layer.liftDistance2Mm, layer.liftSpeed2MmMin)
      + travel(Math.max(0, layer.liftDistanceMm + layer.liftDistance2Mm - layer.retractDistance2Mm), layer.retractSpeedMmMin)
      + travel(layer.retractDistance2Mm, layer.retractSpeed2MmMin);
    return sum + layer.exposureSec + layer.waitTimeBeforeCureSec + layer.waitTimeAfterCureSec
      + layer.waitTimeAfterLiftSec + Math.max(motion, layer.lightOffDelaySec);
  }, 0);
}
