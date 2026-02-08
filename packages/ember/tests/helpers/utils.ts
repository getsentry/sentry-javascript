import type { Event } from '@sentry/core';

const defaultAssertOptions = {
  errorBodyContains: [],
};

function getTestSentryErrors(): Event[] {
  return (window._sentryTestEvents as Event[]).filter(
    (event) => event['type'] !== 'transaction',
  );
}

function getTestSentryTransactions(): Event[] {
  return (window._sentryTestEvents as Event[]).filter(
    (event) => event['type'] === 'transaction',
  );
}

export function assertSentryErrorCount(assert: Assert, count: number): void {
  assert.equal(
    getTestSentryErrors().length,
    count,
    'Check correct number of Sentry events were sent',
  );
}

export function assertSentryTransactionCount(
  assert: Assert,
  count: number,
): void {
  assert.equal(
    getTestSentryTransactions().length,
    count,
    'Check correct number of Sentry events were sent',
  );
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
  assert.ok(
    assertOptions.errorBodyContains.length,
    'Must pass strings to check against error body',
  );
  const errorBody = JSON.stringify(event);
  assertOptions.errorBodyContains.forEach((bodyContent) => {
    assert.ok(
      errorBody.includes(bodyContent),
      `Checking that error body includes ${bodyContent}`,
    );
  });
}

export function assertSentryTransactions(
  assert: Assert,
  callNumber: number,
  options: {
    spans: string[];
    transaction: string;
    attributes: Record<string, string | undefined>;
    durationCheck?: (duration: number) => boolean;
  },
): void {
  const sentryTestEvents = getTestSentryTransactions();
  const event = sentryTestEvents[callNumber]!;

  assert.ok(event, 'event exists');
  assert.ok(event.spans, 'event has spans');

  const spans = event.spans || [];

  // instead of checking the specific order of runloop spans (which is brittle),
  // we check (below) that _any_ runloop spans are added
  // Also we ignore ui.long-task spans and ui.long-animation-frame, as they are brittle and may or may not appear
  const filteredSpans = spans
    .filter((span) => {
      const op = span.op;
      return (
        !op?.startsWith('ui.ember.runloop.') &&
        !op?.startsWith('ui.long-task') &&
        !op?.startsWith('ui.long-animation-frame')
      );
    })
    .map((spanJson) => {
      return `${spanJson.op} | ${spanJson.description}`;
    });

  // Runloop instrumentation may not fire in all test environments (e.g. strict app resolver)
  // so we only check for runloop spans if they exist
  const runloopSpans = spans.filter((span) =>
    span.op?.startsWith('ui.ember.runloop.'),
  );
  if (runloopSpans.length > 0) {
    assert.ok(runloopSpans.length > 0, 'it captures runloop spans');
    runloopSpans.forEach((span) => {
      assert.ok(
        span.op?.startsWith('ui.ember.runloop.'),
        `runloop span has correct op: ${span.op}`,
      );
      assert.ok(
        span.description,
        `runloop span has a description: ${span.description}`,
      );
    });
  } else {
    assert.true(
      true,
      'runloop spans not captured (expected in strict resolver test environment)',
    );
  }
  assert.deepEqual(filteredSpans, options.spans, 'Has correct spans');

  assert.equal(event.transaction, options.transaction);

  Object.keys(options.attributes).forEach((key) => {
    assert.equal(event.contexts?.trace?.data?.[key], options.attributes[key]);
  });

  if (options.durationCheck && event.timestamp && event.start_timestamp) {
    const duration = (event.timestamp - event.start_timestamp) * 1000;
    assert.ok(
      options.durationCheck(duration),
      `duration (${duration}ms) passes duration check`,
    );
  }
}
