import { browserTracingIntegrationShim, feedbackIntegrationShim } from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export { replayIntegration } from '@sentry-internal/replay';

export { browserTracingIntegrationShim as browserTracingIntegration, feedbackIntegrationShim as feedbackIntegration };
