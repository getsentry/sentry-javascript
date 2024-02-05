/** @type {import('@remix-run/dev').AppConfig} */
const useV2 = process.env.REMIX_VERSION === '2';
const useBrowserTracing = process.env.TRACING_INTEGRATION === 'true';

module.exports = {
  appDirectory: useBrowserTracing ? 'app_v2_tracingIntegration' : useV2 ? 'app_v2' : 'app_v1',
  assetsBuildDirectory: 'public/build',
  serverBuildPath: 'build/index.js',
  publicPath: '/build/',
  future: {
    v2_errorBoundary: useV2,
    v2_headers: useV2,
    v2_meta: useV2,
    v2_normalizeFormMethod: useV2,
    v2_routeConvention: useV2,
  },
};
