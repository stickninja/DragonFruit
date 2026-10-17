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
import { subscribeToAutoBraceMeshes } from '../autoBracing/meshGeometryStore';
import { useResolvedSelectionState } from '../interaction/shared/selection/resolvedSelectionStore';
import { DEFAULT_GRID_OPTIMIZATION_OPTIONS } from './gridOptimization';
import {
    applyGridOptimization, cancelGridPreview, gridSelectionError,
    getGridPreview, invalidateGridPreview, previewGridOptimization, subscribeGridPreview,
    type GridPreviewContext, type GridPreviewError,
} from './gridPreview';

// Interpolation stays outside React Compiler's component scope.
function selectedMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# trunk selected', other: '# trunks selected' })}`); }
function contactsMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# contact preserved', other: '# contacts preserved' })}`); }
function shiftedMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# trunk shifted', other: '# trunks shifted' })}`); }
function unchangedMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# trunk unchanged', other: '# trunks unchanged' })}`); }
function skippedMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# support kept by geometry limits', other: '# supports kept by geometry limits' })}`); }
function alignedMessage(_: I18n['_'], count: number) { return _(msg`${plural(count, { one: '# trunk already aligned', other: '# trunks already aligned' })}`); }

function errorMessage(_: I18n['_'], error: GridPreviewError) {
    switch (error) {
        case 'locked': return _(msg`Unlock the active plate before optimizing supports.`);
        case 'selection': return _(msg`Select at least one trunk to optimize.`);
        case 'model': return _(msg`Select supports from the active model only.`);
        case 'plate': return _(msg`Select supports on the active plate.`);
        case 'mesh': return _(msg`Model geometry is unavailable. Reload the model before previewing.`);
        case 'failed': return _(msg`Grid preview failed. Adjust the selection or limits and try again.`);
    }
}

