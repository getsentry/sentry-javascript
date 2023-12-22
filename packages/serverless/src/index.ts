// https://medium.com/unsplash/named-namespace-imports-7345212bbffb
import * as AWSLambda from './awslambda';
import * as GCPFunction from './gcpfunction';
export { AWSLambda, GCPFunction };

export { AWSServices } from './awsservices';

// TODO(v8): We have to explicitly export these because of the namespace exports
// above. This is because just doing `export * from '@sentry/node'` will not
// work with Node native esm while we also have namespace exports in a package.
// What we should do is get rid of the namespace exports.
export {
  Hub,
  SDK_VERSION,
  Scope,
  addBreadcrumb,
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
  addEventProcessor,
  addIntegration,
  autoDiscoverNodePerformanceMonitoringIntegrations,
  captureEvent,
  captureException,
  captureMessage,
  captureCheckIn,
  withMonitor,
  // eslint-disable-next-line deprecation/deprecation
  configureScope,
  createTransport,
  getActiveTransaction,
  getCurrentHub,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getHubFromCarrier,
  makeMain,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startTransaction,
  withScope,
  NodeClient,
  makeNodeTransport,
  close,
  defaultIntegrations,
  defaultStackParser,
  flush,
  getSentryRelease,
  init,
  lastEventId,
  DEFAULT_USER_INCLUDES,
  addRequestDataToEvent,
  extractRequestData,
  deepReadDirSync,
  Handlers,
  Integrations,
  setMeasurement,
  getActiveSpan,
  startSpan,
  // eslint-disable-next-line deprecation/deprecation
  startActiveSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
} from '@sentry/node';
