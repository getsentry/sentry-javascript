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

Sentry.captureException(aggregateError);
