// This is the code the bundler plugin would inject to mark the subject bundle as a first party module:
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

const errorBtn = document.getElementById('errBtn');
errorBtn.addEventListener('click', async () => {
  Promise.allSettled([Promise.reject('I am a first party Error')]).then(values =>
    values.forEach(value => {
      if (value.status === 'rejected') console.error(value.reason);
    }),
  );
});
