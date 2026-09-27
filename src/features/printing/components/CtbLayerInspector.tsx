'use client';

import { useEffect, useState } from 'react';
import type { SliceExportArtifact } from '@/features/slicing/sliceExportOrchestrator';
import { readCtbLayerSettings, type CtbStoredLayerSettings } from '../ctbLayerSettingsBridge';
import { Card, CardHeader, IconButton } from '@/components/ui/primitives';
import { useFloatingPanelCollapse } from '@/components/layout/FloatingPanelStack';

export function CtbLayerInspector({ artifact, layerNumber, bodyMaxHeight = '22rem' }: { artifact: SliceExportArtifact; layerNumber: number; bodyMaxHeight?: string }) {
  const [expanded, setExpanded] = useFloatingPanelCollapse(true);
  const path = artifact.nativeTempPath;
  const [result, setResult] = useState<{ artifact: SliceExportArtifact; path: string; layer: number; data?: CtbStoredLayerSettings; error?: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    void readCtbLayerSettings(path, layerNumber).then(
      (data) => { if (!cancelled) setResult({ artifact, path, layer: layerNumber, data }); },
      (error: unknown) => { if (!cancelled) setResult({ artifact, path, layer: layerNumber, error: String(error) }); },
    );
    return () => { cancelled = true; };
  }, [path, layerNumber, artifact]);
  // Never show the previous request's values while a new layer/file is loading.
  const current = result?.artifact === artifact && result.path === path && result.layer === layerNumber ? result : null;
  const layer = current?.data;
  const planned = artifact.ctbLayerPlan?.layers[layerNumber - 1];
  const number = (value: number) => Number(value.toFixed(4)).toString();
  return (
    <Card className="w-full">
      <CardHeader left={<>
        <IconButton onClick={() => setExpanded((previous) => !previous)} className="!p-0.5" title={expanded ? 'Collapse layer settings' : 'Expand layer settings'}>
          <svg className="w-3 h-3" style={{ color: expanded ? 'var(--accent)' : 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={expanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} />
          </svg>
        </IconButton>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Encoded layer settings</h3>
      </>} hideDivider={!expanded} />
      {expanded && <section className="px-3 pb-3 space-y-2 text-xs overflow-y-auto custom-scrollbar" style={{ maxHeight: bodyMaxHeight, color: 'var(--text-strong)' }} aria-label="Encoded CTB layer settings">
      <p>File layer {layerNumber}{planned ? planned.isDummy ? ' · Startup dummy (no model layer)' : ` · Model layer ${planned.modelLayerNumber}` : ''}</p>
      {!path ? <p>Generated file path unavailable.</p> : current?.error ? <p role="alert">Unable to inspect this file: {current.error}</p> : !layer ? <p role="status">Reading settings from generated file…</p> : <>
        <p style={{ color: 'var(--text-muted)' }}>CTB V{layer.version} · {layer.layerCount} file layers · Stored layer record · {layer.perLayerSettings ? 'Per-layer mode flag' : 'Global mode flag'}</p>
        {!layer.perLayerSettings && <p style={{ color: 'var(--text-muted)' }}>The file selects global settings mode; firmware may use global defaults instead of these stored layer values.</p>}
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
          {([
            ['Z', `${number(layer.positionZMm)} mm`], ['Exposure', `${number(layer.exposureSec)} s`],
            ['Light-off delay', `${number(layer.lightOffDelaySec)} s`], ['Wait before cure', `${number(layer.waitTimeBeforeCureSec)} s`],
            ['Wait after cure', `${number(layer.waitTimeAfterCureSec)} s`], ['Wait after lift', `${number(layer.waitTimeAfterLiftSec)} s`],
            ['Lift distance 1 / 2', `${number(layer.liftDistanceMm)} / ${number(layer.liftDistance2Mm)} mm`],
            ['Lift speed 1 / 2', `${number(layer.liftSpeedMmMin)} / ${number(layer.liftSpeed2MmMin)} mm/min`],
            ['Retract distance 1 / 2', `${number(Math.max(0, layer.liftDistanceMm + layer.liftDistance2Mm - layer.retractDistance2Mm))} / ${number(layer.retractDistance2Mm)} mm`],
            ['Retract speed 1 / 2', `${number(layer.retractSpeedMmMin)} / ${number(layer.retractSpeed2MmMin)} mm/min`],
            ['PWM', `${layer.pwm} / 255 (${(layer.pwm / 255 * 100).toFixed(1)}%)`],
          ] as const).map(([label, value]) => <div key={label} className="contents"><dt style={{ color: 'var(--text-muted)' }}>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <p style={{ color: 'var(--text-muted)' }}>Values read from the generated file. Retract distance 1 is total lift minus retract distance 2.</p>
      </>}
      {artifact.ctbLayerPlan && <p style={{ color: 'var(--text-muted)' }}>CTB estimate uses exposure + all waits + the greater of motion time or light-off delay. Actual printer time depends on firmware.</p>}
      </section>}
    </Card>
  );
}
