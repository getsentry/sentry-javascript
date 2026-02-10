import { module, test } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import { visit } from '@ember/test-helpers';
import * as Sentry from '@sentry/ember';
import { setupSentryTest } from '../helpers/setup-sentry.ts';

import type { BrowserClient, replayIntegration } from '@sentry/ember';

module('Acceptance | Sentry Session Replay', function (hooks) {
  setupApplicationTest(hooks);
  setupSentryTest(hooks);

  test('Test replay', async function (assert) {
    await visit('/replay');

    const integration =
      Sentry.getClient<BrowserClient>()?.getIntegrationByName<
        ReturnType<typeof replayIntegration>
      >('Replay');
    assert.ok(integration);

    const replay = integration!['_replay'];

    assert.true(replay.isEnabled());
    assert.false(replay.isPaused());
  });
});
