'use client';

import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Button } from '@/components/atoms';
import { NumberInput } from '@/components/ui/NumberInput';
import { Plus, Trash2, ChevronUp, ChevronDown, Calculator } from 'lucide-react';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import type { MaterialDraft, LocalSettingsByOutputDraft } from './profileFormAtoms';
import type { PluginLocalMaterialSettingsAdapterContract } from '@/features/plugins/complexPluginContracts';
import {
  CTB_TIMING_KEYS,
  CTB_MOTION_KEYS,
  createCtbTimingConfig,
  sanitizeCtbTimingConfig,
  type CtbLayerTimingValues,
  type CtbTimingConfigV1,
} from '@/features/slicing/ctbTiming';
import {
  calculateLightOffDelaySec,
  getCtbMotionForCalculator,
  getCtbMotionGroupsForCalculator,
  isCtbTimingPlanSupported,
  validateCtbMotion,
} from '@/features/slicing/ctbLayerTiming';
import { getCtbMotionSupportError } from '@/features/slicing/ctbMotionCapability';

const LABELS = {
  lightOffDelaySec: msg`Light-off delay (s)`,
  waitTimeBeforeCureSec: msg`Wait before cure (s)`,
  waitTimeAfterCureSec: msg`Wait after cure (s)`,
  waitTimeAfterLiftSec: msg`Wait after lift (s)`,
};

const MOTION_LABELS = {
  liftDistanceMm: msg`Lift travel (mm)`,
  liftDistance2Mm: msg`Lift stage 2 travel (mm)`,
  liftSpeedMmMin: msg`Lift speed (mm/min)`,
  liftSpeed2MmMin: msg`Lift stage 2 speed (mm/min)`,
  retractDistance2Mm: msg`Retract stage 2 travel (mm)`,
  retractSpeedMmMin: msg`Retract speed (mm/min)`,
  retractSpeed2MmMin: msg`Retract stage 2 speed (mm/min)`,
};

function rangeLabel(translate: (descriptor: MessageDescriptor) => string, start: number, end: number): string {
  return translate(msg`Range ${start}–${end}`);
}

function pwmSummary(translate: (descriptor: MessageDescriptor) => string, pwm: number): string {
  return translate(msg`PWM ${pwm}%`);
}

function motionBreakdown(translate: (descriptor: MessageDescriptor) => string, fmt: ReturnType<typeof useLocaleFormat>, lift1: number, lift2: number, retract2: number, retract1: number): string {
  const liftStage1 = fmt.quantity(lift1, 2, 's');
  const liftStage2 = fmt.quantity(lift2, 2, 's');
  const retractStage2 = fmt.quantity(retract2, 2, 's');
  const retractStage1 = fmt.quantity(retract1, 2, 's');
  return translate(msg`Lift 1 ${liftStage1} + lift 2 ${liftStage2} + retract 2 ${retractStage2} + retract 1 ${retractStage1}`);
}

function lodBreakdown(translate: (descriptor: MessageDescriptor) => string, fmt: ReturnType<typeof useLocaleFormat>, motion: number, correction: number, rest: number, lod: number): string {
  const motionTime = fmt.quantity(motion, 2, 's');
  const correctionTime = fmt.quantity(correction, 2, 's');
  const restTime = fmt.quantity(rest, 2, 's');
  const rawLod = fmt.quantity(lod, 2, 's');
  return translate(msg`Motion ${motionTime} + correction ${correctionTime} + settle ${restTime} = raw LOD ${rawLod}`);
}

type Props = {
  draft: MaterialDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<MaterialDraft>>;
  outputValues: LocalSettingsByOutputDraft;
  onOutputValuesChange: React.Dispatch<React.SetStateAction<LocalSettingsByOutputDraft>>;
  adapter: PluginLocalMaterialSettingsAdapterContract | null;
  settingsMode: string;
  formatVersion: string;
  view: 'defaults' | 'overrides';
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

function TimingNumber({ label, value, onChange, placeholder, compact = false }: {
  label: string; value: number | undefined; onChange: (next: number | undefined) => void; placeholder?: string; compact?: boolean;
}) {
  return <label className="block space-y-1 text-xs">
    <span className={compact ? 'sr-only' : ''} style={{ color: 'var(--text-muted)' }}>{label}</span>
    {placeholder ? <input className={fieldClass} style={cardStyle} type="number" min="0" step="0.01"
      value={value ?? ''} placeholder={placeholder} onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === '' ? undefined : Number(raw));
      }} /> : <NumberInput className={fieldClass} style={cardStyle} min={0} step={0.01}
      value={value ?? 0} onChange={onChange} showStepper={false} />}
  </label>;
}

