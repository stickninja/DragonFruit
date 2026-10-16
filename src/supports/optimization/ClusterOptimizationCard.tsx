"use client";

import React from 'react';
import { useLingui } from '@lingui/react';
import { msg, plural } from '@lingui/core/macro';
import type { I18n } from '@lingui/core';
import { Check, ScanEye, X } from 'lucide-react';
import { Button } from '@/components/atoms';
import { NumberInput } from '@/components/ui/NumberInput';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { getSnapshot, subscribe } from '../state';
import { useResolvedSelectionState } from '../interaction/shared/selection/resolvedSelectionStore';
import { DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS } from './clusterOptimization';
import {
    applyClusterOptimization, cancelClusterPreview, clusterSelectionError,
    getClusterPreview, invalidateClusterPreview, previewClusterOptimization, subscribeClusterPreview,
    type ClusterPreviewContext, type ClusterPreviewError,
} from './clusterPreview';

// Interpolation stays outside React Compiler's component scope.
function selectedMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# trunk selected', other: '# trunks selected' })}`); }
function contactsMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# contact preserved', other: '# contacts preserved' })}`); }
function fewerMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# fewer trunk', other: '# fewer trunks' })}`); }
function skippedMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# support kept by geometry limits', other: '# supports kept by geometry limits' })}`); }

function errorMessage(_: I18n['_'], error: ClusterPreviewError) {
    switch (error) {
        case 'locked': return _(msg`Unlock the active plate before optimizing supports.`);
        case 'selection': return _(msg`Select at least two trunks to optimize.`);
        case 'model': return _(msg`Select supports from the active model only.`);
        case 'plate': return _(msg`Select supports on the active plate.`);
        case 'mesh': return _(msg`Model geometry is unavailable. Reload the model before previewing.`);
        case 'failed': return _(msg`Cluster preview failed. Adjust the selection or limits and try again.`);
    }
}

export function ClusterOptimizationCard({ context }: { context: ClusterPreviewContext }) {
    const { _ } = useLingui();
    const fmt = useLocaleFormat();
    const [options, setOptions] = React.useState({ ...DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS });
    const [error, setError] = React.useState<ClusterPreviewError | null>(null);
    const preview = React.useSyncExternalStore(subscribeClusterPreview, getClusterPreview, getClusterPreview);
    const support = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const selection = useResolvedSelectionState();
    const count = selection.selectedIds.filter((id) => support.trunks[id]).length;
    const selectionError = clusterSelectionError(context);
    const result = preview.result;
    const contactsPreserved = !!result && result.contactCountBefore === result.contactCountAfter;
    const canApply = !selectionError && preview.status === 'ready' && !!result?.changedCount && contactsPreserved;
    const plateModelsKey = [...context.plateModelIds].sort().join('\n');
    // Leaving support edit restores normalized settings with new object identities.
    // Only changed values invalidate the geometry checked by the proposal.
    const autoBracingKey = JSON.stringify(context.autoBracingSettings);
    const gridKey = JSON.stringify(context.gridSettings);

    React.useEffect(() => {
        invalidateClusterPreview();
        setError(null);
    }, [context.modelId, context.plateId, context.modelPlateId, context.isPlateLocked, autoBracingKey, gridKey, plateModelsKey]);
    React.useEffect(() => () => cancelClusterPreview(), []);

    const updateOptions = (patch: Partial<typeof options>) => {
        invalidateClusterPreview();
        setError(null);
        setOptions((current) => ({ ...current, ...patch }));
    };

    return (
        <div className="space-y-3" data-cluster-optimization>
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>{_(msg`Cluster optimization`)}</h4>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{selectedMessage(_, count)}</span>
            </div>
            <label className="block space-y-2">
                <span className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{_(msg`Trunk reduction`)}</span>
                    <output style={{ color: 'var(--text-strong)' }}>{fmt.quantity(options.reductionPercent, 0, 'percent')}</output>
                </span>
                <input type="range" className="ui-range w-full" min={0} max={75} step={5}
                    value={options.reductionPercent} aria-label={_(msg`Trunk reduction`)}
                    onChange={(event) => updateOptions({ reductionPercent: Number(event.target.value) })} />
            </label>
            {result && (
                <div className="rounded-md border p-2.5 space-y-2" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-0)' }}>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-strong)' }}>
                        <span>{_(msg`Trunks`)}</span>
                        <span className="font-semibold tabular-nums">{fmt.number(result.selectedTrunkCount)} → {fmt.number(result.remainingTrunkCount)}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <span>{contactsPreserved ? contactsMessage(_, result.contactCountAfter) : _(msg`Contact check failed`)}</span>
                        <span>{fewerMessage(_, result.changedCount)}</span>
                    </div>
                    {result.skipped.length > 0 && <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{skippedMessage(_, result.skipped.length)}</div>}
                </div>
            )}
            <details className="border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
                <summary className="cursor-pointer text-xs" style={{ color: 'var(--text-muted)' }}>{_(msg`Advanced limits`)}</summary>
                <div className="grid grid-cols-2 gap-2 pt-2">
                    <label className="space-y-1 min-w-0">
                        <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{_(msg`Max reach`)} <span>{_(msg`mm`)}</span></span>
                        <NumberInput value={options.maxReachMm} onChange={(value) => updateOptions({ maxReachMm: value })}
                            min={1} max={30} step={1} showStepper={false} aria-label={_(msg`Maximum reach in millimeters`)}
                            className="ui-input h-9 w-full text-center" />
                    </label>
                    <label className="space-y-1 min-w-0">
                        <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{_(msg`Max branch angle`)} <span>{_(msg`°`)}</span></span>
                        <NumberInput value={options.maxJoinAngleDeg} onChange={(value) => updateOptions({ maxJoinAngleDeg: value })}
                            min={10} max={75} step={5} showStepper={false} aria-label={_(msg`Maximum branch angle from vertical in degrees`)}
                            className="ui-input h-9 w-full text-center" />
                    </label>
                </div>
            </details>
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1 gap-1.5" disabled={!!selectionError}
                    onClick={() => setError(previewClusterOptimization(context, options))}>
                    <ScanEye className="h-3.5 w-3.5" />{_(msg`Preview`)}
                </Button>
                <Button variant="accent" size="sm" className="flex-1 gap-1.5" disabled={!canApply}
                    onClick={() => { applyClusterOptimization(context, options); }}>
                    <Check className="h-3.5 w-3.5" />{_(msg`Apply`)}
                </Button>
                {preview.proposal && <Button variant="secondary" size="sm" title={_(msg`Cancel preview`)} aria-label={_(msg`Cancel preview`)} onClick={cancelClusterPreview}><X className="h-3.5 w-3.5" /></Button>}
            </div>
            <div role="status" className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {error ? errorMessage(_, error) : preview.status === 'applied' ? _(msg`Cluster optimization applied as one undoable change.`) : selectionError ? errorMessage(_, selectionError)
                    : preview.status === 'stale' ? _(msg`Selection, geometry, or limits changed. Preview again before applying.`)
                    : preview.status === 'ready' ? result?.changedCount ? _(msg`Preview ready. Review the supports in the scene before applying.`) : _(msg`No safe joins found within these limits.`)
                    : _(msg`Preview joins selected trunks while preserving their contacts.`)}
            </div>
        </div>
    );
}
