import * as Sentry from '@sentry/browser';
import { thirdPartyErrorFilterIntegration } from '@sentry/browser';
import { wasmIntegration } from '@sentry/wasm';

// Simulate what the bundler plugin would inject to mark JS code as first-party
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
    '_sentryBundlerPluginAppKey:wasm-test-app': true,
  },
);

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    wasmIntegration({ applicationKey: 'wasm-test-app' }),
    thirdPartyErrorFilterIntegration({
      behaviour: 'apply-tag-if-contains-third-party-frames',
      filterKeys: ['wasm-test-app'],
    }),
  ],
});
