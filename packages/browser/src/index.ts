export {
  addBreadcrumb,
  captureMessage,
  captureException,
  captureEvent,
  clearScope,
  popScope,
  pushScope,
  setUserContext,
  setTagsContext,
  setExtraContext,
  withScope,
} from '@sentry/shim';

export { BrowserBackend, BrowserOptions } from './lib/backend';
export { BrowserFrontend } from './lib/frontend';
export { create, getCurrentFrontend } from './lib/sdk';
