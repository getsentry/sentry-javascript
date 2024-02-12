import { Integrations as CoreIntegrations } from '@sentry/core';

import * as NodeExperimentalIntegrations from './integrations';
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

/** @deprecated Import the integration function directly, e.g. `inboundFiltersIntegration()` instead of `new Integrations.InboundFilter(). */
export const Integrations = {
  // eslint-disable-next-line deprecation/deprecation
  ...CoreIntegrations,
  ...NodeExperimentalIntegrations,
};

export { init } from './sdk/init';
export { getAutoPerformanceIntegrations } from './integrations/getAutoPerformanceIntegrations';
export * as Handlers from './sdk/handlers';
export type { Span } from './types';

export { startSpan, startSpanManual, startInactiveSpan, getActiveSpan } from '@sentry/opentelemetry';
export {
  getClient,
  isInitialized,
  captureException,
  captureEvent,
  captureMessage,
  addGlobalEventProcessor,
  addEventProcessor,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
  withIsolationScope,
  withActiveSpan,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setIsolationScope,
  setCurrentScope,
} from './sdk/api';
export { getCurrentHub, makeMain } from './sdk/hub';
export { Scope } from './sdk/scope';

export {
  addBreadcrumb,
  makeNodeTransport,
  defaultStackParser,
  getSentryRelease,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  // eslint-disable-next-line deprecation/deprecation
  getModuleFromFilename,
  createGetModuleFromFilename,
  close,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  flush,
  Hub,
  runWithAsyncContext,
  SDK_VERSION,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  // eslint-disable-next-line deprecation/deprecation
  trace,
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
} from '@sentry/node';
