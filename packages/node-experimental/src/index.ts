export { errorHandler } from './sdk/handlers/errorHandler';

export { httpIntegration } from './integrations/http';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';
export { expressIntegration } from './integrations/tracing/express';
export { fastifyIntegration } from './integrations/tracing/fastify';
export { graphqlIntegration } from './integrations/tracing/graphql';
export { mongoIntegration } from './integrations/tracing/mongo';
export { mongooseIntegration } from './integrations/tracing/mongoose';
export { mysqlIntegration } from './integrations/tracing/mysql';
export { mysql2Integration } from './integrations/tracing/mysql2';
export { nestIntegration } from './integrations/tracing/nest';
export { postgresIntegration } from './integrations/tracing/postgres';
export { prismaIntegration } from './integrations/tracing/prisma';

export { init, getDefaultIntegrations } from './sdk/init';
export { getAutoPerformanceIntegrations } from './integrations/tracing';
export { getClient, getSentryRelease, defaultStackParser } from './sdk/api';
export { createGetModuleFromFilename } from './utils/module';
export { makeNodeTransport } from './transports';
// eslint-disable-next-line deprecation/deprecation
export { getCurrentHub } from './sdk/hub';

export type { Span, NodeOptions } from './types';

export { startSpan, startSpanManual, startInactiveSpan, getActiveSpan, withActiveSpan } from '@sentry/opentelemetry';

export { addRequestDataToEvent, DEFAULT_USER_INCLUDES, extractRequestData } from '@sentry/utils';

export {
  hapiErrorPlugin,
  consoleIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  modulesIntegration,
  contextLinesIntegration,
  nodeContextIntegration,
  localVariablesIntegration,
  cron,
} from '@sentry/node';

export {
  addBreadcrumb,
  isInitialized,
  getGlobalScope,
  close,
  createTransport,
  flush,
  Hub,
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
  continueTrace,
  parameterize,
  getCurrentScope,
  getIsolationScope,
  withScope,
  withIsolationScope,
  captureException,
  captureEvent,
  captureMessage,
} from '@sentry/core';

export type {
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
  Transaction,
  User,
} from '@sentry/types';
