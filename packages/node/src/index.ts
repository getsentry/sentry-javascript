export { httpIntegration } from './integrations/http';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';
export { fsIntegration } from './integrations/fs';
export { expressErrorHandler, setupExpressErrorHandler } from './integrations/tracing/express';
export { fastifyIntegration, setupFastifyErrorHandler } from './integrations/tracing/fastify';
export { graphqlIntegration } from './integrations/tracing/graphql';
export {
  amqplibChannelIntegration as amqplibIntegration,
  expressChannelIntegration as expressIntegration,
  genericPoolChannelIntegration as genericPoolIntegration,
  hapiChannelIntegration as hapiIntegration,
  kafkajsChannelIntegration as kafkaIntegration,
  koaChannelIntegration as koaIntegration,
  lruMemoizerChannelIntegration as lruMemoizerIntegration,
  mongodbChannelIntegration as mongoIntegration,
  mongooseChannelIntegration as mongooseIntegration,
  tediousChannelIntegration as tediousIntegration,
} from '@sentry/server-utils/orchestrion';
export { mysqlIntegration } from './integrations/tracing/mysql';
export { mysql2Integration } from './integrations/tracing/mysql2';
export { redisIntegration } from './integrations/tracing/redis';
export { postgresIntegration } from './integrations/tracing/postgres';
export { postgresJsIntegration } from './integrations/tracing/postgresjs';
export { prismaIntegration } from '@sentry/server-utils';
export { setupHapiErrorHandler } from './integrations/tracing/hapi';
export { setupKoaErrorHandler } from './integrations/tracing/koa';
export { knexIntegration } from './integrations/tracing/knex';
export { dataloaderIntegration } from './integrations/tracing/dataloader';
export { vercelAIIntegration } from './integrations/tracing/vercelai';
export { openAIIntegration } from './integrations/tracing/openai';
export { anthropicAIIntegration } from './integrations/tracing/anthropic-ai';
export { googleGenAIIntegration } from './integrations/tracing/google-genai';
export { langChainIntegration } from './integrations/tracing/langchain';
export { langGraphIntegration } from './integrations/tracing/langgraph';
export {
  launchDarklyIntegration,
  buildLaunchDarklyFlagUsedHandler,
  openFeatureIntegration,
  OpenFeatureIntegrationHook,
  statsigIntegration,
  unleashIntegration,
  growthbookIntegration,
} from './integrations/featureFlagShims';
export { firebaseIntegration } from './integrations/tracing/firebase';

export {
  init,
  getDefaultIntegrations,
  getDefaultIntegrationsWithoutPerformance,
  initWithoutDefaultIntegrations,
} from './sdk';
export { initOpenTelemetry, preloadOpenTelemetry } from './sdk/initOtel';
export { getAutoPerformanceIntegrations } from './integrations/tracing';

export type { NodeOptions, OpenTelemetryServerRuntimeOptions } from './types';

export {
  // This needs exporting so the NodeClient can be used without calling init
  setOpenTelemetryContextAsyncContextStrategy as setNodeAsyncContextStrategy,
} from '@sentry/opentelemetry';

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
  // eslint-disable-next-line typescript/no-deprecated
  inboundFiltersIntegration,
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
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  trpcMiddleware,
  updateSpanName,
  supabaseIntegration,
  instrumentSupabaseClient,
  instrumentOpenAiClient,
  instrumentAnthropicAiClient,
  instrumentGoogleGenAIClient,
  zodErrorsIntegration,
  profiler,
  consoleLoggingIntegration,
  createConsolaReporter,
  wrapMcpServerWithSentry,
  featureFlagsIntegration,
  spanStreamingIntegration,
  createLangChainCallbackHandler,
  instrumentLangChainEmbeddings,
  instrumentStateGraph,
  instrumentStateGraphCompile,
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

export { metrics, withStreamedSpan } from '@sentry/core';
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
export { SentryContextManager } from './otel/contextManager';
export { generateInstrumentOnce } from './otel/instrument';
export { NodeClient } from './sdk/client';
export { validateOpenTelemetrySetup } from './sdk';
// eslint-disable-next-line typescript/no-deprecated
export { anrIntegration, disableAnrDetectionForCallback } from './integrations/anr';
