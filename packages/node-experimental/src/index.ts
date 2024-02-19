export { expressIntegration } from './integrations/tracing/express';
export { fastifyIntegration } from './integrations/tracing/fastify';
export { graphqlIntegration } from './integrations/tracing/graphql';
export { httpIntegration } from './integrations/http';
export { mongoIntegration } from './integrations/tracing/mongo';
export { mongooseIntegration } from './integrations/tracing/mongoose';
export { mysqlIntegration } from './integrations/tracing/mysql';
export { mysql2Integration } from './integrations/tracing/mysql2';
export { nestIntegration } from './integrations/tracing/nest';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';
export { postgresIntegration } from './integrations/tracing/postgres';
export { prismaIntegration } from './integrations/tracing/prisma';

export { init, getDefaultIntegrations } from './sdk/init';
export { getAutoPerformanceIntegrations } from './integrations/tracing';
export * as Handlers from './sdk/handlers';
export type { Span } from './types';

export { startSpan, startSpanManual, startInactiveSpan, getActiveSpan, withActiveSpan } from '@sentry/opentelemetry';
export { getClient } from './sdk/api';
// eslint-disable-next-line deprecation/deprecation
export { getCurrentHub } from './sdk/hub';

export {
  addBreadcrumb,
  isInitialized,
  makeNodeTransport,
  defaultStackParser,
  getSentryRelease,
  getGlobalScope,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  // eslint-disable-next-line deprecation/deprecation
  getModuleFromFilename,
  createGetModuleFromFilename,
  close,
  createTransport,
  flush,
  Hub,
  // eslint-disable-next-line deprecation/deprecation
  runWithAsyncContext,
  SDK_VERSION,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  captureCheckIn,
  withMonitor,
  hapiErrorPlugin,
  consoleIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  modulesIntegration,
  contextLinesIntegration,
  nodeContextIntegration,
  localVariablesIntegration,
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
  continueTrace,
  cron,
  parameterize,
  // eslint-disable-next-line deprecation/deprecation
  makeMain,
  getCurrentScope,
  getIsolationScope,
  withScope,
  withIsolationScope,
  captureException,
  captureEvent,
  captureMessage,
} from '@sentry/node';

export type {
  SpanStatusType,
  TransactionNamingScheme,
  AddRequestDataToEventOptions,
  Breadcrumb,
  BreadcrumbHint,
  PolymorphicRequest,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  Session,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  NodeOptions,
} from '@sentry/node';
