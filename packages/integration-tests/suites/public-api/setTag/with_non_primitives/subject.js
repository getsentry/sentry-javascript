Sentry.setTag('tag_1', {});
Sentry.setTag('tag_2', []);
Sentry.setTag('tag_3', ['a', new Map()]);
Sentry.setTag('tag_4');
Sentry.setTag('tag_5', () => {});

Sentry.captureMessage('non_primitives');
