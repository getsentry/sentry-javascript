import Ember from 'ember';
import sinon from 'sinon';
import { _instrumentEmberRouter } from '@sentry/ember/instance-initializers/sentry-performance';

// Keep a reference to the original startTransaction as the application gets re-initialized and setup for
// the integration doesn't occur again after the first time.
let _routerStartTransaction;

export function setupSentryTest(hooks) {
  hooks.beforeEach(async function() {
    await window._sentryPerformanceLoad;
    window._sentryTestEvents = [];
    const errorMessages = [];
    this.errorMessages = errorMessages;

    const routerMain = this.owner.lookup('router:main');
    const routerService = this.owner.lookup('service:router');

    if (routerService._sentryInstrumented) {
      _routerStartTransaction = routerService._startTransaction;
    } else {
      _instrumentEmberRouter(routerService, routerMain, {}, _routerStartTransaction);
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
}
