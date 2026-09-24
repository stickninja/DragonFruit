'use client';

import React from 'react';
import type { MaterialDraft, LocalSettingsByOutputDraft } from './profileFormAtoms';
import type { PluginLocalMaterialSettingsAdapterContract } from '@/features/plugins/complexPluginContracts';
import {
  CTB_TIMING_KEYS,
  createCtbTimingConfig,
  sanitizeCtbTimingConfig,
  type CtbLayerTimingValues,
  type CtbTimingConfigV1,
} from '@/features/slicing/ctbTiming';
import {
  calculateLightOffDelaySec,
  getCtbMotionForCalculator,
  isCtbTimingPlanSupported,
} from '@/features/slicing/ctbLayerTiming';

const LABELS: Record<keyof CtbLayerTimingValues, string> = {
  lightOffDelaySec: 'Raw light-off delay (s)',
  waitTimeBeforeCureSec: 'Wait before cure (s)',
  waitTimeAfterCureSec: 'Wait after cure (s)',
  waitTimeAfterLiftSec: 'Wait after lift (s)',
};

type Props = {
  draft: MaterialDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<MaterialDraft>>;
  outputValues: LocalSettingsByOutputDraft;
  adapter: PluginLocalMaterialSettingsAdapterContract | null;
  settingsMode: string;
  formatVersion: string;
};

function legacyNumber(values: Record<string, string | number | boolean>, key: string, fallback: number): number {
  const parsed = Number(values[key]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function deriveLegacyConfig(values: Record<string, string | number | boolean>): CtbTimingConfigV1 {
  const normal = {
    lightOffDelaySec: legacyNumber(values, 'lightOffDelaySec', 0),
    waitTimeBeforeCureSec: legacyNumber(values, 'waitTimeBeforeCureSec', 0),
    waitTimeAfterCureSec: legacyNumber(values, 'waitTimeAfterCureSec', 0),
    waitTimeAfterLiftSec: legacyNumber(values, 'waitTimeAfterLiftSec', 0),
  };
  return createCtbTimingConfig({
    lightOffDelaySec: legacyNumber(values, 'bottomLightOffDelaySec', 0),
    waitTimeBeforeCureSec: legacyNumber(values, 'bottomWaitTimeBeforeCureSec', normal.waitTimeBeforeCureSec),
    waitTimeAfterCureSec: legacyNumber(values, 'bottomWaitTimeAfterCureSec', normal.waitTimeAfterCureSec),
    waitTimeAfterLiftSec: legacyNumber(values, 'bottomWaitTimeAfterLiftSec', normal.waitTimeAfterLiftSec),
  }, normal);
}

function calculatorMetadata(draft: MaterialDraft, values: Record<string, string | number | boolean>, adapter: Props['adapter']): Record<string, unknown> {
  const material: Record<string, unknown> = {
    liftDistanceMm: draft.liftDistanceMm,
    liftSpeedMmMin: draft.liftSpeedMmMin,
    retractSpeedMmMin: draft.retractSpeedMmMin,
    bottomLayerCount: draft.bottomLayerCount,
  };
  const ctb: Record<string, unknown> = {};
  for (const field of adapter?.fields ?? []) {
    const value = Object.prototype.hasOwnProperty.call(values, field.key) ? values[field.key] : field.defaultValue;
    const path = field.metadataPath ?? `material.${field.key}`;
    const [root, key] = path.split('.');
    if (root === 'ctb' && key) ctb[key] = value;
    else if (root === 'material' && key) material[key] = value;
  }
  return { material, ctb };
}

const fieldClass = 'h-8 w-full rounded-md border px-2 text-xs';
const cardClass = 'rounded-xl border p-3 space-y-3';
const cardStyle: React.CSSProperties = { borderColor: 'var(--border-subtle)', background: 'var(--surface-2)' };

function TimingNumber({ label, value, onChange, placeholder }: {
  label: string; value: number | undefined; onChange: (next: number | undefined) => void; placeholder?: string;
}) {
  return <label className="block space-y-1 text-xs">
    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    <input className={fieldClass} style={cardStyle} type="number" min="0" step="0.01"
      value={value ?? ''} placeholder={placeholder} onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === '' ? undefined : Math.max(0, Number(raw) || 0));
      }} />
  </label>;
}

