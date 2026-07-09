/**
 * Optional `@sentry/browser` features that are **not** part of the default
 * `@sentry/react` entry (for tree-shaking).
 *
 * Framework SDKs (`@sentry/nextjs`, `@sentry/gatsby`, …) re-export these so
 * `import * as Sentry from '@sentry/nextjs'` keeps the historical surface.
 *
 * Application code may also import from here, or directly from `@sentry/browser`
 * / dedicated packages (`@sentry/replay`, `@sentry/feedback`, …).
 */
export {
  // Replay
  getReplay,
  replayCanvasIntegration,
  replayIntegration,
  // Feedback
  feedbackAsyncIntegration,
  feedbackIntegration,
  feedbackSyncIntegration,
  getFeedback,
  sendFeedback,
  // Optional integrations
  // uiProfiler is also on the root surface; re-export here so
  // `import { uiProfiler, browserProfilingIntegration } from '@sentry/react/optional-browser-api'`
  // keeps working for manual UI profiling setups.
  browserProfilingIntegration,
  uiProfiler,
  contextLinesIntegration,
  createConsolaReporter,
  diagnoseSdkConnectivity,
  elementTimingIntegration,
  featureFlagsIntegration,
  fetchStreamPerformanceIntegration,
  graphqlClientIntegration,
  httpClientIntegration,
  makeBrowserOfflineTransport,
  registerWebWorker,
  reportingObserverIntegration,
  spanStreamingIntegration,
  spotlightBrowserIntegration,
  supabaseIntegration,
  instrumentSupabaseClient,
  viewHierarchyIntegration,
  webVitalsIntegration,
  webWorkerIntegration,
  zodErrorsIntegration,
  // Feature flags
  buildLaunchDarklyFlagUsedHandler,
  growthbookIntegration,
  launchDarklyIntegration,
  openFeatureIntegration,
  OpenFeatureIntegrationHook,
  statsigIntegration,
  unleashIntegration,
  // AI instrumenters
  createLangChainCallbackHandler,
  instrumentAnthropicAiClient,
  instrumentCreateReactAgent,
  instrumentGoogleGenAIClient,
  instrumentLangChainEmbeddings,
  instrumentLangGraph,
  instrumentOpenAiClient,
} from '@sentry/browser';

export type {
  FeatureFlagsIntegration,
  ReplayBreadcrumbFrame,
  ReplayBreadcrumbFrameEvent,
  ReplayEventType,
  ReplayEventWithTime,
  ReplayFrame,
  ReplayFrameEvent,
  ReplayOptionFrameEvent,
  ReplaySpanFrame,
  ReplaySpanFrameEvent,
} from '@sentry/browser';
