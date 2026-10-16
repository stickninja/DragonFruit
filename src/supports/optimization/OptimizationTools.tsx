"use client";

import React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { ClusterOptimizationCard } from './ClusterOptimizationCard';
import { GridOptimizationCard } from './GridOptimizationCard';
import { cancelClusterPreview } from './clusterPreview';
import { cancelGridPreview, type GridPreviewContext } from './gridPreview';

export function OptimizationTools({ context }: { context: GridPreviewContext }) {
    const { _ } = useLingui();
    const [tool, setTool] = React.useState<'cluster' | 'grid'>('cluster');
    return <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-md p-1" role="group" aria-label={_(msg`Optimization tool`)} style={{ background: 'var(--surface-0)' }}>
            {(['cluster', 'grid'] as const).map((value) => <button key={value} type="button" aria-pressed={tool === value}
                className="rounded px-2 py-1.5 text-xs font-medium" style={{ background: tool === value ? 'var(--surface-2)' : undefined, color: tool === value ? 'var(--text-strong)' : 'var(--text-muted)' }}
                onClick={() => { if (tool !== value) { cancelClusterPreview(); cancelGridPreview(); setTool(value); } }}>
                {value === 'cluster' ? _(msg`Cluster`) : _(msg`Grid`)}
            </button>)}
        </div>
        <div hidden={tool !== 'cluster'}><ClusterOptimizationCard context={context} /></div>
        <div hidden={tool !== 'grid'}><GridOptimizationCard context={context} /></div>
    </div>;
}
