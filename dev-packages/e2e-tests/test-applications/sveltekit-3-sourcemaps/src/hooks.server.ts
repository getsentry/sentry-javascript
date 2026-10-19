import * as Sentry from '@sentry/sveltekit';

export const handleError = Sentry.handleErrorWithSentry();

export const handle = Sentry.sentryHandle();
