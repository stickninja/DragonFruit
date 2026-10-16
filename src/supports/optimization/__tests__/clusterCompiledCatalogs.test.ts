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
const messages = [
    'Optimize', 'Cluster optimization', 'Trunk reduction', 'Trunks', 'Advanced limits',
    'Max reach', 'Max branch angle', 'Maximum reach in millimeters', 'Maximum branch angle from vertical in degrees',
    'Preview', 'Apply', 'Cancel preview', 'Contact check failed', 'mm', '°',
    'Select at least two trunks to optimize.', 'Select supports from the active model only.',
    'Select supports on the active plate.', 'Model geometry is unavailable. Reload the model before previewing.',
    'Cluster preview failed. Adjust the selection or limits and try again.',
    'Selection, geometry, or limits changed. Preview again before applying.',
    'Cluster optimization applied as one undoable change.',
    'Preview ready. Review the supports in the scene before applying.',
    'No safe joins found within these limits.', 'Preview joins selected trunks while preserving their contacts.',
];
const countMessages = [
    ['{count, plural, one {# trunk selected} other {# trunks selected}}', 'trunk selected', 'trunks selected'],
    ['{count, plural, one {# contact preserved} other {# contacts preserved}}', 'contact preserved', 'contacts preserved'],
    ['{count, plural, one {# fewer trunk} other {# fewer trunks}}', 'fewer trunk', 'fewer trunks'],
    ['{count, plural, one {# support kept by geometry limits} other {# supports kept by geometry limits}}', 'support kept by geometry limits', 'supports kept by geometry limits'],
];

for (const locale of SUPPORTED_LOCALES) {
    test(`compiled ${locale} catalog resolves all Cluster labels by production ID`, () => {
        const catalog = catalogs[locale];
        const i18n = setupI18n({ locale, messages: { [locale]: catalog } });
        for (const message of messages) {
            const id = generateMessageId(message);
            assert.ok(Object.hasOwn(catalog, id), `${locale}: missing compiled entry for ${message}; extract and compile catalogs`);
            const text = i18n._({ id, values: { count: '12' } });
            assert.ok(text.trim());
            assert.notEqual(text, id);
            assert.ok(!text.includes('{count}'));
            if (locale === 'en') assert.equal(text, message.replace('{count}', '12'));
        }
        for (const [message, singular, multiple] of countMessages) {
            const id = generateMessageId(message);
            assert.ok(Object.hasOwn(catalog, id), `${locale}: missing compiled count message`);
            for (const count of [1, 12]) {
                const text = i18n._({ id, values: { count } });
                assert.notEqual(text, id);
                assert.ok(!text.includes('{count'));
                if (locale === 'en') assert.equal(text, `${count} ${count === 1 ? singular : multiple}`);
            }
        }
        const historyId = generateMessageId('Cluster optimization', 'Undo history entry');
        assert.ok(Object.hasOwn(catalog, historyId));
        assert.notEqual(i18n._({ id: historyId }), historyId);
    });
}
