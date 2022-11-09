import { test, module } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import { find, click, visit } from '@ember/test-helpers';
import { setupSentryTest } from '../helpers/setup-sentry';

const SLOW_TRANSITION_WAIT = 3000;

function getTestSentryTransactions() {
  return window._sentryTestEvents.filter(event => event['type'] === 'transaction');
}

function assertSentryTransactionCount(assert, count) {
  assert.equal(getTestSentryTransactions().length, count, 'Check correct number of Sentry events were sent');
}

function assertSentryCall(assert, callNumber, options) {
  const sentryTestEvents = getTestSentryTransactions();
  const event = sentryTestEvents[callNumber];

  assert.ok(options.spanCount || options.spans, 'Must add spanCount or spans to assertion');
  if (options.spanCount) {
    assert.equal(event.spans.length, options.spanCount);
  }
  if (options.spans) {
    // instead of checking the specific order of runloop spans (which is brittle),
    // we check (below) that _any_ runloop spans are added
    const spans = event.spans
      .filter(span => !span.op.startsWith('ui.ember.runloop.'))
      .map(s => {
        return `${s.op} | ${s.description}`;
      });

    assert.true(
      event.spans.some(span => span.op.startsWith('ui.ember.runloop.')),
      'it captures runloop spans',
    );
    assert.deepEqual(spans, options.spans, `Has correct spans`);
  }

  assert.equal(event.transaction, options.transaction);
  assert.equal(event.tags.fromRoute, options.tags.fromRoute);
  assert.equal(event.tags.toRoute, options.tags.toRoute);

  if (options.durationCheck) {
    const duration = (event.timestamp - event.start_timestamp) * 1000;
    assert.ok(options.durationCheck(duration), `duration (${duration}ms) passes duration check`);
  }
}

module('Acceptance | Sentry Performance', function (hooks) {
  setupApplicationTest(hooks);
  setupSentryTest(hooks);

  test('Test transaction', async function (assert) {
    assert.expect(7);

    await visit('/tracing');

    assertSentryTransactionCount(assert, 1);
    assertSentryCall(assert, 0, {
      spans: [
        'ui.ember.transition | route:undefined -> route:tracing',
        'ui.ember.component.render | component:test-section',
      ],
      transaction: 'route:tracing',
      tags: {
        fromRoute: undefined,
        toRoute: 'tracing',
      },
    });
  });

  test('Test navigating to slow route', async function (assert) {
    assert.expect(8);

    await visit('/tracing');
    const button = find('[data-test-button="Transition to slow loading route"]');

    await click(button);

    assertSentryTransactionCount(assert, 2);
    assertSentryCall(assert, 1, {
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
      tags: {
        fromRoute: 'tracing',
        toRoute: 'slow-loading-route.index',
      },
    });
  });
});
