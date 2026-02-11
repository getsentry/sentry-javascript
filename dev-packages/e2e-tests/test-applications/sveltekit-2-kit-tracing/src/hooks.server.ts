import * as Sentry from '@sentry/sveltekit';
import { setupSidecar } from '@spotlightjs/spotlight/sidecar';
import { sequence } from '@sveltejs/kit/hooks';

// not logging anything to console to avoid noise in the test output
export const handleError = Sentry.handleErrorWithSentry(() => {});

export const handle = sequence(Sentry.sentryHandle());

if (import.meta.env.DEV) {
  setupSidecar();
}
