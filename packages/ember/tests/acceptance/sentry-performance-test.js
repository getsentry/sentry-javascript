import { test, module } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import { find, click, visit } from '@ember/test-helpers';
import Ember from 'ember';
import sinon from 'sinon';
import { _instrumentEmberRouter } from '@sentry/ember/instance-initializers/sentry-performance';
import { startTransaction } from '@sentry/browser';

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
  assert.equal(event.spans.length, options.spanCount);
  assert.equal(event.transaction, options.transaction);
  assert.equal(event.tags.fromRoute, options.tags.fromRoute);
  assert.equal(event.tags.toRoute, options.tags.toRoute);

  if (options.durationCheck) {
    const duration = (event.timestamp - event.start_timestamp) * 1000;
    assert.ok(options.durationCheck(duration), `duration (${duration}ms) didn't pass duration check`);
  }
}

module('Acceptance | Sentry Transactions', function(hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(async function() {
    await window._sentryPerformanceLoad;
    window._sentryTestEvents = [];
    const errorMessages = [];
    this.errorMessages = errorMessages;

    const routerMain = this.owner.lookup('router:main');
    const routerService = this.owner.lookup('service:router');

    if (!routerService._sentryInstrumented) {
      _instrumentEmberRouter(routerService, routerMain, {}, startTransaction);
    }

    /**
     * Stub out fetch function to assert on Sentry calls.
     */
    this.fetchStub = sinon.stub(window, 'fetch');

    /**
     * Stops global test suite failures from unhandled rejections and allows assertion on them
     */
    this.qunitOnUnhandledRejection = sinon.stub(QUnit, 'onUnhandledRejection');

    QUnit.onError = function({ message }) {
      errorMessages.push(message.split('Error: ')[1]);
      return true;
    };

    Ember.onerror = function(...args) {
      const [error] = args;
      errorMessages.push(error.message);
      throw error;
    };

    this._windowOnError = window.onerror;

    /**
     * Will collect errors when run via testem in cli
     */
    window.onerror = function(error, ...args) {
      errorMessages.push(error.split('Error: ')[1]);
      if (this._windowOnError) {
        return this._windowOnError(error, ...args);
      }
    };
  });

  hooks.afterEach(function() {
    this.fetchStub.restore();
    this.qunitOnUnhandledRejection.restore();
    window.onerror = this._windowOnError;
  });

  test('Test transaction', async function(assert) {
    await visit('/tracing');
    assertSentryTransactionCount(assert, 1);
    assertSentryCall(assert, 0, {
      spanCount: 2,
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
      spanCount: 2,
      transaction: 'route:slow-loading-route',
      durationCheck: duration => duration > SLOW_TRANSITION_WAIT,
      tags: {
        fromRoute: 'tracing',
        toRoute: 'slow-loading-route',
      },
    });
  });
});
