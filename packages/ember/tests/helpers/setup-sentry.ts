import type RouterService from '@ember/routing/router-service';
import type { TestContext } from '@ember/test-helpers';
import { resetOnerror, setupOnerror } from '@ember/test-helpers';
import { _instrumentEmberRouter } from '@sentry/ember/instance-initializers/sentry-performance';
import type { EmberRouterMain, EmberSentryConfig, StartTransactionFunction } from '@sentry/ember/types';
import sinon from 'sinon';

// Keep a reference to the original startTransaction as the application gets re-initialized and setup for
// the integration doesn't occur again after the first time.
let _routerStartTransaction: StartTransactionFunction | undefined;

export type SentryTestContext = TestContext & {
  errorMessages: string[];
  fetchStub: sinon.SinonStub;
  qunitOnUnhandledRejection: sinon.SinonStub;
  _windowOnError: OnErrorEventHandler;
};

type SentryRouterService = RouterService & {
  _startTransaction: StartTransactionFunction;
  _sentryInstrumented?: boolean;
};

export function setupSentryTest(hooks: NestedHooks): void {
  hooks.beforeEach(async function (this: SentryTestContext) {
    await window._sentryPerformanceLoad;
    window._sentryTestEvents = [];
    const errorMessages: string[] = [];
    this.errorMessages = errorMessages;

    // eslint-disable-next-line ember/no-private-routing-service
    const routerMain = this.owner.lookup('router:main') as EmberRouterMain;
    const routerService = this.owner.lookup('service:router') as SentryRouterService;

    if (routerService._sentryInstrumented) {
      _routerStartTransaction = routerService._startTransaction;
    } else if (_routerStartTransaction) {
      _instrumentEmberRouter(routerService, routerMain, {} as EmberSentryConfig, _routerStartTransaction);
    }

    /**
     * Stub out fetch function to assert on Sentry calls.
     */
    this.fetchStub = sinon.stub(window, 'fetch');

    /**
     * Stops global test suite failures from unhandled rejections and allows assertion on them.
     * onUncaughtException is used in QUnit 2.17 onwards.
     */
    this.qunitOnUnhandledRejection = sinon.stub(
      QUnit,
      // @ts-expect-error this is OK
      QUnit.onUncaughtException ? 'onUncaughtException' : 'onUnhandledRejection',
    );

    // @ts-expect-error this is fine
    QUnit.onError = ({ message }: { message: string }) => {
      errorMessages.push(message.split('Error: ')[1]);
      return true;
    };

    setupOnerror(error => {
      errorMessages.push(error.message);
      throw error;
    });

    this._windowOnError = window.onerror;

    /**
     * Will collect errors when run via testem in cli
     */
    window.onerror = error => {
      errorMessages.push(error.toString().split('Error: ')[1]);
    };
  });

  hooks.afterEach(function (this: SentryTestContext) {
    this.fetchStub.restore();
    this.qunitOnUnhandledRejection.restore();
    window.onerror = this._windowOnError;
    resetOnerror();
  });
}
