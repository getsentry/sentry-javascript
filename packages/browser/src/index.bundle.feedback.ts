import { browserTracingIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export { feedbackIntegration } from './feedback';
export { getFeedback } from '@sentry-internal/feedback';

export { browserTracingIntegrationShim as browserTracingIntegration, replayIntegrationShim as replayIntegration };
