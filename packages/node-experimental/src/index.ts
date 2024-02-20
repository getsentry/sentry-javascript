export { expressIntegration } from './integrations/express';
export { fastifyIntegration } from './integrations/fastify';
export { graphqlIntegration } from './integrations/graphql';
export { httpIntegration } from './integrations/http';
export { mongoIntegration } from './integrations/mongo';
export { mongooseIntegration } from './integrations/mongoose';
export { mysqlIntegration } from './integrations/mysql';
export { mysql2Integration } from './integrations/mysql2';
export { nestIntegration } from './integrations/nest';
export { nativeNodeFetchIntegration } from './integrations/node-fetch';
export { postgresIntegration } from './integrations/postgres';
export { prismaIntegration } from './integrations/prisma';

export { init, getDefaultIntegrations } from './sdk/init';
export { getAutoPerformanceIntegrations } from './integrations/getAutoPerformanceIntegrations';
export * as Handlers from './sdk/handlers';
export type { Span } from './types';

export { startSpan, startSpanManual, startInactiveSpan, getActiveSpan, withActiveSpan } from '@sentry/opentelemetry';
export { getClient, getSentryRelease, defaultStackParser } from './sdk/api';
export { createGetModuleFromFilename } from './utils/module';
// eslint-disable-next-line deprecation/deprecation
export { getCurrentHub } from './sdk/hub';

export {
  addBreadcrumb,
  isInitialized,
  makeNodeTransport,
  getGlobalScope,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  // eslint-disable-next-line deprecation/deprecation
  getModuleFromFilename,
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
