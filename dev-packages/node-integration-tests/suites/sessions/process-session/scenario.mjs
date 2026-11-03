import * as Sentry from '@sentry/node';

Sentry.captureException(new Error('Scenario error'));