function MotionNumber({ label, value, onChange }: {
  label: string; value: number | undefined; onChange: (next: number | undefined) => void;
}) {
  const { _ } = useLingui();
  const [raw, setRaw] = React.useState<string | null>(null);
  const shown = raw ?? (value === undefined ? '' : String(value));
  const invalid = shown !== '' && (!Number.isFinite(Number(shown)) || Number(shown) < 0);
  return <label className="block space-y-1 text-xs">
    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    <input className={fieldClass} style={cardStyle} type="text" inputMode="decimal"
      aria-invalid={invalid} value={shown} placeholder={_(msg`Inherit`)}
      onBlur={() => { if (!invalid) setRaw(null); }} onChange={(event) => {
        const next = event.target.value;
        setRaw(next);
        if (next === '') onChange(undefined);
        else onChange(next.trim() ? Number(next) : Number.NaN);
      }} />
    {invalid && <span role="alert" style={{ color: 'var(--danger, #f87171)' }}><Trans>Enter a nonnegative number.</Trans></span>}
  </label>;
}

function PwmNumber({ value, onChange }: {
  value: number | undefined; onChange: (next: number | undefined) => void;
}) {
  const { _ } = useLingui();
  const [raw, setRaw] = React.useState<string | null>(null);
  const shown = raw ?? (value === undefined ? '' : String(value));
  const parsed = Number(shown);
  const invalid = shown !== '' && (!shown.trim() || !Number.isFinite(parsed) || parsed < 0 || parsed > 100);
  return <label className="block space-y-1 text-xs">
    <span style={{ color: 'var(--text-muted)' }}><Trans>Projector PWM (%)</Trans></span>
    <input className={fieldClass} style={cardStyle} type="text" inputMode="decimal"
      aria-invalid={invalid} value={shown} placeholder={_(msg`Inherit`)}
      onBlur={() => { if (!invalid) setRaw(null); }} onChange={(event) => {
        const next = event.target.value;
        setRaw(next);
        onChange(next === '' ? undefined : next.trim() ? Number(next) : Number.NaN);
      }} />
    {invalid && <span role="alert" style={{ color: 'var(--danger, #f87171)' }}><Trans>Enter a percentage from 0 to 100, or clear to inherit.</Trans></span>}
  </label>;
}

