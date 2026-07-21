export type {
  Breadcrumb,
  BreadcrumbHint,
  Log,
  LogSeverityLevel,
  Metric,
  PolymorphicRequest,
  RequestEventData,
  SdkInfo,
  Event,
  EventHint,
  ErrorEvent,
  Exception,
  FeatureFlagsIntegration,
  Session,
  SeverityLevel,
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  User,
} from '@sentry/core';

export type { DenoOptions } from './types';

export {
  addEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  captureFeedback,
  close,
  createTransport,
  continueTrace,
  lastEventId,
  flush,
  getClient,
  isInitialized,
  isEnabled,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  Scope,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setAttribute,
  setAttributes,
  setUser,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  withScope,
  withIsolationScope,
  captureCheckIn,
  withMonitor,
  setMeasurement,
  getActiveSpan,
  getRootSpan,
  getTraceData,
  getTraceMetaTags,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  startNewTrace,
  bindScopeToEmitter,
  suppressTracing,
  // eslint-disable-next-line typescript/no-deprecated
  inboundFiltersIntegration,
  eventFiltersIntegration,
  linkedErrorsIntegration,
  functionToStringIntegration,
  requestDataIntegration,
  captureConsoleIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  supabaseIntegration,
  instrumentSupabaseClient,
  instrumentPostgresJsSql,
  zodErrorsIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  startSession,
  captureSession,
  endSession,
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  updateSpanName,
  wrapMcpServerWithSentry,
  featureFlagsIntegration,
  metrics,
  withStreamedSpan,
  logger,
  consoleLoggingIntegration,
  spanStreamingIntegration,
} from '@sentry/core';

export { DenoClient } from './client';

export { getDefaultIntegrations, init } from './sdk';
export { denoServeIntegration } from './integrations/deno-serve';
export { denoHttpIntegration } from './integrations/http';
export type { DenoHttpIntegrationOptions } from './integrations/http';
export { denoRedisIntegration } from './integrations/redis';
export type { DenoRedisIntegrationOptions } from './integrations/redis';
// The orchestrion channel integrations, re-exported from `@sentry/server-utils`.
// Most are in the default set; `dataloader` and `knex` are opt-in (add them to
// `integrations` to enable), matching Node. Re-export every one that `sdk.ts`
// adds to the defaults, so users who customize `defaultIntegrations` can re-add it.
export {
  amqplibChannelIntegration,
  anthropicChannelIntegration,
  awsChannelIntegration,
  dataloaderChannelIntegration,
  expressChannelIntegration,
  firebaseChannelIntegration,
  genericPoolChannelIntegration,
  googleGenAIChannelIntegration,
  graphqlDiagnosticsChannelIntegration,
  hapiChannelIntegration,
  kafkajsChannelIntegration,
  knexChannelIntegration,
  koaChannelIntegration,
  lruMemoizerChannelIntegration,
  mongodbChannelIntegration,
  mongooseChannelIntegration,
  mysqlChannelIntegration,
  mysql2ChannelIntegration,
  openaiChannelIntegration,
  postgresChannelIntegration,
  postgresJsChannelIntegration,
  tediousChannelIntegration,
} from '@sentry/server-utils/orchestrion';
// Deprecated aliases kept for back-compat. Each forwards to the shared
// integration above, so its name is the shared name (e.g. `Mysql`), not the old
// `Deno*` name. See each alias's `@deprecated` note.
/* eslint-disable typescript/no-deprecated */
export { denoMysqlIntegration } from './integrations/mysql';
export { denoPostgresIntegration } from './integrations/postgres';
export { denoAmqplibIntegration } from './integrations/amqplib';
export { denoKoaIntegration } from './integrations/koa';
export { denoMongoIntegration } from './integrations/mongo';
export { denoMongooseIntegration } from './integrations/mongoose';
export { denoDataloaderIntegration } from './integrations/dataloader';
export { denoKnexIntegration } from './integrations/knex';
/* eslint-enable typescript/no-deprecated */
export { denoContextIntegration } from './integrations/context';
export { globalHandlersIntegration } from './integrations/globalhandlers';
export { normalizePathsIntegration } from './integrations/normalizepaths';
export { contextLinesIntegration } from './integrations/contextlines';
export { denoCronIntegration } from './integrations/deno-cron';
export { breadcrumbsIntegration } from './integrations/breadcrumbs';
export { vercelAIIntegration } from './integrations/tracing/vercelai';
export { denoRuntimeMetricsIntegration, type DenoRuntimeMetricsOptions } from './integrations/denoRuntimeMetrics';
