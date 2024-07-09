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
    foo: 'bar',
  },
);

setTimeout(() => {
  throw new Error('I am a module metadata Error');
}, 0);
