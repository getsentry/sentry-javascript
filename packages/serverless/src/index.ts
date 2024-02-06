export { awsServicesIntegration } from './awsservices';
import { init as awsLambdaInit, tryPatchHandler, wrapHandler } from './awslambda';
import { init as gcpFunctionInit } from './gcpfunction';

const AWSLambda = {
  init: awsLambdaInit,
  wrapHandler,
  tryPatchHandler,
};

const GCPFunction = {
  init: gcpFunctionInit,
};

export { AWSLambda, GCPFunction };

import type { WrapperOptions as AWSWrapperOptions } from './awslambda';
export type { AWSWrapperOptions };

// TODO(v8): We have to explicitly export these because of the namespace exports
// above. This is because just doing `export * from '@sentry/node'` will not
// work with Node native esm while we also have namespace exports in a package.
// What we should do is get rid of the namespace exports.
export {
  Hub,
  SDK_VERSION,
  Scope,
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  autoDiscoverNodePerformanceMonitoringIntegrations,
  captureEvent,
  captureException,
  captureMessage,
  captureCheckIn,
  withMonitor,
  createTransport,
  getClient,
  isInitialized,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getHubFromCarrier,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  setCurrentClient,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
  withIsolationScope,
  NodeClient,
  makeNodeTransport,
  close,
  getDefaultIntegrations,
  defaultStackParser,
  flush,
  getSentryRelease,
  init,
  DEFAULT_USER_INCLUDES,
  addRequestDataToEvent,
  extractRequestData,
  Handlers,
  setMeasurement,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
  parameterize,
  requestDataIntegration,
  linkedErrorsIntegration,
  inboundFiltersIntegration,
  functionToStringIntegration,
  createGetModuleFromFilename,
  metrics,
  runWithAsyncContext,
  consoleIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  modulesIntegration,
  contextLinesIntegration,
  nodeContextIntegration,
  localVariablesIntegration,
  anrIntegration,
  hapiIntegration,
  httpIntegration,
  nativeNodeFetchintegration,
  spotlightIntegration,
} from '@sentry/node';
