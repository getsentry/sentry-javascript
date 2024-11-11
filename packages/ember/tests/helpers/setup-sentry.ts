import type { TestContext } from '@ember/test-helpers';
import { resetOnerror, setupOnerror } from '@ember/test-helpers';
import sinon from 'sinon';

export type SentryTestContext = TestContext & {
  errorMessages: string[];
  fetchStub: sinon.SinonStub;
  qunitOnUnhandledRejection: sinon.SinonStub;
  _windowOnError: OnErrorEventHandler;
};

export function setupSentryTest(hooks: NestedHooks): void {
  hooks.beforeEach(async function (this: SentryTestContext) {
    await window._sentryPerformanceLoad;
    window._sentryTestEvents = [];
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
      QUnit.onUncaughtException ? 'onUncaughtException' : 'onUnhandledRejection',
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
    window.onerror = error => {
      errorMessages.push(error.toString().split('Error: ')[1]!);
    };
  });

  hooks.afterEach(function (this: SentryTestContext) {
    this.fetchStub.restore();
    this.qunitOnUnhandledRejection.restore();
    window.onerror = this._windowOnError;
    resetOnerror();
  });
}
