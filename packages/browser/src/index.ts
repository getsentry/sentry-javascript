export { BrowserBackend, BrowserOptions } from './lib/backend';
export { BrowserFrontend } from './lib/frontend';
export {
  addBreadcrumb,
  create,
  captureEvent,
  captureException,
  captureMessage,
  popScope,
  pushScope,
  setUserContext,
  setExtraContext,
  setTagsContext,
} from './lib/sdk';
