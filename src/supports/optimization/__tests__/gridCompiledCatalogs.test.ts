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
    'Optimize', 'Optimization tool', 'Cluster', 'Grid', 'Grid optimization', 'Grid spacing', 'Selected trunks', 'Advanced limits',
    'Max shift', 'Max shaft angle', 'Maximum root shift in millimeters', 'Maximum shaft angle from vertical in degrees',
    'Optimization grid spacing in millimeters', 'Preview', 'Apply', 'Cancel preview', 'Contact check failed', 'mm', '°',
    'Select at least one trunk to optimize.', 'Select supports from the active model only.',
    'Select supports on the active plate.', 'Model geometry is unavailable. Reload the model before previewing.',
    'Unlock the active plate before optimizing supports.',
    'Grid preview failed. Adjust the selection or limits and try again.',
    'Selection, geometry, or limits changed. Preview again before applying.',
    'Grid optimization applied as one undoable change.',
    'Preview ready. Review the supports in the scene before applying.',
    'No safe grid shifts found within these limits.', 'Preview aligns selected trunk roots to a grid while preserving their contacts.',
];
const countMessages = [
    ['{count, plural, one {# trunk selected} other {# trunks selected}}', 'trunk selected', 'trunks selected'],
    ['{count, plural, one {# contact preserved} other {# contacts preserved}}', 'contact preserved', 'contacts preserved'],
    ['{count, plural, one {# trunk shifted} other {# trunks shifted}}', 'trunk shifted', 'trunks shifted'],
    ['{count, plural, one {# trunk unchanged} other {# trunks unchanged}}', 'trunk unchanged', 'trunks unchanged'],
    ['{count, plural, one {# trunk already aligned} other {# trunks already aligned}}', 'trunk already aligned', 'trunks already aligned'],
    ['{count, plural, one {# support kept by geometry limits} other {# supports kept by geometry limits}}', 'support kept by geometry limits', 'supports kept by geometry limits'],
];

for (const locale of SUPPORTED_LOCALES) {
    test(`compiled ${locale} catalog resolves all Grid labels by production ID`, () => {
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
        const historyId = generateMessageId('Grid optimization', 'Undo history entry');
        assert.ok(Object.hasOwn(catalog, historyId));
        assert.notEqual(i18n._({ id: historyId }), historyId);
    });
}
