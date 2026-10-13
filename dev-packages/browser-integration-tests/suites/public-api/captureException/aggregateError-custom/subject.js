class CustomAggregateError extends AggregateError {
  constructor(errors, message, options) {
    super(errors, message, options);
    this.name = 'CustomAggregateError';
  }
}

const aggregateError = new CustomAggregateError(
  [new Error('error 1', { cause: new Error('error 1 cause') }), new Error('error 2')],
  'custom aggregate error',
  {
    cause: new Error('aggregate cause'),
  },
);

const shouldUseCustomMechanism = window.location.hash === '#custom-mechanism';

if (shouldUseCustomMechanism) {
  const cause = new Error('Failure 1');
  const errorCause = new Error('Failure 2', { cause });
  const error = new Error('Failure 3', { cause: errorCause });

  Sentry.captureException(error, {
    mechanism: { handled: false, type: 'auto.http.example' },
  });
} else {
  Sentry.captureException(aggregateError);
}
