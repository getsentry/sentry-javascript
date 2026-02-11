import * as Sentry from '@sentry/node-core';

Sentry.captureException(new Error('Test Error'));

// some more post context
