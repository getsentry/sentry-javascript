const TRACES = {
  sampled: {
    sentryTrace: '12345678901234567890123456789012-1234567890123456-1',
    baggage:
      'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.42',
  },
  unsampled: {
    sentryTrace: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1111111111111111-0',
    baggage: undefined,
  },
  // No trailing sampling flag -> deferred sampling decision.
  deferred: {
    sentryTrace: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2222222222222222',
    baggage: undefined,
  },
  noTrace: {
    sentryTrace: undefined,
    baggage: undefined,
  },
};

function continueAndRun(variant) {
  const { sentryTrace, baggage } = TRACES[variant];
  Sentry.continueTrace({ sentryTrace, baggage }, () => {
    // Keep the span callback synchronous: the browser ACS is stack-based, so an `await` here would pop
    // the continued span/scope before `fetch` and `captureException` run. Firing `fetch` without
    // awaiting still attaches the propagation headers (they are read synchronously at call time).
    Sentry.startSpan({ op: 'ui.interaction.click', name: `continued-${variant}` }, () => {
      fetch('http://sentry-test-site.example');
      Sentry.captureException(new Error(`continued-${variant}-error`));
    });
  });
}

for (const variant of ['sampled', 'unsampled', 'deferred', 'noTrace']) {
  document.getElementById(variant).addEventListener('click', () => continueAndRun(variant));
}
