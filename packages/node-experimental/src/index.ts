export { httpIntegration } from './integrations/http';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';

export { consoleIntegration } from './integrations/console';
export { nodeContextIntegration } from './integrations/context';
export { contextLinesIntegration } from './integrations/contextlines';
export { localVariablesIntegration } from './integrations/local-variables';
export { modulesIntegration } from './integrations/modules';
export { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception';
export { onUnhandledRejectionIntegration } from './integrations/onunhandledrejection';
export { anrIntegration } from './integrations/anr';

export { expressIntegration, expressErrorHandler, setupExpressErrorHandler } from './integrations/tracing/express';
export { fastifyIntegration } from './integrations/tracing/fastify';
export { graphqlIntegration } from './integrations/tracing/graphql';
export { mongoIntegration } from './integrations/tracing/mongo';
export { mongooseIntegration } from './integrations/tracing/mongoose';
export { mysqlIntegration } from './integrations/tracing/mysql';
export { mysql2Integration } from './integrations/tracing/mysql2';
export { nestIntegration } from './integrations/tracing/nest';
export { postgresIntegration } from './integrations/tracing/postgres';
export { prismaIntegration } from './integrations/tracing/prisma';
export { hapiIntegration, setupHapiErrorHandler } from './integrations/tracing/hapi';
export { spotlightIntegration } from './integrations/spotlight';

export { init, getDefaultIntegrations } from './sdk/init';
export { getAutoPerformanceIntegrations } from './integrations/tracing';
export {
  getClient,
  getSentryRelease,
  defaultStackParser,
  // eslint-disable-next-line deprecation/deprecation
  makeMain,
} from './sdk/api';
export { createGetModuleFromFilename } from './utils/module';
export { makeNodeTransport } from './transports';
export { NodeClient } from './sdk/client';
// eslint-disable-next-line deprecation/deprecation
export { getCurrentHub } from './sdk/hub';
export { cron } from './cron';

export type { NodeOptions } from './types';

export {
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
} from '@sentry/utils';

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
  getSpanDescendants,
  parameterize,
  getCurrentScope,
  getIsolationScope,
  withScope,
  withIsolationScope,
  captureException,
  captureEvent,
  captureMessage,
  captureConsoleIntegration,
  debugIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  sessionTimingIntegration,
  metricsDefault as metrics,
  startSession,
  captureSession,
  endSession,
  addIntegration,
  startSpan,
  startSpanManual,
  startInactiveSpan,
  getActiveSpan,
  withActiveSpan,
  getRootSpan,
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
  Span,
} from '@sentry/types';
