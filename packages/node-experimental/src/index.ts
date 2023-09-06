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
export * from './sdk/trace';

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
  extractTraceparentData,
  flush,
  getActiveTransaction,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  lastEventId,
  makeMain,
  runWithAsyncContext,
  Scope,
  startTransaction,
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
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  Transaction,
  User,
} from '@sentry/node';
