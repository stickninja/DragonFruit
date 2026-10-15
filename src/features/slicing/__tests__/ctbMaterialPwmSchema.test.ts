import assert from 'node:assert/strict';
import test from 'node:test';
import { getProfileLocalMaterialSettingsAdapter } from '../../plugins/pluginRegistry';

for (const mode of ['simple', 'twostage', 'allfields']) {
  test(`${mode} CTB material settings expose independent PWM defaults once`, () => {
    const adapter = getProfileLocalMaterialSettingsAdapter('.ctb', mode);
    assert.ok(adapter, 'CTB adapter is registered');
    const fields = adapter.fields;
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