export function CtbTimingEditor({ draft, onDraftChange, outputValues, adapter, settingsMode, formatVersion }: Props) {
  const values = outputValues['.ctb'] ?? {};
  const config = draft.ctbTimingV1 ?? deriveLegacyConfig(values);
  const supported = isCtbTimingPlanSupported(formatVersion, settingsMode);
  const [targetRestSec, setTargetRestSec] = React.useState(30);
  const [motionCorrectionSec, setMotionCorrectionSec] = React.useState(0);
  const [applyTarget, setApplyTarget] = React.useState('normal');

  const update = (recipe: (current: CtbTimingConfigV1) => CtbTimingConfigV1) => {
    onDraftChange((current) => ({
      ...current,
      ctbTimingV1: sanitizeCtbTimingConfig(recipe(current.ctbTimingV1 ?? deriveLegacyConfig(values))),
    }));
  };
  const updateDefault = (kind: 'bottom' | 'normal', key: keyof CtbLayerTimingValues, value: number) => {
    update((current) => ({ ...current, defaults: {
      ...current.defaults, [kind]: { ...current.defaults[kind], [key]: value },
    } }));
  };
  const updateRule = (id: string, recipe: (rule: CtbTimingConfigV1['overrides'][number]) => CtbTimingConfigV1['overrides'][number]) => {
    update((current) => ({ ...current, overrides: current.overrides.map((rule) => rule.id === id ? recipe(rule) : rule) }));
  };
  const selectedRule = config.overrides.find((rule) => rule.id === applyTarget);
  const currentMetadata = calculatorMetadata(draft, values, adapter);
  const effectiveBottomCount = Number((currentMetadata.material as Record<string, unknown>).bottomLayerCount) || 0;
  const calculatorBottom = applyTarget === 'bottom' || (selectedRule?.startLayer ?? Infinity) <= effectiveBottomCount;
  const motion = getCtbMotionForCalculator(currentMetadata, settingsMode, calculatorBottom);
  const bottomMotion = getCtbMotionForCalculator(currentMetadata, settingsMode, true);
  const normalMotion = getCtbMotionForCalculator(currentMetadata, settingsMode, false);
  const crossesMotionBoundary = selectedRule != null && selectedRule.startLayer <= effectiveBottomCount
    && selectedRule.endLayer > effectiveBottomCount && JSON.stringify(bottomMotion) !== JSON.stringify(normalMotion);
  const computedLod = calculateLightOffDelaySec(targetRestSec, motion, motionCorrectionSec);
  const travel = (distance: number, speed: number) => distance > 0 && speed > 0 ? 60 * distance / speed : 0;
  const lift1Sec = travel(motion.liftDistanceMm, motion.liftSpeedMmMin);
  const lift2Sec = travel(motion.liftDistance2Mm, motion.liftSpeed2MmMin);
  const retract2Sec = travel(motion.retractDistance2Mm, motion.retractSpeed2MmMin);
  const retract1Sec = travel(Math.max(0, motion.liftDistanceMm + motion.liftDistance2Mm - motion.retractDistance2Mm), motion.retractSpeedMmMin);
  const motionTravelSec = lift1Sec + lift2Sec + retract2Sec + retract1Sec;

  return <div className="space-y-3">
    <div className={cardClass} style={cardStyle}>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={config.enabled} disabled={!supported && !config.enabled}
          onChange={(event) => update((current) => ({ ...current, enabled: event.target.checked }))} />
        Use per-layer CTB timing
      </label>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        When enabled, the values on this tab control CTB timing for each model layer. The Simple tab timing fields remain the legacy settings when this switch is off.
      </p>
      {!supported && <p className="text-xs" role="alert" style={{ color: 'var(--danger, #f87171)' }}>
        Select CTB V4 or V5 and Simple, Two Stage, or All Fields mode in the printer profile to use per-layer timing. Current selection: {formatVersion}, {settingsMode}.
      </p>}
    </div>

    {(['bottom', 'normal'] as const).map((kind) => <div key={kind} className={cardClass} style={cardStyle}>
      <div className="text-sm font-semibold">{kind === 'bottom' ? 'Bottom layers' : 'Normal and transition layers'}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {CTB_TIMING_KEYS.map((key) => <TimingNumber key={key} label={LABELS[key]}
          value={config.defaults[kind][key]} onChange={(value) => updateDefault(kind, key, value ?? 0)} />)}
      </div>
    </div>)}

    <div className={cardClass} style={cardStyle}>
      <div className="flex items-center justify-between gap-2">
        <div><div className="text-sm font-semibold">Layer overrides</div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Inclusive model layer numbers. Blank values inherit; later matching rows win for each field.</p></div>
        <button type="button" className="ui-button ui-button-secondary text-xs" onClick={() => update((current) => ({
          ...current, overrides: [...current.overrides, { id: crypto.randomUUID(), startLayer: 1, endLayer: 1, values: {} }],
        }))}>Add range</button>
      </div>
      {config.overrides.map((rule, index) => <div key={rule.id} className="rounded-lg border p-2 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-end gap-2">
          <label className="text-xs flex-1">First layer<input type="number" min="1" step="1" className={fieldClass} style={cardStyle}
            value={rule.startLayer} onChange={(event) => updateRule(rule.id, (item) => {
              const startLayer = Math.max(1, Math.trunc(Number(event.target.value) || 1));
              return { ...item, startLayer, endLayer: Math.max(item.endLayer, startLayer) };
            })} /></label>
          <label className="text-xs flex-1">Last layer<input type="number" min="1" step="1" className={fieldClass} style={cardStyle}
            value={rule.endLayer} onChange={(event) => updateRule(rule.id, (item) => ({ ...item, endLayer: Math.max(item.startLayer, Math.trunc(Number(event.target.value) || item.startLayer)) }))} /></label>
          <button type="button" className="ui-button ui-button-secondary text-xs" disabled={index === 0} aria-label="Move range earlier" onClick={() => update((current) => {
            const overrides = [...current.overrides]; [overrides[index - 1], overrides[index]] = [overrides[index]!, overrides[index - 1]!];
            return { ...current, overrides };
          })}>↑</button>
          <button type="button" className="ui-button ui-button-secondary text-xs" disabled={index === config.overrides.length - 1} aria-label="Move range later" onClick={() => update((current) => {
            const overrides = [...current.overrides]; [overrides[index], overrides[index + 1]] = [overrides[index + 1]!, overrides[index]!];
            return { ...current, overrides };
          })}>↓</button>
          <button type="button" className="ui-button ui-button-secondary text-xs" onClick={() => update((current) => ({ ...current, overrides: current.overrides.filter((item) => item.id !== rule.id) }))}>Remove</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {CTB_TIMING_KEYS.map((key) => <TimingNumber key={key} label={LABELS[key]} value={rule.values[key]} placeholder="Inherit"
            onChange={(value) => updateRule(rule.id, (item) => {
              const values = { ...item.values };
              if (value === undefined) delete values[key]; else values[key] = value;
              return { ...item, values };
            })} />)}
        </div>
      </div>)}
    </div>

    <div className={cardClass} style={cardStyle}>
      <div className="text-sm font-semibold">Light-off delay calculator</div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Estimate raw light-off delay from constant-speed lift and retract time plus target extra pre-exposure rest. Correction accounts for measured motion overhead. Reapply after motion changes. Explicit waits stay independent; printer behavior can vary.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <TimingNumber label="Target extra rest (s)" value={targetRestSec} onChange={(value) => setTargetRestSec(value ?? 0)} />
        <TimingNumber label="Motion-time correction (s)" value={motionCorrectionSec} onChange={(value) => setMotionCorrectionSec(value ?? 0)} />
        <label className="block space-y-1 text-xs"><span>Apply to</span><select className={fieldClass} style={cardStyle} value={applyTarget} onChange={(event) => setApplyTarget(event.target.value)}>
          <option value="bottom">Bottom default</option><option value="normal">Normal default</option>
          {config.overrides.map((rule) => <option key={rule.id} value={rule.id}>Range {rule.startLayer}–{rule.endLayer}</option>)}
        </select></label>
      </div>
      <p className="text-xs">Lift 1 {lift1Sec.toFixed(2)} s + lift 2 {lift2Sec.toFixed(2)} s + retract 2 {retract2Sec.toFixed(2)} s + retract 1 {retract1Sec.toFixed(2)} s = estimated motion {motionTravelSec.toFixed(2)} s.</p>
      <p className="text-xs">Motion {motionTravelSec.toFixed(2)} s + correction {motionCorrectionSec.toFixed(2)} s + target rest {targetRestSec.toFixed(2)} s = <strong>raw LOD {computedLod.toFixed(2)} s</strong>.</p>
      {crossesMotionBoundary && <p className="text-xs" role="alert" style={{ color: 'var(--danger, #f87171)' }}>This range crosses the bottom/normal motion boundary. Split it at layer {effectiveBottomCount} to calculate each motion separately.</p>}
      <button type="button" className="ui-button ui-button-secondary text-xs" disabled={crossesMotionBoundary} onClick={() => {
        if (applyTarget === 'bottom' || applyTarget === 'normal') updateDefault(applyTarget, 'lightOffDelaySec', computedLod);
        else updateRule(applyTarget, (rule) => ({ ...rule, values: { ...rule.values, lightOffDelaySec: computedLod } }));
      }}>Apply raw LOD</button>
    </div>

    <div className={cardClass} style={cardStyle}>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.startupDummy}
        onChange={(event) => update((current) => ({ ...current, startupDummy: event.target.checked }))} /> Startup dummy layer</label>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Adds a one-pixel gray-128 file layer before model layer 1, at the same Z height. It uses 0.01 s exposure, PWM 1/255, 0.1 mm lift, and zero waits and raw LOD.</p>
    </div>
  </div>;
}
