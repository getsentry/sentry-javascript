import { visit } from '@ember/test-helpers';
import * as Sentry from '@sentry/ember';
import type { BrowserClient, Replay } from '@sentry/ember';
import { setupApplicationTest } from 'ember-qunit';
import { module, test } from 'qunit';

import { setupSentryTest } from '../helpers/setup-sentry';

module('Acceptance | Sentry Session Replay', function (hooks) {
  setupApplicationTest(hooks);
  setupSentryTest(hooks);

  test('Test replay', async function (assert) {
    await visit('/replay');

    const integration = Sentry.getClient<BrowserClient>()?.getIntegrationByName('Replay');
    assert.ok(integration);

    const replay = (integration as Sentry.Replay)['_replay'] as Replay['_replay'];

    assert.true(replay.isEnabled());
    assert.false(replay.isPaused());
  });
});
