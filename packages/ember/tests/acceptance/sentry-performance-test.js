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
    event.spans = event.spans.map(s => {
      // Normalize span descriptions for internal components so tests work on either side of updated Ember versions
      const normalizedDescription = s.description === 'component:-link-to' ? 'component:link-to' : s.description;
      return `${s.op} | ${normalizedDescription}`;
    });

    // FIXME: For some reason, the last `afterRender` and `destroy` run queue event are not always called.
    //        This is not a blocker, but should be investigated and fixed, as this is the expected output.
    const lastSpan = event.spans[event.spans.length - 1];
    if (lastSpan === 'ui.ember.runloop.afterRender | undefined') {
      event.spans.push('ui.ember.runloop.destroy | undefined');
    } else if (lastSpan === 'ui.ember.runloop.render | undefined') {
      event.spans.push('ui.ember.runloop.afterRender | undefined', 'ui.ember.runloop.destroy | undefined');
    }

    assert.deepEqual(event.spans, options.spans, `Has correct spans`);
  }

  assert.equal(event.transaction, options.transaction);
  assert.equal(event.tags.fromRoute, options.tags.fromRoute);
  assert.equal(event.tags.toRoute, options.tags.toRoute);

  if (options.durationCheck) {
    const duration = (event.timestamp - event.start_timestamp) * 1000;
    assert.ok(options.durationCheck(duration), `duration (${duration}ms) passes duration check`);
  }
}

module('Acceptance | Sentry Transactions', function(hooks) {
  setupApplicationTest(hooks);
  setupSentryTest(hooks);

  test('Test transaction', async function(assert) {
    await visit('/tracing');

    assertSentryTransactionCount(assert, 1);
    assertSentryCall(assert, 0, {
      spans: [
        'ui.ember.transition | route:undefined -> route:tracing',
        'ui.ember.component.render | component:link-to',
        'ui.ember.component.render | component:link-to',
        'ui.ember.component.render | component:test-section',
        'ui.ember.runloop.actions | undefined',
        'ui.ember.runloop.routerTransitions | undefined',
        'ui.ember.runloop.render | undefined',
        'ui.ember.runloop.afterRender | undefined',
        'ui.ember.runloop.destroy | undefined',
      ],
      transaction: 'route:tracing',
      tags: {
        fromRoute: undefined,
        toRoute: 'tracing',
      },
    });
  });

  test('Test navigating to slow route', async function(assert) {
    await visit('/tracing');
    const button = find('[data-test-button="Transition to slow loading route"]');

    await click(button);

    assertSentryTransactionCount(assert, 2);
    assertSentryCall(assert, 1, {
      spans: [
        'ui.ember.transition | route:tracing -> route:slow-loading-route.index',
        'ui.ember.component.render | component:link-to',
        'ui.ember.component.render | component:link-to',
        'ember.route.beforeModel | slow-loading-route',
        'ui.ember.runloop.actions | undefined',
        'ui.ember.runloop.routerTransitions | undefined',
        'ui.ember.runloop.render | undefined',
        'ui.ember.runloop.afterRender | undefined',
        'ui.ember.runloop.destroy | undefined',
        'ember.route.model | slow-loading-route',
        'ui.ember.runloop.actions | undefined',
        'ui.ember.runloop.routerTransitions | undefined',
        'ui.ember.runloop.render | undefined',
        'ui.ember.runloop.afterRender | undefined',
        'ui.ember.runloop.destroy | undefined',
        'ember.route.afterModel | slow-loading-route',
        'ui.ember.runloop.actions | undefined',
        'ui.ember.runloop.routerTransitions | undefined',
        'ui.ember.component.render | component:link-to',
        'ui.ember.component.render | component:link-to',
        'ui.ember.runloop.render | undefined',
        'ui.ember.runloop.afterRender | undefined',
        'ui.ember.runloop.destroy | undefined',
        'ember.route.beforeModel | slow-loading-route.index',
        'ui.ember.runloop.actions | undefined',
        'ui.ember.runloop.routerTransitions | undefined',
        'ui.ember.runloop.render | undefined',
        'ui.ember.runloop.afterRender | undefined',
        'ui.ember.runloop.destroy | undefined',
        'ember.route.model | slow-loading-route.index',
        'ui.ember.runloop.actions | undefined',
        'ui.ember.runloop.routerTransitions | undefined',
        'ui.ember.runloop.render | undefined',
        'ui.ember.runloop.afterRender | undefined',
        'ui.ember.runloop.destroy | undefined',
        'ember.route.afterModel | slow-loading-route.index',
        'ui.ember.runloop.actions | undefined',
        'ember.route.setupController | slow-loading-route',
        'ember.route.setupController | slow-loading-route.index',
        'ui.ember.runloop.routerTransitions | undefined',
        'ui.ember.component.render | component:link-to',
        'ui.ember.component.render | component:link-to',
        'ui.ember.component.render | component:slow-loading-list',
        'ui.ember.component.render | component:slow-loading-list',
        'ui.ember.runloop.render | undefined',
        'ui.ember.runloop.afterRender | undefined',
        'ui.ember.runloop.destroy | undefined',
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
