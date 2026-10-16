import assert from 'node:assert/strict';
import test from 'node:test';
import { setupI18n, type Messages } from '@lingui/core';
import { generateMessageId } from '@lingui/message-utils/generateMessageId';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n';
import { messages as en } from '@/locales/en.js';
import { messages as es } from '@/locales/es.js';
import { messages as de } from '@/locales/de.js';
import { messages as fr } from '@/locales/fr.js';
import { messages as sk } from '@/locales/sk.js';
import { messages as cs } from '@/locales/cs.js';

const catalogs: Record<Locale, Messages> = { en, es, de, fr, sk, cs };

// These are the Stage 1 messages added to AutoBracingSettingsCard. Resolve only
// their compact production IDs: macro stubs and dev source-message fallbacks
// would conceal a missing entry in the committed runtime catalogs.
const bracingMessages = [
    'Brace sizing',
    'Fixed',
    'Relative',
    'Of smaller parent',
    'Smaller parent diameter percent',
    'Percentage of the smaller parent trunk diameter at the brace ends. The brace keeps one diameter along its length.',
    'Auto-brace while placing',
    'mm',
    '%',
];

for (const locale of SUPPORTED_LOCALES) {
    test(`compiled ${locale} catalog resolves Stage 1 bracing labels and units by production ID`, () => {
        const catalog = catalogs[locale];
        const i18n = setupI18n({ locale, messages: { [locale]: catalog } });
        for (const message of bracingMessages) {
            const id = generateMessageId(message);
            assert.ok(Object.hasOwn(catalog, id), `${locale}: missing compiled entry for ${message} (${id}); run npm run i18n:compile`);
            const translated = i18n._({ id });
            assert.ok(translated.trim().length > 0, `${locale}: empty compiled translation for ${message}`);
            assert.notEqual(translated, id, `${locale}: untranslated production ID for ${message}`);
            if (locale === 'en') assert.equal(translated, message);
        }
    });
}
