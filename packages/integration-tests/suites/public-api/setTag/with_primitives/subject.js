Sentry.setTag('tag_1', 'foo');
Sentry.setTag('tag_2', Math.PI);
Sentry.setTag('tag_3', false);
Sentry.setTag('tag_4', null);
Sentry.setTag('tag_5', undefined);
Sentry.setTag('tag_6', -1);

Sentry.captureMessage('primitive_tags');
