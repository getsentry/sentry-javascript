import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter, type SentryReactRouterBuildOptions } from '@sentry/react-router';
import { defineConfig } from 'vite';

// Deliberately routes `sourcemaps` through `unstable_sentryVitePluginOptions`. That shape
// used to drop the SDK's `sourcemaps.disable: true`, which re-enabled debug ID injection in
// the Vite plugin on top of the injection done by `sentryOnBuildEnd` - two debug IDs per
// chunk, only one of which has an uploaded artifact bundle.
// See https://github.com/getsentry/sentry-javascript/issues/22929
export const sentryConfig: SentryReactRouterBuildOptions = {
  authToken: 'fake-auth-token',
  org: 'test-org',
  project: 'test-project',
  release: {
    name: 'test-release',
  },
  unstable_sentryVitePluginOptions: {
    url: 'http://localhost:3032',
    sourcemaps: {
      // The maps have to survive until `sentryOnBuildEnd` uploads them, so this asserts
      // the option is not forwarded to the Vite plugin (which deletes in a `finally`).
      filesToDeleteAfterUpload: ['./build/client/assets/**/*.map'],
    },
  },
  debug: true,
};

export default defineConfig(config => ({
  plugins: [reactRouter(), sentryReactRouter(sentryConfig, config)],
}));
