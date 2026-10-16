import assert from 'node:assert/strict';
import test from 'node:test';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { AutoBracingSettingsCard } from '../AutoBracingSettingsCard';
import { applyAutoBracingSettingsPatch, createDefaultAutoBracingSettings } from '../settings';

test('Bracing card switches fixed/relative fields and toggles live bracing while retaining existing controls', async () => {
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let applied = 0;
    let cleared = 0;
    function Card() {
        const [settings, setSettings] = useState(createDefaultAutoBracingSettings);
        return <AutoBracingSettingsCard
            settings={settings}
            onChange={(patch) => setSettings((current) => applyAutoBracingSettingsPatch(current, patch))}
            onAutoBrace={() => applied++}
            onClearBraces={() => cleared++}
        />;
    }
    const button = (text: string) => {
        const result = [...container.querySelectorAll('button')].find((element) => element.textContent === text);
        assert.ok(result, `button ${text} exists`);
        return result;
    };
    try {
        await act(async () => root.render(<I18nProvider i18n={i18n}><Card /></I18nProvider>));
        assert.equal(button('Fixed').getAttribute('aria-pressed'), 'true');
        assert.equal(container.querySelector('[role="switch"]')?.getAttribute('aria-checked'), 'false');
        // i18n-ignore: English accessibility selector in the English-locale test.
        assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Brace Diameter"]')?.value, '1');
        await act(async () => button('Relative').click());
        assert.equal(button('Relative').getAttribute('aria-pressed'), 'true');
        // i18n-ignore: English accessibility selector in the English-locale test.
        assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Smaller parent diameter percent"]')?.value, '50');
        await act(async () => (container.querySelector('[role="switch"]') as HTMLButtonElement).click());
        assert.equal(container.querySelector('[role="switch"]')?.getAttribute('aria-checked'), 'true');
        await act(async () => button('Fixed').click());
        // i18n-ignore: English accessibility selector in the English-locale test.
        assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Brace Diameter"]')?.value, '1');
        // i18n-ignore: Expected English button labels used only as test selectors.
        for (const label of ['Low', 'Mid', 'High', 'Apply', 'Clear All']) assert.ok(button(label));
        await act(async () => { button('Apply').click(); button('Clear All').click(); });
        assert.equal(applied, 1);
        assert.equal(cleared, 1);
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});
