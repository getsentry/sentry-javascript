// TODO: Swich out the sucrase hack for the real, currently-commented-out code once we switch sucrase builds on.

// export default ['esm', 'cjs'].map(format => ({
export default ['esm', 'cjs'].map(format => {
  const config = {
    input: '../../rollup/jsPolyfills/index.js',
    output: {
      // preserveModules: true,
      dir: `jsPolyfills/${format}`,
      format,
      strict: false,
    },
  };
  // }));

  // temporary hack for testing sucrase bundles before we switch over
  if (!process.version.startsWith('v8')) {
    // eslint-disable-next-line no-console
    console.log('Doing normal preserveModules in polyfill config');
    config.output.preserveModules = true;
  } else {
    // eslint-disable-next-line no-console
    console.log('Doing node 8 preserveModules in polyfill config');
    config.preserveModules = true;
  }

  return config;
});
