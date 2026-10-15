import type { SliceExportArtifact } from '@/features/slicing/sliceExportOrchestrator';
import type { MaterialProfile, PrinterProfile } from '@/features/profiles/profileStore';
import type { CtbLayerPlanV1 } from '@/features/slicing/ctbLayerTiming';

/** Snapshot every profile input affecting generated layers, excluding descriptive metadata. */
export function sliceProfileFingerprint(printer: PrinterProfile | null, material: MaterialProfile | null): string {
  const identity = `${printer?.id ?? ''}::${material?.id ?? ''}`;
  const timingInputs = Object.fromEntries(Object.entries(material ?? {}).filter(([key]) =>
    /ctbTimingV1|localSettingsByOutput|layerHeight|exposure|bottomLayerCount|transition|lift|retract|pwm|antiAliasing|minimumAa|scaleCompensation/i.test(key)));
  return `${identity}::${JSON.stringify({ display: printer?.display, buildVolumeMm: printer?.buildVolumeMm,
    pixelSize: printer?.pixelSize, bitDepth: printer?.bitDepth, timingInputs })}`;
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

/** Invalidity stays attached to an immutable file snapshot when another plate is sliced. */
export function invalidatePrintingArtifacts(
  previous: Set<SliceExportArtifact>,
  plates: Record<string, { artifact: SliceExportArtifact | null }>,
  fingerprint?: string,
): Set<SliceExportArtifact> {
  const next = new Set<SliceExportArtifact>();
  for (const { artifact } of Object.values(plates)) {
    if (artifact && (previous.has(artifact) || fingerprint === undefined || artifact.profileFingerprint !== fingerprint)) next.add(artifact);
  }
  return next.size === previous.size && [...next].every((artifact) => previous.has(artifact)) ? previous : next;
}
