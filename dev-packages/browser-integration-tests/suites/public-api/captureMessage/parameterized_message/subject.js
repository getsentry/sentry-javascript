const x = 'first';
const y = 'second';

Sentry.captureMessage(Sentry.parameterize`This is a log statement with ${x} and ${y} params`);
