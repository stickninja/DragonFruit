import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDifferentialMaterialSettings } from '../../plugins/resolveDifferentialSettings';
import type { MaterialSettingsSource } from '../../plugins/complexPluginContracts';
import simple from '../../../../plugins/ctb/materialSettings/settings_simple.json';
import twostage from '../../../../plugins/ctb/materialSettings/settings_twostage.diff.json';
import allfields from '../../../../plugins/ctb/materialSettings/settings_allfields.diff.json';

const sources = { simple, twostage, allfields } as Record<string, MaterialSettingsSource>;

for (const mode of ['simple', 'twostage', 'allfields']) {
  test(`${mode} CTB material settings expose independent PWM defaults once`, () => {
    const fields = resolveDifferentialMaterialSettings(sources[mode], sources).fields;
    for (const [key, path] of [
      ['projectorPwmPercent', 'ctb.projectorPwmPercent'],
      ['bottomProjectorPwmPercent', 'ctb.bottomProjectorPwmPercent'],
    ]) {
      const matches = fields.filter((field) => field.key === key);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].metadataPath, path);
      assert.equal(matches[0].placement?.cardId, 'light-settings');
      assert.equal(matches[0].min, 1);
    }
  });
}
