export { httpIntegration } from './integrations/http';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';
export { fsIntegration } from './integrations/fs';
export { expressErrorHandler, setupExpressErrorHandler } from './integrations/tracing/express';
export { fastifyIntegration, setupFastifyErrorHandler } from './integrations/tracing/fastify';
export {
  amqplibIntegration,
  anthropicIntegration as anthropicAIIntegration,
  dataloaderIntegration,
  expressIntegration,
  firebaseIntegration,
  genericPoolIntegration,
  googleGenAIIntegration,
  graphqlDiagnosticsIntegration as graphqlIntegration,
  hapiIntegration,
  kafkajsIntegration as kafkaIntegration,
  knexIntegration,
  koaIntegration,
  langChainIntegration,
  langGraphIntegration,
  lruMemoizerIntegration,
  mongodbIntegration as mongoIntegration,
  mongooseIntegration,
  mysqlIntegration,
  mysql2Integration,
  openaiIntegration as openAIIntegration,
  postgresIntegration,
  postgresJsIntegration,
  tediousIntegration,
  vercelAiIntegration as vercelAIIntegration,
} from '@sentry/server-utils/orchestrion';
export { redisIntegration } from './integrations/tracing/redis';
export {
  otlpIntegration,
  getOtlpTracesEndpoint,
  prismaIntegration,
  instrumentOpenAiClient,
  instrumentAnthropicAiClient,
  instrumentGoogleGenAIClient,
  createLangChainCallbackHandler,
  instrumentLangChainEmbeddings,
  instrumentStateGraph,
  instrumentStateGraphCompile,
} from '@sentry/server-utils';
export { setupHapiErrorHandler } from './integrations/tracing/hapi';
export { setupKoaErrorHandler } from './integrations/tracing/koa';
export {
  launchDarklyIntegration,
  buildLaunchDarklyFlagUsedHandler,
  openFeatureIntegration,
  OpenFeatureIntegrationHook,
  statsigIntegration,
  unleashIntegration,
  growthbookIntegration,
} from './integrations/featureFlagShims';

export {
  init,
  getDefaultIntegrations,
  getDefaultIntegrationsWithoutPerformance,
  initWithoutDefaultIntegrations,
} from './sdk';
export { initOpenTelemetry } from './sdk/initOtel';
export { getAutoPerformanceIntegrations } from './integrations/tracing';

export type { NodeOptions } from './types';

export { setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';

export {
  addBreadcrumb,
  isInitialized,
  isEnabled,
  getGlobalScope,
  lastEventId,
  close,
  createTransport,
  flush,
  SDK_VERSION,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  captureCheckIn,
  withMonitor,
  requestDataIntegration,
  functionToStringIntegration,
  eventFiltersIntegration,
  linkedErrorsIntegration,
  addEventProcessor,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setAttribute,
  setAttributes,
  setUser,
  setConversationId,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  setCurrentClient,
  Scope,
  setMeasurement,
  getSpanDescendants,
  parameterize,
  getClient,
  getCurrentScope,
  getIsolationScope,
  getTraceData,
  getTraceMetaTags,
  httpHeadersToSpanAttributes,
  winterCGHeadersToDict,
  continueTrace,
  withScope,
  withIsolationScope,
  captureException,
  captureEvent,
  captureMessage,
  captureFeedback,
  captureConsoleIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  startSession,
  captureSession,
  endSession,
  addIntegration,
  startSpan,
  startSpanManual,
  startInactiveSpan,
  startNewTrace,
  bindScopeToEmitter,
  suppressTracing,
  getActiveSpan,
  withActiveSpan,
  getRootSpan,
  spanToStaticSpanJSON,
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  trpcMiddleware,
  updateSpanName,
  supabaseIntegration,
  instrumentSupabaseClient,
  zodErrorsIntegration,
  profiler,
  consoleLoggingIntegration,
  createConsolaReporter,
  wrapMcpServerWithSentry,
  featureFlagsIntegration,
  spanStreamingIntegration,
} from '@sentry/core';

export type {
  Breadcrumb,
  BreadcrumbHint,
  PolymorphicRequest,
  RequestEventData,
  SdkInfo,
  Event,
  EventHint,
  ErrorEvent,
  Exception,
  Session,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  Span,
  Metric,
  Log,
  LogSeverityLevel,
  FeatureFlagsIntegration,
  ExclusiveEventHintOrCaptureContext,
  CaptureContext,
} from '@sentry/core';

export {
  metrics,
  withStaticSpan,
  // oxlint-disable-next-line typescript/no-deprecated
  withStreamedSpan,
} from '@sentry/core';
export * as logger from './logs/exports';

export { childProcessIntegration } from './integrations/childProcess';
export { consoleIntegration } from './integrations/console';
export { nodeContextIntegration } from './integrations/context';
export { contextLinesIntegration } from './integrations/contextlines';
export { localVariablesIntegration } from './integrations/local-variables';
export { modulesIntegration } from './integrations/modules';
export {
  _INTERNAL_normalizeCollectionInterval,
  nodeRuntimeMetricsIntegration,
  type NodeRuntimeMetricsOptions,
} from './integrations/nodeRuntimeMetrics';
export { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception';
export { onUnhandledRejectionIntegration } from './integrations/onunhandledrejection';
export { pinoIntegration } from './integrations/pino';
export { spotlightIntegration } from './integrations/spotlight';
export { systemErrorIntegration } from './integrations/systemError';
export { createSentryWinstonTransport } from './integrations/winston';
export { cron } from './cron';
export { NODE_VERSION } from './nodeVersion';
export { defaultStackParser, getSentryRelease } from './sdk/api';
export { makeNodeTransport } from './transports';
export { createGetModuleFromFilename } from './utils/module';

export { httpServerIntegration } from './integrations/http/httpServerIntegration';
export { httpServerSpansIntegration } from './integrations/http/httpServerSpansIntegration';
export { processSessionIntegration } from './integrations/processSession';
export { NodeClient } from './sdk/client';
// eslint-disable-next-line typescript/no-deprecated
export { anrIntegration, disableAnrDetectionForCallback } from './integrations/anr';
