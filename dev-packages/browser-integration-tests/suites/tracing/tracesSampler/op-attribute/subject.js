Sentry.startSpan({ name: 'span-with-unsampled-op', op: 'other.op' }, () => {});
Sentry.startSpan({ name: 'span-with-sampled-op', op: 'custom.op' }, () => {});
