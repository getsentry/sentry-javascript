import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';

// not logging anything to console to avoid noise in the test output
export const handleError = Sentry.handleErrorWithSentry(() => {});

export const handle = sequence(Sentry.sentryHandle());
