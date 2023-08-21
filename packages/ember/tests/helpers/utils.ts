import type { Event } from '@sentry/types';

const defaultAssertOptions = {
  method: 'POST',
  errorBodyContains: [],
};

function getTestSentryErrors(): Event[] {
  return window._sentryTestEvents.filter(event => event['type'] !== 'transaction');
}

function getTestSentryTransactions(): Event[] {
  return window._sentryTestEvents.filter(event => event['type'] === 'transaction');
}

export function assertSentryErrorCount(assert: Assert, count: number): void {
  assert.equal(getTestSentryErrors().length, count, 'Check correct number of Sentry events were sent');
}

export function assertSentryTransactionCount(assert: Assert, count: number): void {
  assert.equal(getTestSentryTransactions().length, count, 'Check correct number of Sentry events were sent');
}

export function assertSentryErrors(
  assert: Assert,
  callNumber: number,
  options: {
    errorBodyContains: string[];
  },
): void {
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

export function assertSentryTransactions(
  assert: Assert,
  callNumber: number,
  options: {
    spans: string[];
    transaction: string;
    tags: Record<string, string | undefined>;
    durationCheck?: (duration: number) => boolean;
  },
): void {
  const sentryTestEvents = getTestSentryTransactions();
  const event = sentryTestEvents[callNumber];

  assert.ok(event);
  assert.ok(event.spans);

  const spans = event.spans || [];

  // instead of checking the specific order of runloop spans (which is brittle),
  // we check (below) that _any_ runloop spans are added
  const filteredSpans = spans
    .filter(span => !span.op?.startsWith('ui.ember.runloop.'))
    .map(s => {
      return `${s.op} | ${s.description}`;
    });

  assert.true(
    spans.some(span => span.op?.startsWith('ui.ember.runloop.')),
    'it captures runloop spans',
  );
  assert.deepEqual(filteredSpans, options.spans, 'Has correct spans');

  assert.equal(event.transaction, options.transaction);
  assert.equal(event.tags?.fromRoute, options.tags.fromRoute);
  assert.equal(event.tags?.toRoute, options.tags.toRoute);

  if (options.durationCheck && event.timestamp && event.start_timestamp) {
    const duration = (event.timestamp - event.start_timestamp) * 1000;
    assert.ok(options.durationCheck(duration), `duration (${duration}ms) passes duration check`);
  }
}
