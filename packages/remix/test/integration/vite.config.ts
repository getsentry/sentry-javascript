import { vitePlugin as remix } from '@remix-run/dev';
import { defineConfig, Plugin } from 'vite';
import { sentryRemixVitePlugin } from '@sentry/remix';
import path from 'path';

// Custom plugin to resolve @sentry/remix to ESM builds for Vite
function sentryRemixEsmResolver(): Plugin {
  const remixPackageRoot = path.resolve(__dirname, '../..');

  return {
    name: 'sentry-remix-esm-resolver',
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (source === '@sentry/remix') {
        // For SSR build, use the server ESM build
        if (options.ssr) {
          return path.join(remixPackageRoot, 'build/esm/index.server.js');
        }
        // For client build, use the client ESM build
        return path.join(remixPackageRoot, 'build/esm/index.client.js');
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    sentryRemixEsmResolver(),
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        // v3_singleFetch disabled - causes SDK initialization issues in test environment
        v3_singleFetch: false,
        v3_lazyRouteDiscovery: true,
      },
    }),
    sentryRemixVitePlugin(),
  ],
});
