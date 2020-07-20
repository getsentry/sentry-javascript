import { test, module } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import { find, click, visit } from '@ember/test-helpers';
import { run } from '@ember/runloop';
import sinon from 'sinon';
import RSVP from 'rsvp';

const defaultAssertOptions = {
  method: 'POST',
  urlIncludes: '/store/',
  errorBodyContains: [],
};

function assertSentryCall(assert, callNumber, options) {
  const stubbedFetch = window.fetch;
  const assertOptions = Object.assign({}, defaultAssertOptions, options);

  const call = stubbedFetch.getCall(callNumber);
  assert.equal(call.args.length, 2, 'Called with same number of args');
  assert.ok(call.args[0].includes(assertOptions.urlIncludes), 'Fetch url matches');
  assert.equal(call.args[1].method, assertOptions.method, 'Fetch method matches');

  /**
   * Body could be parsed here to check exact properties, but that requires too much implementation specific detail,
   * instead this loosely matches on contents to check the correct error is being sent.
   */
  assert.ok(assertOptions.errorBodyContains.length, 'Must pass strings to check against error body');
  const errorBody = call.args[1].body;
  assertOptions.errorBodyContains.forEach((bodyContent) => {
    assert.ok(errorBody.includes(bodyContent), `Checking that error body includes ${bodyContent}`);
  });
}

module('Acceptance | Sentry Errors', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
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
  });

  hooks.afterEach(function () {
    this.fetchStub.restore();
    this.qunitOnUnhandledRejection.restore();
  });

  test('Check "Throw Generic Javascript Error"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Throw Generic Javascript Error"]');

    await click(button);

    assert.equal(window.fetch.getCalls().length, 1, 'Fetch was called once');
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "Throw EmberError"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Throw EmberError"]');

    await click(button);

    assert.equal(window.fetch.getCalls().length, 1, 'Fetch was called once');
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "Caught Thrown EmberError"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Caught Thrown EmberError"]');

    await click(button);

    assert.equal(window.fetch.getCalls().length, 0, 'Error should be caught');
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
      assert.equal(window.fetch.getCalls().length, 2, 'Fetch was called twice');
      assertSentryCall(assert, 1, { errorBodyContains: [...this.errorMessages] });
      done();
    });
  });

  test('Check "Error in AfterRender"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Error in AfterRender"]');

    await click(button);

    assert.equal(window.fetch.getCalls().length, 1, 'Fetch was called once');
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "RSVP Rejection"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="RSVP Rejection"]');

    await click(button);

    assert.equal(window.fetch.getCalls().length, 1, 'Fetch was called once');
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryCall(assert, 0, { errorBodyContains: [this.qunitOnUnhandledRejection.getCall(0).args[0]] });
  });

  test('Check "Error inside RSVP"', async function (assert) {
    await visit('/');
    const button = find('[data-test-button="Error inside RSVP"]');

    await click(button);

    assert.equal(window.fetch.getCalls().length, 1, 'Fetch was called once');
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });
});
