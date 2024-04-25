import { browserTracingIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export { feedbackAsyncIntegration as feedbackIntegration } from './feedbackAsync';
export { getFeedback } from '@sentry-internal/feedback';

export { browserTracingIntegrationShim as browserTracingIntegration, replayIntegrationShim as replayIntegration };
