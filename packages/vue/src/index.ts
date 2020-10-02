import { addGlobalEventProcessor, SDK_VERSION } from '@sentry/browser';

/**
 * A global side effect that makes sure Sentry events that user
 * `@sentry/react` will correctly have Sentry events associated
 * with it.
 */
function createVueEventProcessor(): void {
  if (addGlobalEventProcessor) {
    addGlobalEventProcessor(event => {
      event.sdk = {
        ...event.sdk,
        name: 'sentry.javascript.vue',
        packages: [
          ...((event.sdk && event.sdk.packages) || []),
          {
            name: 'npm:@sentry/vue',
            version: SDK_VERSION,
          },
        ],
        version: SDK_VERSION,
      };

      return event;
    });
  }
}

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
} from '@sentry/browser';

export { init } from './sdk';

createVueEventProcessor();
