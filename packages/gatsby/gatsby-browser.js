/* eslint-disable no-console */
import { init } from '@sentry/gatsby';

export function onClientEntry(_, pluginParams) {
  const isIntialized = isSentryInitialized();
  const areOptionsDefined = areSentryOptionsDefined(pluginParams);

  if (isIntialized) {
    if (areOptionsDefined) {
      console.warn(
        'Sentry Logger [Warn]: The SDK was initialized in the Sentry config file, but options were found in the Gatsby config. ' +
          'These have been ignored. Merge them to the Sentry config if you want to use them.\n' +
          'Learn more about the Gatsby SDK in https://docs.sentry.io/platforms/javascript/guides/gatsby/.',
      );
    }
    return;
  }

  if (!areOptionsDefined) {
    console.error(
      'Sentry Logger [Error]: No config for the Gatsby SDK was found.\n' +
        'Learn how to configure it in https://docs.sentry.io/platforms/javascript/guides/gatsby/.',
    );
    return;
  }

  init({
    // eslint-disable-next-line no-undef
    dsn: __SENTRY_DSN__,
    ...pluginParams,
  });
}

function isSentryInitialized() {
  // Although `window` should exist because we're in the browser (where this script
  // is run), and `__SENTRY__.hub` is created when importing the Gatsby SDK, double
  // check that in case something weird happens.
  return !!(window && window.__SENTRY__ && window.__SENTRY__.hub && window.__SENTRY__.hub.getClient());
}

function areSentryOptionsDefined(params) {
  if (params === undefined) return false;
  // Even if there aren't any options, there's a `plugins` property defined as an empty array
  if (Object.keys(params).length == 1 && Array.isArray(params.plugins) && params.plugins.length == 0) {
    return false;
  }
  return true;
}
