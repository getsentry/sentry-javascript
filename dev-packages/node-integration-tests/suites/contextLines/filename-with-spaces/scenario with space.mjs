import * as Sentry from '@sentry/node';

Sentry.captureException(new Error('Test Error'));

// some more post context
