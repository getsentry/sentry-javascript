import { getContext, resetOnerror, setupOnerror } from '@ember/test-helpers';
import { setupPerformance, _resetGlobalInstrumentation } from '@sentry/ember';
import sinon from 'sinon';

import type { TestContext } from '@ember/test-helpers';

import type ApplicationInstance from '@ember/application/instance';

export type SentryTestContext = TestContext & {
  errorMessages: string[];
  fetchStub: sinon.SinonStub;
  qunitOnUnhandledRejection: sinon.SinonStub;
  _windowOnError: OnErrorEventHandler;
};

export function setupSentryTest(hooks: NestedHooks): void {
  hooks.beforeEach(function (this: SentryTestContext) {
    window._sentryTestEvents = [];

    // Set up performance instrumentation using the test app instance
    const context = getContext() as { owner?: ApplicationInstance } | undefined;
    if (context?.owner) {
      setupPerformance(context.owner, {
        transitionTimeout: 5000,
        minimumRunloopQueueDuration: 5,
        minimumComponentRenderDuration: 0,
      });
    }
    const errorMessages: string[] = [];
    this.errorMessages = errorMessages;

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
      QUnit.onUncaughtException
        ? 'onUncaughtException'
        : 'onUnhandledRejection',
    );

    // @ts-expect-error this is fine
    QUnit.onError = function ({ message }: { message: string }) {
      errorMessages.push(message.split('Error: ')[1]!);
      return true;
    };

    setupOnerror(function (error: Error) {
      errorMessages.push(error.message);
      throw error;
    });

    this._windowOnError = window.onerror;

    /**
     * Will collect errors when run via testem in cli
     */
    window.onerror = (error) => {
      errorMessages.push(error.toString().split('Error: ')[1]!);
    };
  });

  hooks.afterEach(function (this: SentryTestContext) {
    _resetGlobalInstrumentation();
    this.fetchStub.restore();
    this.qunitOnUnhandledRejection.restore();
    window.onerror = this._windowOnError;
    resetOnerror();
  });
}

declare global {
  interface Window {
    _sentryTestEvents: unknown[];
  }
}
