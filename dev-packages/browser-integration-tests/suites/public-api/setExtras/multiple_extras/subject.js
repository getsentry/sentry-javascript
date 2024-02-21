Sentry.setExtras({
  extra_1: [1, ['foo'], 'bar'],
  extra_2: 'baz',
  extra_3: Math.PI,
  extra_4: {
    qux: {
      quux: false,
    },
  },
});

Sentry.captureMessage('multiple_extras');
