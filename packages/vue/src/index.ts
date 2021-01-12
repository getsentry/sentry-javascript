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
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startTransaction,
  withScope,
  SDK_VERSION,
} from '@sentry/browser';

export { init } from './sdk';
export { vueRouterInstrumentation } from './vuerouter';

import { SDK_VERSION } from '@sentry/browser';
import { setSDKInfo } from '@sentry/utils';

setSDKInfo('sentry.javascript.vue', 'npm:@sentry/vue', SDK_VERSION);
