import * as logger from './logs/exports';

export { httpIntegration } from './integrations/http';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';
export { fsIntegration } from './integrations/fs';

export { nodeContextIntegration } from './integrations/context';
export { contextLinesIntegration } from './integrations/contextlines';
export { localVariablesIntegration } from './integrations/local-variables';
export { modulesIntegration } from './integrations/modules';
export { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception';
export { onUnhandledRejectionIntegration } from './integrations/onunhandledrejection';
export { anrIntegration, disableAnrDetectionForCallback } from './integrations/anr';

export { expressIntegration, expressErrorHandler, setupExpressErrorHandler } from './integrations/tracing/express';
export { fastifyIntegration, setupFastifyErrorHandler } from './integrations/tracing/fastify';
export { graphqlIntegration } from './integrations/tracing/graphql';
export { kafkaIntegration } from './integrations/tracing/kafka';
export { lruMemoizerIntegration } from './integrations/tracing/lrumemoizer';
export { mongoIntegration } from './integrations/tracing/mongo';
export { mongooseIntegration } from './integrations/tracing/mongoose';
export { mysqlIntegration } from './integrations/tracing/mysql';
export { mysql2Integration } from './integrations/tracing/mysql2';
export { redisIntegration } from './integrations/tracing/redis';
export { postgresIntegration } from './integrations/tracing/postgres';
export { postgresJsIntegration } from './integrations/tracing/postgresjs';
export { prismaIntegration } from './integrations/tracing/prisma';
export { hapiIntegration, setupHapiErrorHandler } from './integrations/tracing/hapi';
export { koaIntegration, setupKoaErrorHandler } from './integrations/tracing/koa';
export { connectIntegration, setupConnectErrorHandler } from './integrations/tracing/connect';
export { spotlightIntegration } from './integrations/spotlight';
export { knexIntegration } from './integrations/tracing/knex';
export { tediousIntegration } from './integrations/tracing/tedious';
export { genericPoolIntegration } from './integrations/tracing/genericPool';
export { dataloaderIntegration } from './integrations/tracing/dataloader';
export { amqplibIntegration } from './integrations/tracing/amqplib';
export { vercelAIIntegration } from './integrations/tracing/vercelai';
export { childProcessIntegration } from './integrations/childProcess';
export { createSentryWinstonTransport } from './integrations/winston';
export {
  launchDarklyIntegration,
  buildLaunchDarklyFlagUsedHandler,
  openFeatureIntegration,
  OpenFeatureIntegrationHook,
  statsigIntegration,
  unleashIntegration,
} from './integrations/featureFlagShims';

export { SentryContextManager } from './otel/contextManager';
export { generateInstrumentOnce } from './otel/instrument';

export {
  init,
  getDefaultIntegrations,
  getDefaultIntegrationsWithoutPerformance,
  initWithoutDefaultIntegrations,
  validateOpenTelemetrySetup,
} from './sdk';
export { initOpenTelemetry, preloadOpenTelemetry } from './sdk/initOtel';
export { getAutoPerformanceIntegrations } from './integrations/tracing';
export { getSentryRelease, defaultStackParser } from './sdk/api';
export { createGetModuleFromFilename } from './utils/module';
export { makeNodeTransport } from './transports';
export { NodeClient } from './sdk/client';
export { cron } from './cron';
export { NODE_VERSION } from './nodeVersion';

export type { NodeOptions } from './types';

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
  // eslint-disable-next-line deprecation/deprecation
  inboundFiltersIntegration,
  eventFiltersIntegration,
  linkedErrorsIntegration,
  addEventProcessor,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
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
  zodErrorsIntegration,
  profiler,
  consoleLoggingIntegration,
  consoleIntegration,
  wrapMcpServerWithSentry,
  featureFlagsIntegration,
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
  FeatureFlagsIntegration,
} from '@sentry/core';

export { logger };
