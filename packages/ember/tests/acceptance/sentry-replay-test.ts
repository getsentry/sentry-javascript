import { visit } from '@ember/test-helpers';
import * as Sentry from '@sentry/ember';
import type { ReplayContainer } from '@sentry/replay/build/npm/types/types';
import { setupApplicationTest } from 'ember-qunit';
import { module, test } from 'qunit';

import { setupSentryTest } from '../helpers/setup-sentry';

module('Acceptance | Sentry Session Replay', function (hooks) {
  setupApplicationTest(hooks);
  setupSentryTest(hooks);

  test('Test replay', async function (assert) {
    await visit('/replay');

    const integration = Sentry.getCurrentHub().getIntegration(Sentry.Replay);
    assert.ok(integration);

    const replay = (integration as Sentry.Replay)['_replay'] as ReplayContainer;

    assert.true(replay.isEnabled());
    assert.false(replay.isPaused());
  });
});
