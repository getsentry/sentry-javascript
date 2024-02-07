export { init, getDefaultIntegrations } from './gcp/sdk';

export { wrapHttpFunction } from './gcp/http';
export type { HttpFunctionWrapperOptions } from './gcp/http';

export { wrapCloudEventFunction } from './gcp/cloud_events';
export type { CloudEventFunctionWrapperOptions } from './gcp/cloud_events';

export { wrapEventFunction } from './gcp/events';
export type { EventFunctionWrapperOptions } from './gcp/events';

export { googleCloudGrpcIntegration } from './gcp/google-cloud-grpc';
export { googleCloudHttpIntegration } from './gcp/google-cloud-http';

// These exports should not export `init` or `getDefaultIntegrations`.
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
  defaultStackParser,
  flush,
  getSentryRelease,
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
