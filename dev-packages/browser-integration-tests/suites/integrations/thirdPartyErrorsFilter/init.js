import * as Sentry from '@sentry/browser';
// eslint-disable-next-line import/no-duplicates
import { thirdPartyErrorFilterIntegration } from '@sentry/browser';
// eslint-disable-next-line import/no-duplicates
import { captureConsoleIntegration } from '@sentry/browser';

// This is the code the bundler plugin would inject to mark the init bundle as a first party module:
var _sentryModuleMetadataGlobal =
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
      ? global
      : typeof self !== 'undefined'
        ? self
        : {};

_sentryModuleMetadataGlobal._sentryModuleMetadata = _sentryModuleMetadataGlobal._sentryModuleMetadata || {};

_sentryModuleMetadataGlobal._sentryModuleMetadata[new Error().stack] = Object.assign(
  {},
  _sentryModuleMetadataGlobal._sentryModuleMetadata[new Error().stack],
  {
    '_sentryBundlerPluginAppKey:my-app': true,
  },
);

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    thirdPartyErrorFilterIntegration({ behaviour: 'apply-tag-if-contains-third-party-frames', filterKeys: ['my-app'] }),
    captureConsoleIntegration({ levels: ['error'], handled: false }),
  ],
  attachStacktrace: true,
});