export function CtbTimingEditor({ draft, onDraftChange, outputValues, onOutputValuesChange, adapter, settingsMode, formatVersion, view }: Props) {
  const { _ } = useLingui();
  const fmt = useLocaleFormat();
  const values = outputValues['.ctb'] ?? {};
  const config = draft.ctbTimingV1 ?? deriveLegacyConfig(values);
  const supported = isCtbTimingPlanSupported(formatVersion, settingsMode);
  const [targetRestSec, setTargetRestSec] = React.useState(30);
  const [motionCorrectionSec, setMotionCorrectionSec] = React.useState(0);
  const [applyTarget, setApplyTarget] = React.useState('normal');
  const [lastApplied, setLastApplied] = React.useState<{ target: string; signature: string } | null>(null);
  const [selectedRuleId, setSelectedRuleId] = React.useState<string | null>(null);
  const [rangeTab, setRangeTab] = React.useState<'timing' | 'motion' | 'light'>('timing');
  const [calculatorOpen, setCalculatorOpen] = React.useState(false);

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
  let motionGroups: ReturnType<typeof getCtbMotionGroupsForCalculator> = [];
  let rangeMotionError: string | null = null;
  if (selectedRule) {
    try { motionGroups = getCtbMotionGroupsForCalculator(
      currentMetadata, settingsMode, config, selectedRule.startLayer, selectedRule.endLayer,
    ); } catch (error) { rangeMotionError = error instanceof Error ? error.message : String(error); }
  }
  const mixedMotion = motionGroups.length > 1;
  const calculatorBottom = applyTarget === 'bottom';
  const motion = selectedRule && motionGroups.length ? motionGroups[0].motion
    : getCtbMotionForCalculator(currentMetadata, settingsMode, calculatorBottom);
  const signature = JSON.stringify({ motionGroups: selectedRule ? motionGroups : motion, targetRestSec, motionCorrectionSec });
  const staleCalculation = lastApplied?.target === applyTarget && lastApplied.signature !== signature;
  let motionError: string | null = rangeMotionError;
  try { validateCtbMotion(motion, 'Selected motion'); } catch (error) { motionError = error instanceof Error ? error.message : String(error); }
  const motionSupportError = getCtbMotionSupportError(formatVersion, settingsMode);
  const computedLod = motionError || mixedMotion ? null : calculateLightOffDelaySec(targetRestSec, motion, motionCorrectionSec);
  const travel = (distance: number, speed: number) => distance > 0 && speed > 0 ? 60 * distance / speed : 0;
  const lift1Sec = travel(motion.liftDistanceMm, motion.liftSpeedMmMin);
  const lift2Sec = travel(motion.liftDistance2Mm, motion.liftSpeed2MmMin);
  const retract2Sec = travel(motion.retractDistance2Mm, motion.retractSpeed2MmMin);
  const retract1Sec = travel(Math.max(0, motion.liftDistanceMm + motion.liftDistance2Mm - motion.retractDistance2Mm), motion.retractSpeedMmMin);
  const motionTravelSec = lift1Sec + lift2Sec + retract2Sec + retract1Sec;
  const selectedOverride = config.overrides.find((rule) => rule.id === selectedRuleId) ?? config.overrides[0];
  const modeLabel = settingsMode.trim().toLowerCase() === 'simple' ? _(msg`Simple`)
    : settingsMode.trim().toLowerCase() === 'twostage' ? _(msg`Two Stage`)
      : settingsMode.trim().toLowerCase() === 'allfields' ? _(msg`All Fields`) : settingsMode;
  const pwmField = adapter?.fields.find((field) => field.key === 'projectorPwmPercent');
  const bottomPwmField = adapter?.fields.find((field) => field.key === 'bottomProjectorPwmPercent');
  const pwmValue = (field: typeof pwmField) => {
    if (!field) return 100;
    const raw = Object.prototype.hasOwnProperty.call(values, field.key) ? values[field.key] : field.defaultValue;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : Number(field.defaultValue) || 100;
  };
  const setPwmValue = (key: string, value: number) => onOutputValuesChange((current) => ({
    ...current, '.ctb': { ...current['.ctb'], [key]: value },
  }));
  const setCalculatorTarget = (target: string) => { setApplyTarget(target); setCalculatorOpen(true); };

  return <div className="space-y-3">
    <div className={cardClass} style={cardStyle}>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={config.enabled} disabled={!supported && !config.enabled}
          onChange={(event) => update((current) => ({ ...current, enabled: event.target.checked }))} />
        <Trans>Use CTB timing plan</Trans>
      </label>
      {!config.enabled && supported && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        <Trans>Timing plan is off. Simple format timing fields remain active; turn this on to use the timing table, startup dummy, and layer ranges.</Trans>
      </p>}
      {!supported && <p className="text-xs" role="alert" style={{ color: 'var(--danger, #f87171)' }}>
        <Trans>Select CTB V4 or V5 and Simple, Two Stage, or All Fields mode in the printer profile to use per-layer timing.</Trans> {formatVersion}, {settingsMode}.
      </p>}
    </div>

    {view === 'defaults' && <div className={cardClass} style={cardStyle}>
      <fieldset disabled={!config.enabled || !supported} className="grid grid-cols-[minmax(110px,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center border-0 p-0 m-0 min-w-0 disabled:opacity-60">
        <span />
        <span className="text-xs font-semibold"><Trans>Burn-in</Trans></span>
        <span className="text-xs font-semibold"><Trans>Normal</Trans></span>
        {CTB_TIMING_KEYS.map((key) => <React.Fragment key={key}>
          <div className="flex items-center gap-1 text-xs"><span>{_(LABELS[key])}</span>
            {key === 'lightOffDelaySec' && <Button type="button" variant="secondary" size="xs" onClick={() => setCalculatorTarget('normal')} title={_(msg`Calculate raw light-off delay`)}><Calculator className="w-3.5 h-3.5" /></Button>}
          </div>
          {(['bottom', 'normal'] as const).map((kind) => <TimingNumber key={kind} compact label={kind === 'bottom' ? _(msg`Burn-in seconds`) : _(msg`Normal seconds`)}
            value={config.defaults[kind][key]} onChange={(value) => updateDefault(kind, key, value ?? 0)} />)}
        </React.Fragment>)}
      </fieldset>
      {(pwmField || bottomPwmField) && <div className="grid grid-cols-[minmax(110px,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="text-xs font-semibold"><Trans>Light PWM (%)</Trans></span>
        {[bottomPwmField, pwmField].map((field, index) => field && <label key={field.key} className="block text-xs">
          <span className="sr-only">{index === 0 ? _(msg`Burn-in projector PWM`) : _(msg`Normal projector PWM`)}</span>
          <div className="relative"><NumberInput className={fieldClass} style={cardStyle}
            min={field.min ?? 1} max={field.max ?? 100} step={field.step ?? 1} value={pwmValue(field)}
            onChange={(value) => setPwmValue(field.key, value)} showStepper={false} />
          </div>
        </label>)}
      </div>}
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}><Trans>Raw light-off delay and waits are independent.</Trans></p>
    </div>}

    {view === 'overrides' && <div className={cardClass} style={cardStyle}>
      <fieldset disabled={!config.enabled || !supported} className="space-y-3 border-0 p-0 m-0 min-w-0 disabled:opacity-60">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold"><Trans>Model layer ranges</Trans></span>
        <Button type="button" variant="secondary" size="xs" onClick={() => {
          const id = crypto.randomUUID();
          const startLayer = (config.overrides.at(-1)?.endLayer ?? 0) + 1;
          update((current) => ({ ...current, overrides: [...current.overrides, { id, startLayer, endLayer: startLayer, values: {} }] }));
          setSelectedRuleId(id);
        }}><Plus className="w-3.5 h-3.5" /> <Trans>Add range</Trans></Button>
      </div>
      {config.overrides.length > 0 && <div className="space-y-1" role="listbox" aria-label={_(msg`Layer override ranges`)}>
        {config.overrides.map((rule) => {
          const summary = [Object.keys(rule.values).length ? _(msg`Timing`) : '',
            rule.motion && Object.keys(rule.motion).length ? _(msg`Motion`) : '',
            rule.pwmPercent !== undefined ? pwmSummary(_, rule.pwmPercent) : ''].filter(Boolean).join(' · ');
          return <button key={rule.id} type="button" role="option" aria-selected={selectedOverride?.id === rule.id}
          className="w-full rounded-md border px-2 py-1.5 text-xs text-left flex items-center gap-2"
          style={{ borderColor: selectedOverride?.id === rule.id ? 'var(--accent)' : 'var(--border-subtle)', background: selectedOverride?.id === rule.id ? 'var(--surface-1)' : 'transparent' }}
          onClick={() => { setSelectedRuleId(rule.id); setCalculatorOpen(false); }}>
          <span className="tabular-nums w-20 shrink-0">{rule.startLayer}–{rule.endLayer}</span>
          <span className="truncate">{rule.name || `${rule.startLayer}–${rule.endLayer}`}</span>
          <span className="ml-auto truncate" style={{ color: 'var(--text-muted)' }}>{summary}</span>
        </button>;})}
      </div>}
      {config.overrides.map((rule, index) => {
        if (rule.id !== selectedOverride?.id) return null;
        let ruleMotionError: string | null = null;
        try { getCtbMotionGroupsForCalculator(currentMetadata, settingsMode, config, rule.startLayer, rule.endLayer); }
        catch (error) { ruleMotionError = error instanceof Error ? error.message : String(error); }
        return <div key={rule.id} className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
        <div className="flex items-end gap-2">
          <label className="text-xs flex-[2]"><Trans>Range name</Trans><input type="text" className={fieldClass} style={cardStyle}
            value={rule.name ?? ''} placeholder={_(msg`Optional name`)} onChange={(event) => updateRule(rule.id, (item) => ({ ...item, name: event.target.value }))} /></label>
          <label className="text-xs flex-1"><Trans>First layer</Trans><input type="number" min="1" step="1" className={fieldClass} style={cardStyle}
            value={rule.startLayer} onChange={(event) => updateRule(rule.id, (item) => {
              const startLayer = Math.max(1, Math.trunc(Number(event.target.value) || 1));
              return { ...item, startLayer, endLayer: Math.max(item.endLayer, startLayer) };
            })} /></label>
          <label className="text-xs flex-1"><Trans>Last layer</Trans><input type="number" min="1" step="1" className={fieldClass} style={cardStyle}
            value={rule.endLayer} onChange={(event) => updateRule(rule.id, (item) => ({ ...item, endLayer: Math.max(item.startLayer, Math.trunc(Number(event.target.value) || item.startLayer)) }))} /></label>
          <Button type="button" variant="secondary" size="xs" disabled={index === 0} aria-label={_(msg`Move range earlier`)} onClick={() => update((current) => {
            const overrides = [...current.overrides]; [overrides[index - 1], overrides[index]] = [overrides[index]!, overrides[index - 1]!];
            return { ...current, overrides };
          })}><ChevronUp className="w-3.5 h-3.5" /></Button>
          <Button type="button" variant="secondary" size="xs" disabled={index === config.overrides.length - 1} aria-label={_(msg`Move range later`)} onClick={() => update((current) => {
            const overrides = [...current.overrides]; [overrides[index], overrides[index + 1]] = [overrides[index + 1]!, overrides[index]!];
            return { ...current, overrides };
          })}><ChevronDown className="w-3.5 h-3.5" /></Button>
          <Button type="button" variant="secondary" size="xs" aria-label={_(msg`Remove range`)} onClick={() => update((current) => ({ ...current, overrides: current.overrides.filter((item) => item.id !== rule.id) }))}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
        <div className="flex items-center gap-1 border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
          {(['timing', 'motion', 'light'] as const).map((tab) => <Button key={tab} type="button" variant="secondary" size="xs"
            aria-pressed={rangeTab === tab} onClick={() => setRangeTab(tab)}>{tab === 'timing' ? _(msg`Timing`) : tab === 'motion' ? _(msg`Motion`) : _(msg`Light`)}</Button>)}
          <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{modeLabel}</span>
        </div>
        {rangeTab === 'timing' && <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {CTB_TIMING_KEYS.map((key) => <TimingNumber key={key} label={_(LABELS[key])} value={rule.values[key]} placeholder={_(msg`Inherit`)}
            onChange={(value) => updateRule(rule.id, (item) => {
              const values = { ...item.values };
              if (value === undefined) delete values[key]; else values[key] = value;
              return { ...item, values };
            })} />)}
        </div>
        <Button type="button" variant="secondary" size="xs" onClick={() => setCalculatorTarget(rule.id)}><Calculator className="w-3.5 h-3.5" /> <Trans>Calculate raw LOD</Trans></Button>
        </>}
        {rangeTab === 'light' && <>
        <div className="border-t pt-2 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="text-xs font-semibold"><Trans>Projector light</Trans></div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <Trans>Blank inherits PWM from an earlier matching range or the burn-in or normal default. A saved 0% is explicit.</Trans>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <PwmNumber value={rule.pwmPercent} onChange={(value) => updateRule(rule.id, (item) => {
              const next = { ...item };
              if (value === undefined) delete next.pwmPercent; else next.pwmPercent = value;
              return next;
            })} />
          </div>
        </div>
        </>}
        {rangeTab === 'motion' && <>
        <div className="border-t pt-2 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="text-xs font-semibold"><Trans>Lift and retract</Trans></div>
          {motionSupportError && <p role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>{motionSupportError}</p>}
          {CTB_MOTION_KEYS.some((key) => rule.motion?.[key] !== undefined) && <button type="button" className="ui-button ui-button-secondary text-xs" onClick={() => updateRule(rule.id, (item) => ({ ...item, motion: undefined }))}>
            <Trans>Clear this range’s motion overrides</Trans>
          </button>}
          {settingsMode.trim().toLowerCase() === 'simple' &&
            (['liftDistance2Mm', 'liftSpeed2MmMin', 'retractDistance2Mm', 'retractSpeed2MmMin'] as const).some((key) => (rule.motion?.[key] ?? 0) > 0) &&
            <div className="text-xs space-y-1" role="alert" style={{ color: 'var(--danger, #f87171)' }}>
              <p><Trans>This range contains Two Stage values. Select Two Stage mode or clear those values before export.</Trans></p>
              <button type="button" className="ui-button ui-button-secondary text-xs" onClick={() => updateRule(rule.id, (item) => {
                const motion = { ...item.motion };
                delete motion.liftDistance2Mm; delete motion.liftSpeed2MmMin;
                delete motion.retractDistance2Mm; delete motion.retractSpeed2MmMin;
                return { ...item, motion };
              })}><Trans>Clear Two Stage values</Trans></button>
            </div>}
          {ruleMotionError && <p className="text-xs" role="alert" style={{ color: 'var(--danger, #f87171)' }}>{ruleMotionError}</p>}
          {!motionSupportError && <>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <Trans>Each blank field inherits the bottom or normal setting. Later matching ranges win per field.</Trans>
              {settingsMode.trim().toLowerCase() === 'simple' && <> <Trans>Retract travel equals total lift travel in Simple mode.</Trans></>}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {CTB_MOTION_KEYS.filter((key) => settingsMode.trim().toLowerCase() === 'twostage' ||
                ['liftDistanceMm', 'liftSpeedMmMin', 'retractSpeedMmMin'].includes(key)).map((key) =>
                <MotionNumber key={`${rule.id}-${key}`} label={_(MOTION_LABELS[key])} value={rule.motion?.[key]}
                  onChange={(value) => updateRule(rule.id, (item) => {
                    const nextMotion = { ...item.motion };
                    if (value === undefined) delete nextMotion[key]; else nextMotion[key] = value;
                    return { ...item, motion: nextMotion };
                  })} />)}
            </div>
            {settingsMode.trim().toLowerCase() === 'twostage' && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <Trans>Stage 2 retract travel must be at most total lift travel. Stage 1 retract uses the remaining distance.</Trans>
            </p>}
          </>}
        </div>
        </>}
      </div>;
      })}
      <details className="text-xs" style={{ color: 'var(--text-muted)' }}><summary className="cursor-pointer"><Trans>How overlapping ranges work</Trans></summary>
        <p className="pt-1"><Trans>Layer numbers exclude the startup dummy. Blank fields inherit; later matching ranges win independently for timing, motion, and PWM. A range PWM of 0% is explicit.</Trans></p>
      </details>
      </fieldset>
    </div>}

    {calculatorOpen && <div className={cardClass} style={cardStyle}>
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold"><Trans>Raw light-off delay calculator</Trans></span>
        <Button type="button" variant="secondary" size="xs" onClick={() => setCalculatorOpen(false)} aria-label={_(msg`Close calculator`)}>×</Button></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <TimingNumber label={_(msg`Target extra rest (s)`)} value={targetRestSec} onChange={(value) => setTargetRestSec(value ?? 0)} />
        <TimingNumber label={_(msg`Motion-time correction (s)`)} value={motionCorrectionSec} onChange={(value) => setMotionCorrectionSec(value ?? 0)} />
        <label className="block space-y-1 text-xs"><span><Trans>Apply to</Trans></span><select className={fieldClass} style={cardStyle} value={applyTarget} onChange={(event) => setApplyTarget(event.target.value)}>
          <option value="bottom">{_(msg`Burn-in default`)}</option><option value="normal">{_(msg`Normal default`)}</option>
          {config.overrides.map((rule) => <option key={rule.id} value={rule.id}>{rule.name || rangeLabel(_, rule.startLayer, rule.endLayer)}</option>)}
        </select></label>
      </div>
       {computedLod !== null && <div className="rounded-md p-3 text-xs space-y-2" style={{ background: 'var(--surface-1)' }}>
         <div className="flex items-center justify-between gap-3">
           <div><span className="block" style={{ color: 'var(--text-muted)' }}><Trans>Calculated raw LOD</Trans></span>
             <strong className="text-xl tabular-nums" style={{ color: 'var(--text-strong)' }}>{fmt.quantity(computedLod, 2, 's')}</strong></div>
           <Button type="button" variant="secondary" size="xs" disabled={!config.enabled || !supported || mixedMotion}
             onClick={() => {
               if (applyTarget === 'bottom' || applyTarget === 'normal') updateDefault(applyTarget, 'lightOffDelaySec', computedLod);
               else updateRule(applyTarget, (rule) => ({ ...rule, values: { ...rule.values, lightOffDelaySec: computedLod } }));
               setLastApplied({ target: applyTarget, signature });
             }}><Trans>Apply raw LOD</Trans></Button>
         </div>
         <div className="flex h-2 overflow-hidden rounded-full" aria-hidden="true" style={{ background: 'var(--surface-2)' }}>
           <span style={{ width: `${computedLod > 0 ? 100 * Math.max(0, motionTravelSec + motionCorrectionSec) / computedLod : 0}%`, background: 'var(--accent-secondary)' }} />
           <span style={{ width: `${computedLod > 0 ? 100 * Math.max(0, targetRestSec) / computedLod : 0}%`, background: 'var(--accent)' }} />
         </div>
         <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--text-muted)' }}>
           <span><span aria-hidden="true" className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: 'var(--accent-secondary)' }} /><Trans>Motion + correction</Trans> {fmt.quantity(motionTravelSec + motionCorrectionSec, 2, 's')}</span>
           <span><span aria-hidden="true" className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: 'var(--accent)' }} /><Trans>Target rest</Trans> {fmt.quantity(targetRestSec, 2, 's')}</span>
         </div>
         <details style={{ color: 'var(--text-muted)' }}><summary className="cursor-pointer"><Trans>Travel breakdown</Trans></summary>
           <p className="pt-1">{motionBreakdown(_, fmt, lift1Sec, lift2Sec, retract2Sec, retract1Sec)}</p>
           <p>{lodBreakdown(_, fmt, motionTravelSec, motionCorrectionSec, targetRestSec, computedLod)}</p>
         </details>
       </div>}
      <details className="text-xs" style={{ color: 'var(--text-muted)' }}><summary className="cursor-pointer"><Trans>How this estimate works</Trans></summary>
        <p className="pt-1"><Trans>Constant-speed travel plus correction and target rest. Applying changes only raw LOD; explicit wait fields stay independent. Printer behavior may vary.</Trans></p>
      </details>
      {motionError && <p className="text-xs" role="alert" style={{ color: 'var(--danger, #f87171)' }}>{motionError} <Trans>Fix the motion settings before applying raw LOD.</Trans></p>}
      {staleCalculation && <p className="text-xs" role="status" style={{ color: 'var(--danger, #f87171)' }}><Trans>Motion or calculator inputs changed since Apply. Reapply raw LOD if you want the new estimate; saved LOD and waits were left unchanged.</Trans></p>}
      {mixedMotion && <div className="space-y-1 text-xs" role="alert" style={{ color: 'var(--danger, #f87171)' }}>
        <p><Trans>This range contains different effective motion. Split it before applying one raw LOD:</Trans></p>
        <p>{motionGroups.map((group) => `${group.startLayer}–${group.endLayer}`).join(', ')}</p>
        <button type="button" className="ui-button ui-button-secondary text-xs" onClick={() => {
          if (!selectedRule) return;
          const firstId = crypto.randomUUID();
          update((current) => ({ ...current, overrides: current.overrides.flatMap((item) => item.id === selectedRule.id
            ? motionGroups.map((group, index) => ({ ...item, id: index === 0 ? firstId : crypto.randomUUID(), startLayer: group.startLayer, endLayer: group.endLayer }))
            : [item]) }));
          setApplyTarget(firstId);
          setSelectedRuleId(firstId);
        }}><Trans>Split into motion groups</Trans></button>
      </div>}
    </div>}

    {view === 'defaults' && <div className={cardClass} style={cardStyle}>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.startupDummy} disabled={!config.enabled || !supported}
        onChange={(event) => update((current) => ({ ...current, startupDummy: event.target.checked }))} /> <Trans>Startup dummy layer</Trans></label>
      <details className="text-xs" style={{ color: 'var(--text-muted)' }}><summary className="cursor-pointer"><Trans>File details</Trans></summary>
        <p className="pt-1"><Trans>Adds a one-pixel gray-128 file layer before model layer 1 at the same Z height, with 0.01 s exposure, PWM 1/255, 0.1 mm lift, and zero waits and raw LOD.</Trans></p>
      </details>
    </div>}
  </div>;
}
