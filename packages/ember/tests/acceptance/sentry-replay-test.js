import { test, module } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import { visit } from '@ember/test-helpers';
import { setupSentryTest } from '../helpers/setup-sentry';
import * as Sentry from '@sentry/ember';

module('Acceptance | Sentry Session Replay', function (hooks) {
  setupApplicationTest(hooks);
  setupSentryTest(hooks);

  test('Test replay', async function (assert) {
    await visit('/replay');

    const replay = Sentry.getCurrentHub().getIntegration(Sentry.Replay);
    assert.ok(replay);

    assert.true(replay._replay.isEnabled());
    assert.false(replay._replay.isPaused());
  });
});
