import * as Sentry from '@sentry/sveltekit';

export const load = async ({ url }) => {
  if (!url.search) {
    Sentry.captureException(new Error('No search query provided'));
    return {
      error: 'No search query provided',
    };
  }
  return {
    message: 'hi',
  };
};
