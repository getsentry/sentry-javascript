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

export { startSpan, startInactiveSpan, getActiveSpan } from '@sentry/opentelemetry';
export {
  getClient,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  addGlobalEventProcessor,
  addEventProcessor,
  lastEventId,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
  withIsolationScope,
  // eslint-disable-next-line deprecation/deprecation
  configureScope,
} from './sdk/api';
export { getCurrentHub, makeMain } from './sdk/hub';
export { Scope } from './sdk/scope';

export {
  makeNodeTransport,
  defaultStackParser,
  getSentryRelease,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  deepReadDirSync,
  getModuleFromFilename,
  close,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  flush,
  Hub,
  runWithAsyncContext,
  SDK_VERSION,
  spanStatusfromHttpCode,
  trace,
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
