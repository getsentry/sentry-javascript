export * from './exports';

export { reportingObserverIntegration } from './integrations/reportingobserver';
export { httpClientIntegration } from './integrations/httpclient';
export { contextLinesIntegration } from './integrations/contextlines';
export { graphqlClientIntegration } from './integrations/graphqlClient';

export {
  captureConsoleIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  captureFeedback,
} from '@sentry/core';

export { replayIntegration, getReplay } from '@sentry-internal/replay';
export type {
  ReplayEventType,
  ReplayEventWithTime,
  ReplayBreadcrumbFrame,
  ReplayBreadcrumbFrameEvent,
  ReplayOptionFrameEvent,
  ReplayFrame,
  ReplayFrameEvent,
  ReplaySpanFrame,
  ReplaySpanFrameEvent,
} from '@sentry-internal/replay';

export { replayCanvasIntegration } from '@sentry-internal/replay-canvas';

import { feedbackAsyncIntegration } from './feedbackAsync';
import { feedbackSyncIntegration } from './feedbackSync';
export { feedbackAsyncIntegration, feedbackSyncIntegration, feedbackSyncIntegration as feedbackIntegration };
export { getFeedback, sendFeedback } from '@sentry-internal/feedback';

export { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './tracing/request';
export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export type { RequestInstrumentationOptions } from './tracing/request';
export {
  registerSpanErrorInstrumentation,
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  startNewTrace,
  getSpanDescendants,
  setMeasurement,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  makeMultiplexedTransport,
  moduleMetadataIntegration,
  zodErrorsIntegration,
  thirdPartyErrorFilterIntegration,
} from '@sentry/core';
export type { Span } from '@sentry/core';
export { makeBrowserOfflineTransport } from './transports/offline';
export { browserProfilingIntegration } from './profiling/integration';
export { spotlightBrowserIntegration } from './integrations/spotlight';
export { browserSessionIntegration } from './integrations/browsersession';
export {
  featureFlagsIntegration,
  type FeatureFlagsIntegration,
} from './integrations/featureFlags';
export { launchDarklyIntegration, buildLaunchDarklyFlagUsedHandler } from './integrations/featureFlags/launchdarkly';
export { openFeatureIntegration, OpenFeatureIntegrationHook } from './integrations/featureFlags/openfeature';
export { unleashIntegration } from './integrations/featureFlags/unleash';
export { statsigIntegration } from './integrations/featureFlags/statsig';
