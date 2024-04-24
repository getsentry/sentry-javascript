Sentry.startSpan({ name: 'outer' }, () => {
  Sentry.startSpan({ name: 'inner' }, () => {});
  Sentry.startSpan({ name: 'standalone', experimental: { standalone: true } }, () => {});
});
