import { click, find, visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import { module, test } from 'qunit';
import { setupSentryTest } from '../helpers/setup-sentry';
import { assertSentryTransactionCount, assertSentryTransactions } from '../helpers/utils';

const SLOW_TRANSITION_WAIT = 3000;

module('Acceptance | Sentry Performance', function (hooks) {
  setupApplicationTest(hooks);
  setupSentryTest(hooks);

  test('Test transaction', async function (assert) {
    await visit('/tracing');

    assertSentryTransactionCount(assert, 1);
    assertSentryTransactions(assert, 0, {
      spans: [
        'ui.ember.transition | route:undefined -> route:tracing',
        'ui.ember.component.render | component:test-section',
      ],
      transaction: 'route:tracing',
      attributes: {
        fromRoute: undefined,
        toRoute: 'tracing',
      },
    });
  });

  test('Test navigating to slow route', async function (assert) {
    await visit('/tracing');

    await click('[data-test-button="Transition to slow loading route"]');

    assertSentryTransactionCount(assert, 2);
    assertSentryTransactions(assert, 1, {
      spans: [
        'ui.ember.transition | route:tracing -> route:slow-loading-route.index',
        'ui.ember.route.before_model | slow-loading-route',
        'ui.ember.route.model | slow-loading-route',
        'ui.ember.route.after_model | slow-loading-route',
        'ui.ember.route.before_model | slow-loading-route.index',
        'ui.ember.route.model | slow-loading-route.index',
        'ui.ember.route.after_model | slow-loading-route.index',
        'ui.ember.route.setup_controller | slow-loading-route',
        'ui.ember.route.setup_controller | slow-loading-route.index',
        'ui.ember.component.render | component:slow-loading-list',
        'ui.ember.component.render | component:slow-loading-list',
      ],
      transaction: 'route:slow-loading-route.index',
      durationCheck: duration => duration > SLOW_TRANSITION_WAIT,
      attributes: {
        fromRoute: 'tracing',
        toRoute: 'slow-loading-route.index',
      },
    });
  });

  test('Test page with loading state', async function (assert) {
    await visit('/with-loading');

    assertSentryTransactionCount(assert, 1);
    assertSentryTransactions(assert, 0, {
      spans: [
        'ui.ember.transition | route:undefined -> route:with-loading.index',
        'ui.ember.route.before_model | with-loading.index',
        'ui.ember.route.model | with-loading.index',
        'ui.ember.route.after_model | with-loading.index',
        'ui.ember.route.setup_controller | with-loading.index',
      ],
      transaction: 'route:with-loading.index',
      attributes: {
        fromRoute: undefined,
        toRoute: 'with-loading.index',
      },
    });
  });

  test('Test page with error state', async function (assert) {
    await visit('/with-error');

    // Ensure we are on error page
    assert.ok(find('#test-page-load-error'));

    assertSentryTransactionCount(assert, 1);
    assertSentryTransactions(assert, 0, {
      spans: [
        'ui.ember.transition | route:undefined -> route:with-error.index',
        'ui.ember.route.before_model | with-error.index',
        'ui.ember.route.model | with-error.index',
      ],
      transaction: 'route:with-error.index',
      attributes: {
        fromRoute: undefined,
        toRoute: 'with-error.index',
      },
    });
  });
});
