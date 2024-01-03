Sentry.setExtras({ extra: [] });
Sentry.setExtras({ null: 0 });
Sentry.setExtras({
  obj: {
    foo: ['bar', 'baz', 1],
  },
});
Sentry.setExtras({ [null]: Infinity });
Sentry.setExtras({ [Infinity]: 2 });

Sentry.captureMessage('consecutive_calls');
