import * as Sentry from '@sentry/sveltekit';

export const load = async ({ url }) => {
  if (!url.search) {
    console.log('traceData: ', Sentry.getTraceData());
    console.log('spanToTrace', Sentry.spanToTraceHeader(Sentry.getActiveSpan()!));
    console.log('activeSpan', Sentry.getActiveSpan());
    Sentry.captureException(new Error('No search query provided'));
    return {
      error: 'No search query provided',
    };
  }
  return {
    message: 'hi',
  };
};