export function GridOptimizationCard({ context }: { context: GridPreviewContext }) {
    const { _ } = useLingui();
    const fmt = useLocaleFormat();
    const [options, setOptions] = React.useState({ ...DEFAULT_GRID_OPTIMIZATION_OPTIONS });
    const [error, setError] = React.useState<GridPreviewError | null>(null);
    const preview = React.useSyncExternalStore(subscribeGridPreview, getGridPreview, getGridPreview);
    const support = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const selection = useResolvedSelectionState();
    const count = selection.selectedIds.filter((id) => support.trunks[id]).length;
    const selectionError = React.useSyncExternalStore(
        subscribeToAutoBraceMeshes,
        () => gridSelectionError(context),
        () => gridSelectionError(context),
    );
    const result = preview.result;
    const contactsPreserved = !!result && result.contactCountBefore === result.contactCountAfter;
    const canApply = !selectionError && preview.status === 'ready' && !!result?.changedCount && contactsPreserved;
    const plateModelsKey = [...context.plateModelIds].sort().join('\n');
    // Leaving support edit restores normalized settings with new object identities.
    // Only changed values invalidate the geometry checked by the proposal.
    const autoBracingKey = JSON.stringify(context.autoBracingSettings);
    const gridKey = JSON.stringify(context.gridSettings);
    const boundsKey = JSON.stringify(context.plateBounds);

    React.useEffect(() => {
        invalidateGridPreview();
        setError(null);
    }, [context.modelId, context.plateId, context.modelPlateId, context.isPlateLocked, autoBracingKey, gridKey, plateModelsKey, boundsKey]);
    React.useEffect(() => () => cancelGridPreview(), []);

    const updateOptions = (patch: Partial<typeof options>) => {
        invalidateGridPreview();
        setError(null);
        setOptions((current) => ({ ...current, ...patch }));
    };

    return (
        <div className="space-y-3" data-grid-optimization>
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>{_(msg`Grid optimization`)}</h4>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{selectedMessage(_, count)}</span>
            </div>
            <label className="block space-y-1.5">
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{_(msg`Grid spacing`)} <span>{_(msg`mm`)}</span></span>
                <NumberInput value={options.spacingMm} onChange={(value) => updateOptions({ spacingMm: Math.min(30, Math.max(0.5, value)) })}
                    min={0.5} max={30} step={0.5} showStepper={false} aria-label={_(msg`Optimization grid spacing in millimeters`)}
                    className="ui-input h-9 w-full text-center" />
            </label>
            {result && (
                <div className="rounded-md border p-2.5 space-y-2" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-0)' }}>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-strong)' }}>
                        <span>{_(msg`Selected trunks`)}</span>
                        <span className="font-semibold tabular-nums">{fmt.number(result.selectedTrunkCount)}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <span>{contactsPreserved ? contactsMessage(_, result.contactCountAfter) : _(msg`Contact check failed`)}</span>
                        <span>{shiftedMessage(_, result.changedCount)}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <span>{unchangedMessage(_, result.selectedTrunkCount - result.changedCount)}</span>
                        {result.alignedTrunkCount > result.changedCount && <span>{alignedMessage(_, result.alignedTrunkCount - result.changedCount)}</span>}
                    </div>
                    {result.skipped.length > 0 && <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{skippedMessage(_, result.skipped.length)}</div>}
                </div>
            )}
            <details className="border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
                <summary className="cursor-pointer text-xs" style={{ color: 'var(--text-muted)' }}>{_(msg`Advanced limits`)}</summary>
                <div className="grid grid-cols-2 gap-2 pt-2">
                    <label className="space-y-1 min-w-0">
                        <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{_(msg`Max shift`)} <span>{_(msg`mm`)}</span></span>
                        <NumberInput value={options.maxMoveMm} onChange={(value) => updateOptions({ maxMoveMm: Math.min(30, Math.max(0, value)) })}
                            min={0} max={30} step={0.5} showStepper={false} aria-label={_(msg`Maximum root shift in millimeters`)}
                            className="ui-input h-9 w-full text-center" />
                    </label>
                    <label className="space-y-1 min-w-0">
                        <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{_(msg`Max shaft angle`)} <span>{_(msg`°`)}</span></span>
                        <NumberInput value={options.maxJoinAngleDeg} onChange={(value) => updateOptions({ maxJoinAngleDeg: Math.min(45, Math.max(5, value)) })}
                            min={5} max={45} step={5} showStepper={false} aria-label={_(msg`Maximum shaft angle from vertical in degrees`)}
                            className="ui-input h-9 w-full text-center" />
                    </label>
                </div>
            </details>
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1 gap-1.5" disabled={!!selectionError}
                    onClick={() => setError(previewGridOptimization(context, options))}>
                    <ScanEye className="h-3.5 w-3.5" />{_(msg`Preview`)}
                </Button>
                <Button variant="accent" size="sm" className="flex-1 gap-1.5" disabled={!canApply}
                    onClick={() => { applyGridOptimization(context, options); }}>
                    <Check className="h-3.5 w-3.5" />{_(msg`Apply`)}
                </Button>
                {preview.proposal && <Button variant="secondary" size="sm" title={_(msg`Cancel preview`)} aria-label={_(msg`Cancel preview`)} onClick={cancelGridPreview}><X className="h-3.5 w-3.5" /></Button>}
            </div>
            <div role="status" className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {error ? errorMessage(_, error) : preview.status === 'applied' ? _(msg`Grid optimization applied as one undoable change.`) : selectionError ? errorMessage(_, selectionError)
                    : preview.status === 'stale' ? _(msg`Selection, geometry, or limits changed. Preview again before applying.`)
                    : preview.status === 'ready' ? result?.changedCount ? _(msg`Preview ready. Review the supports in the scene before applying.`) : _(msg`No safe grid shifts found within these limits.`)
                    : _(msg`Preview aligns selected trunk roots to a grid while preserving their contacts.`)}
            </div>
        </div>
    );
}
