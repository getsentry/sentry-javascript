export { httpIntegration } from './integrations/http';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';
export { fsIntegration } from './integrations/fs';

export { consoleIntegration } from './integrations/console';
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
// eslint-disable-next-line deprecation/deprecation
export { nestIntegration, setupNestErrorHandler } from './integrations/tracing/nest/nest';
export { postgresIntegration } from './integrations/tracing/postgres';
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
// eslint-disable-next-line deprecation/deprecation
export { processThreadBreadcrumbIntegration, childProcessIntegration } from './integrations/childProcess';

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

export type { NodeOptions } from './types';

// eslint-disable-next-line deprecation/deprecation
export { addRequestDataToEvent, DEFAULT_USER_INCLUDES, extractRequestData } from '@sentry/core';

export {
  // eslint-disable-next-line deprecation/deprecation
  addOpenTelemetryInstrumentation,
  // These are custom variants that need to be used instead of the core one
  // As they have slightly different implementations
  continueTrace,
  // This needs exporting so the NodeClient can be used without calling init
  setOpenTelemetryContextAsyncContextStrategy as setNodeAsyncContextStrategy,
} from '@sentry/opentelemetry';

export {
  addBreadcrumb,
  isInitialized,
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
  inboundFiltersIntegration,
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
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getCurrentScope,
  getIsolationScope,
  getTraceData,
  getTraceMetaTags,
  withScope,
  withIsolationScope,
  captureException,
  captureEvent,
  captureMessage,
  captureFeedback,
  captureConsoleIntegration,
  // eslint-disable-next-line deprecation/deprecation
  debugIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  // eslint-disable-next-line deprecation/deprecation
  sessionTimingIntegration,
  // eslint-disable-next-line deprecation/deprecation
  metricsDefault as metrics,
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
  zodErrorsIntegration,
  profiler,
} from '@sentry/core';

export type {
  Breadcrumb,
  BreadcrumbHint,
  PolymorphicRequest,
  // eslint-disable-next-line deprecation/deprecation
  Request,
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
} from '@sentry/core';
