import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter, type SentryReactRouterBuildOptions } from '@sentry/react-router';
import { defineConfig } from 'vite';

// Guards against debug IDs being injected twice - once by the Vite plugin and once by
// `sentryOnBuildEnd` - which leaves two IDs per chunk, only one of which has an uploaded
// artifact bundle. See https://github.com/getsentry/sentry-javascript/issues/22929
export const sentryConfig: SentryReactRouterBuildOptions = {
  authToken: 'fake-auth-token',
  org: 'test-org',
  project: 'test-project',
  sentryUrl: 'http://localhost:3032',
  release: {
    name: 'test-release',
  },
  sourcemaps: {
    // The maps have to survive until `sentryOnBuildEnd` uploads them, so this asserts the option is
    // not forwarded to the Vite plugin (which deletes in a `finally` block regardless of `disable`).
    filesToDeleteAfterUpload: ['./build/client/assets/**/*.map'],
  },
  debug: true,
};

export default defineConfig(config => ({
  plugins: [reactRouter(), sentryReactRouter(sentryConfig, config)],
}));
