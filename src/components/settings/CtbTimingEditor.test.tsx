import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@/i18n';
import { createCtbTimingConfig } from '@/features/slicing/ctbTiming';
import type { MaterialDraft } from './profileFormAtoms';
import { CtbTimingEditor } from './CtbTimingEditor';

const config = createCtbTimingConfig({ lightOffDelaySec: 20 }, { lightOffDelaySec: 30 });
config.enabled = true;
config.overrides = [{ id: 'slow-lift', name: 'Slow lift', startLayer: 7, endLayer: 40, values: { lightOffDelaySec: 38.4 }, motion: { liftSpeedMmMin: 60 }, pwmPercent: 0 }];

const draft = {
  liftDistanceMm: 6, liftSpeedMmMin: 60, retractSpeedMmMin: 150, bottomLayerCount: 6,
  ctbTimingV1: config,
} as MaterialDraft;

function render(view: 'defaults' | 'overrides') {
  return renderToStaticMarkup(<I18nProvider i18n={i18n}>
    <CtbTimingEditor draft={draft} onDraftChange={() => {}} outputValues={{ '.ctb': {} }} onOutputValuesChange={() => {}} adapter={null}
      settingsMode="simple" formatVersion="v5" view={view} />
  </I18nProvider>);
}

test('CTB defaults and range controls stay in separate tabs', () => {
  const defaults = render('defaults');
  assert.match(defaults, /Burn-in/);
  assert.match(defaults, /Startup dummy layer/);
  assert.doesNotMatch(defaults, /Slow lift/);

  const overrides = render('overrides');
  assert.match(overrides, /Slow lift/);
  assert.match(overrides, /Layer override ranges/);
  assert.match(overrides, /Calculate raw LOD/);
  assert.doesNotMatch(overrides, /Startup dummy layer/);
});
