import { next } from '@ember/runloop';
import { click, visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import { module, test } from 'qunit';
import type { SentryTestContext } from '../helpers/setup-sentry';
import { setupSentryTest } from '../helpers/setup-sentry';
import { assertSentryErrorCount, assertSentryErrors } from '../helpers/utils';

module('Acceptance | Sentry Errors', function (hooks) {
  setupApplicationTest(hooks);
  setupSentryTest(hooks);

  test('Check "Throw Generic Javascript Error"', async function (this: SentryTestContext, assert) {
    assert.expect(3);

    await visit('/');

    await click('[data-test-button="Throw Generic Javascript Error"]');

    assertSentryErrorCount(assert, 1);
    assertSentryErrors(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "Throw EmberError"', async function (this: SentryTestContext, assert) {
    assert.expect(3);

    await visit('/');

    await click('[data-test-button="Throw EmberError"]');

    assertSentryErrorCount(assert, 1);
    assertSentryErrors(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "Caught Thrown EmberError"', async function (this: SentryTestContext, assert) {
    assert.expect(1);

    await visit('/');

    await click('[data-test-button="Caught Thrown EmberError"]');

    assertSentryErrorCount(assert, 0);
  });

  test('Check "Error From Fetch"', async function (this: SentryTestContext, assert) {
    assert.expect(3);

    this.fetchStub.onFirstCall().callsFake(() => {
      throw new Error('Test error...');
    });

    await visit('/');

    await click('[data-test-button="Error From Fetch"]');

    const done = assert.async();

    next(() => {
      assertSentryErrorCount(assert, 1);
      assertSentryErrors(assert, 0, { errorBodyContains: ['Test error...'] });
      done();
    });
  });

  test('Check "Error in AfterRender"', async function (this: SentryTestContext, assert) {
    assert.expect(4);

    await visit('/');

    await click('[data-test-button="Error in AfterRender"]');

    assertSentryErrorCount(assert, 1);
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryErrors(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });

  test('Check "RSVP Rejection"', async function (this: SentryTestContext, assert) {
    assert.expect(4);

    await visit('/');

    await click('[data-test-button="RSVP Rejection"]');

    assertSentryErrorCount(assert, 1);
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryErrors(assert, 0, { errorBodyContains: [this.qunitOnUnhandledRejection.getCall(0).args[0]] });
  });

  test('Check "Error inside RSVP"', async function (this: SentryTestContext, assert) {
    assert.expect(4);

    await visit('/');

    await click('[data-test-button="Error inside RSVP"]');

    assertSentryErrorCount(assert, 1);
    assert.ok(this.qunitOnUnhandledRejection.calledOnce, 'Uncaught rejection should only be called once');
    assertSentryErrors(assert, 0, { errorBodyContains: [...this.errorMessages] });
  });
});
