const Sentry = require('@sentry/gatsby');

// To avoid confusion, you must set the Sentry configuration in one
// place: either in `gatsby-config.js` (without non-serializable
// option support) or in `sentry.config.js` (supporting them).
// Defining them in `sentry.config.js` makes the SDK to initialize
// before this script is run, so we want to make sure to disable
// the SDK if both places contain options and warn the user about
// it. If the SDK hasn't been initialized at this point, we know
// there aren't any options set in `sentry.config.js`, so it's safe
// to initialize it here.

exports.onClientEntry = function(_, pluginParams) {
  const isIntialized = isSentryInitialized();
  if (!areSentryOptionsDefined(pluginParams)) {
    if (!isIntialized) {
      // eslint-disable-next-line no-console
      console.error(
        'Sentry Logger [Error]: No config for the Gatsby SDK was found. Learn how to configure it on\n' +
          'https://docs.sentry.io/platforms/javascript/guides/gatsby/',
      );
    }
    return;
  }

  if (isIntialized) {
    // eslint-disable-next-line no-console
    console.error(
      'Sentry Logger [Error]: The SDK has been disabled because your Sentry config must live in one place.\n' +
        'Consider moving it all to your `sentry.config.js`.',
    );
    // TODO: link to the docs where the new approach is documented
    window.__SENTRY__.hub.getClient().getOptions().enabled = false;
    return;
  }

  Sentry.init({
    // eslint-disable-next-line no-undef
    release: __SENTRY_RELEASE__,
    // eslint-disable-next-line no-undef
    dsn: __SENTRY_DSN__,
    ...pluginParams,
  });

  window.Sentry = Sentry;
};

function isSentryInitialized() {
  // Although `window` should exist because we're in the browser (where this script
  // is run), and `__SENTRY__.hub` is created when importing the Gatsby SDK, double
  // check that in case something weird happens.
  return !!(window && window.__SENTRY__ && window.__SENTRY__.hub && window.__SENTRY__.hub.getClient());
}

function areSentryOptionsDefined(params) {
  if (params == undefined) return false;
  // Even if there aren't any options, there's a `plugins` property defined as an empty array
  if (Object.keys(params).length == 1 && Array.isArray(params.plugins) && params.plugins.length == 0) {
    return false;
  }
  return true;
}
