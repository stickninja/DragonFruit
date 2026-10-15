'use client';

import { ExternalLink } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { Button } from '@/components/atoms';

const RELEASES_URL = 'https://github.com/stickninja/DragonFruit/releases';

async function openReleasesPage() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external_url', { url: RELEASES_URL });
  } catch {
    window.open(RELEASES_URL, '_blank', 'noopener,noreferrer');
  }
}

export function UpdatesSettingsTab() {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--surface-1)',
      }}
    >
      <div className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
        <Trans>Manual updates</Trans>
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        <Trans>Visit the fork’s releases page to find new versions and download an installer.</Trans>
      </p>
      <Button
        type="button"
        onClick={() => void openReleasesPage()}
        variant="secondary"
        size="sm"
        className="mt-3 inline-flex items-center gap-1.5"
      >
        <Trans>DragonFruit (stickninja) releases</Trans>
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
