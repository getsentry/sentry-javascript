import { test, module } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import { find, click, visit } from '@ember/test-helpers';
import { next } from '@ember/runloop';
import { setupSentryTest } from '../helpers/setup-sentry';

const defaultAssertOptions = {
  method: 'POST',
  errorBodyContains: [],
};

function getTestSentryErrors() {
  return window._sentryTestEvents.filter(event => event['type'] !== 'transaction');
}

function assertSentryErrorCount(assert, count) {
  assert.equal(getTestSentryErrors().length, count, 'Check correct number of Sentry events were sent');
}

function assertSentryCall(assert, callNumber, options) {
  const sentryTestEvents = getTestSentryErrors();
  const assertOptions = Object.assign({}, defaultAssertOptions, options);

  const event = sentryTestEvents[callNumber];

  /**
   * Body could be parsed here to check exact properties, but that requires too much implementation specific detail,
   * instead this loosely matches on contents to check the correct error is being sent.
   */
  assert.ok(assertOptions.errorBodyContains.length, 'Must pass strings to check against error body');
  const errorBody = JSON.stringify(event);
  assertOptions.errorBodyContains.forEach(bodyContent => {
    assert.ok(errorBody.includes(bodyContent), `Checking that error body includes ${bodyContent}`);
  });
}

module('Acceptance | Sentry Errors', function (hooks) {
  setupApplicationTest(hooks);
  setupSentryTest(hooks);

  test('Check "Throw Generic Javascript Error"', async function (assert) {
    assert.expect(3);

    await visit('/');
    const button = find('[data-test-button="Throw Generic Javascript Error"]');

    await click(button);

    assertSentryErrorCount(assert, 1);
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "Throw Error"', async function (assert) {
    assert.expect(3);

    await visit('/');
    const button = find('[data-test-button="Throw Error"]');

    await click(button);

    assertSentryErrorCount(assert, 1);
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "Caught Thrown Error"', async function (assert) {
    assert.expect(1);

    await visit('/');
    const button = find('[data-test-button="Caught Thrown Error"]');

    await click(button);

    assertSentryErrorCount(assert, 0);
  });

  test('Check "Error From Fetch"', async function (assert) {
    assert.expect(3);

    this.fetchStub.onFirstCall().callsFake((...args) => {
      return this.fetchStub.callsThrough(args);
    });
    await visit('/');
    const button = find('[data-test-button="Error From Fetch"]');

    await click(button);

    const done = assert.async();

    next(() => {
      assertSentryErrorCount(assert, 1);
      assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
      done();
    });
  });

  test('Check "Error in AfterRender"', async function (assert) {
    assert.expect(4);

    await visit('/');
    const button = find('[data-test-button="Error in AfterRender"]');

    await click(button);

    assertSentryErrorCount(assert, 1);
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "RSVP Rejection"', async function (assert) {
    assert.expect(4);

    await visit('/');
    const button = find('[data-test-button="RSVP Rejection"]');

    await click(button);

    assertSentryErrorCount(assert, 1);
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryCall(assert, 0, { errorBodyContains: [this.qunitOnUnhandledRejection.getCall(0).args[0]] });
  });

  test('Check "Error inside RSVP"', async function (assert) {
    assert.expect(4);

    await visit('/');
    const button = find('[data-test-button="Error inside RSVP"]');

    await click(button);

    assertSentryErrorCount(assert, 1);
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryCall(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });
});
