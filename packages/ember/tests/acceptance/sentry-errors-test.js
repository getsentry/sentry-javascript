import { test, module } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import { find, click, visit } from '@ember/test-helpers';
import { run } from '@ember/runloop';
import Ember from 'ember';
import sinon from 'sinon';

const defaultAssertOptions = {
  method: 'POST',
  errorBodyContains: [],
};

function assertSentryEventCount(assert, count) {
  assert.equal(window._sentryTestEvents.length, count, 'Check correct number of Sentry events were sent');
}

function assertSentryCall(assert, callNumber, options) {
  const sentryTestEvents = window._sentryTestEvents;
  const assertOptions = Object.assign({}, defaultAssertOptions, options);

  const event = sentryTestEvents[callNumber];

  /**
   * Body could be parsed here to check exact properties, but that requires too much implementation specific detail,
   * instead this loosely matches on contents to check the correct error is being sent.
   */
  assert.ok(assertOptions.errorBodyContains.length, 'Must pass strings to check against error body');
  const errorBody = JSON.stringify(event);
  assertOptions.errorBodyContains.forEach((bodyContent) => {
    assert.ok(errorBody.includes(bodyContent), `Checking that error body includes ${bodyContent}`);
  });
}

module('Acceptance | Sentry Errors', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    window._sentryTestEvents = [];
    const errorMessages = [];
    this.errorMessages = errorMessages;

    /**
     * Stub out fetch function to assert on Sentry calls.
     */
    this.fetchStub = sinon.stub(window, 'fetch');

    /**
     * Stops global test suite failures from unhandled rejections and allows assertion on them
     */
    this.qunitOnUnhandledRejection = sinon.stub(QUnit, 'onUnhandledRejection');

    QUnit.onError = function ({ message }) {
      errorMessages.push(message.split('Error: ')[1]);
      return true;
    };

    Ember.onerror = function (...args) {
      const [error] = args;
      errorMessages.push(error.message);
      throw error;
    };

    this._windowOnError = window.onerror;
    /**
     * Will collect errors when run via testem in cli
     */

    window.onerror = function (error, ...args) {
      errorMessages.push(error.split('Error: ')[1]);
      if (this._windowOnError) {
        return this._windowOnError(error, ...args);
      }
    };
  });

  hooks.afterEach(function () {
    this.fetchStub.restore();
    this.qunitOnUnhandledRejection.restore();
    window.onerror = this._windowOnError;
  });

  test('Check "Throw Generic Javascript Error"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Throw Generic Javascript Error"]');

    await click(button);

    assertSentryEventCount(assert, 1);
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "Throw EmberError"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Throw EmberError"]');

    await click(button);

    assertSentryEventCount(assert, 1);
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "Caught Thrown EmberError"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Caught Thrown EmberError"]');

    await click(button);

    assertSentryEventCount(assert, 0);
  });

  test('Check "Error From Fetch"', async function (assert) {
    this.fetchStub.onFirstCall().callsFake((...args) => {
      return this.fetchStub.callsThrough(args);
    });
    await visit('/');
    const button = find('[data-test-button="Error From Fetch"]');

    await click(button);

    const done = assert.async();

    run.next(() => {
      assertSentryEventCount(assert, 1);
      assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
      done();
    });
  });

  test('Check "Error in AfterRender"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Error in AfterRender"]');

    await click(button);

    assertSentryEventCount(assert, 1);
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "RSVP Rejection"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="RSVP Rejection"]');

    await click(button);

    assertSentryEventCount(assert, 1);
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryCall(assert, 0, { errorBodyContains: [this.qunitOnUnhandledRejection.getCall(0).args[0]] });
  });

  test('Check "Error inside RSVP"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Error inside RSVP"]');

    await click(button);

    assertSentryEventCount(assert, 1);
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });
});
