import { Integrations as CoreIntegrations } from '@sentry/core';

import * as NodeExperimentalIntegrations from './integrations';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...NodeExperimentalIntegrations,
};

export { init } from './sdk/init';
export { INTEGRATIONS as Integrations };
export { getAutoPerformanceIntegrations } from './integrations/getAutoPerformanceIntegrations';
export * as Handlers from './sdk/handlers';
export type { Span } from './types';

export { startSpan, startInactiveSpan, getCurrentHub, getClient, getActiveSpan } from '@sentry/opentelemetry';

export {
  makeNodeTransport,
  defaultStackParser,
  getSentryRelease,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  deepReadDirSync,
  getModuleFromFilename,
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  close,
  configureScope,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  flush,
  getActiveTransaction,
  Hub,
  lastEventId,
  makeMain,
  runWithAsyncContext,
  Scope,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  spanStatusfromHttpCode,
  trace,
  withScope,
  captureCheckIn,
  withMonitor,
  hapiErrorPlugin,
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
