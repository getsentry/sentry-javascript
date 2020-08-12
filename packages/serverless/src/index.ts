export {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  Exception,
  Response,
  Severity,
  StackFrame,
  Stacktrace,
  Status,
  Thread,
  User,
} from '@sentry/types';

export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  makeMain,
  Scope,
  startTransaction,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
} from '@sentry/core';

import * as ServerlessIntegrations from './integrations';
export { ServerlessIntegrations as Integrations };
export { init } from './sdk';
export { SDK_NAME, SDK_VERSION } from './version';
// import { getMainCarrier } from '@sentry/hub';
// import * as domain from 'domain';

// We need to patch domain on the global __SENTRY__ object to make it work for serverless
// if we don't do this, browser bundlers will have troubles resolving require('domain')
// const carrier = getMainCarrier();
// if (carrier.__SENTRY__) {
//   carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
//   if (!carrier.__SENTRY__.extensions.domain) {
//     // @ts-ignore
//     carrier.__SENTRY__.extensions.domain = domain;
//   }
// }
