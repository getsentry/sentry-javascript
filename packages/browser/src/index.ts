import { feedbackAsyncIntegration } from './feedbackAsync';
import { feedbackSyncIntegration } from './feedbackSync';

export * from './exports';

export { reportingObserverIntegration } from './integrations/reportingobserver';
export { httpClientIntegration } from './integrations/httpclient';
export { contextLinesIntegration } from './integrations/contextlines';
export { graphqlClientIntegration } from './integrations/graphqlClient';

export {
  captureConsoleIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  consoleLoggingIntegration,
  createConsolaReporter,
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
export { feedbackAsyncIntegration, feedbackSyncIntegration, feedbackSyncIntegration as feedbackIntegration };
export { getFeedback, sendFeedback } from '@sentry-internal/feedback';

export { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './tracing/request';
export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { reportPageLoaded } from './tracing/reportPageLoaded';
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
  supabaseIntegration,
  instrumentSupabaseClient,
  zodErrorsIntegration,
  thirdPartyErrorFilterIntegration,
  featureFlagsIntegration,
  logger,
} from '@sentry/core';
export type { Span, FeatureFlagsIntegration } from '@sentry/core';
export { makeBrowserOfflineTransport } from './transports/offline';
export { browserProfilingIntegration } from './profiling/integration';
export { spotlightBrowserIntegration } from './integrations/spotlight';
export { browserSessionIntegration } from './integrations/browsersession';
export { launchDarklyIntegration, buildLaunchDarklyFlagUsedHandler } from './integrations/featureFlags/launchdarkly';
export { openFeatureIntegration, OpenFeatureIntegrationHook } from './integrations/featureFlags/openfeature';
export { unleashIntegration } from './integrations/featureFlags/unleash';
export { statsigIntegration } from './integrations/featureFlags/statsig';
export { diagnoseSdkConnectivity } from './diagnose-sdk';
export { webWorkerIntegration, registerWebWorker } from './integrations/webWorker';
