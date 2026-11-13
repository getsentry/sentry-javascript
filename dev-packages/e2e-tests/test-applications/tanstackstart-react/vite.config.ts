import { defineConfig } from 'vite';
import * as fs from 'node:fs';
import tsConfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react-swc';
import { nitro } from 'nitro/vite';
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';

// Rolldown emits no map for chunks without mappable source (e.g. Vite's preload helper), so their debug
// IDs can't be uploaded. Recorded here because the SDK deletes all maps after the upload.
function recordChunksWithoutSourceMap() {
  return {
    name: 'record-chunks-without-source-map',
    apply: 'build' as const,
    enforce: 'post' as const,
    writeBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; code?: string }>) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !output.code || bundle[`${output.fileName}.map`]) {
          continue;
        }
        for (const match of output.code.matchAll(/sentry-dbid-([\da-f-]{36})/gi)) {
          fs.appendFileSync('.tmp_debug_ids_without_source_map', `${match[1]!.toLowerCase()}\n`);
        }
      }
    },
  };
}

const tunnelRouteMode = process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off';
const useManagedTunnelRoute = tunnelRouteMode !== 'off';
const useCustomTunnelRoute = process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

const appDsn =
  useManagedTunnelRoute || useCustomTunnelRoute
    ? 'http://public@localhost:3031/1337'
    : 'https://public@dsn.ingest.sentry.io/1337';

const appTunnel = useManagedTunnelRoute
  ? undefined
  : useCustomTunnelRoute
    ? '/custom-monitor'
    : 'http://localhost:3031/';

function resolveTunnelRouteOption() {
  switch (tunnelRouteMode) {
    case 'dynamic':
      return true;
    case 'static':
      return '/monitor';
    default:
      return undefined;
  }
}

const tunnelRoute = resolveTunnelRouteOption();

export default defineConfig({
  server: {
    port: 3000,
  },
  define: {
    __APP_DSN__: JSON.stringify(appDsn),
    __APP_TUNNEL__: appTunnel === undefined ? 'undefined' : JSON.stringify(appTunnel),
  },
  plugins: [
    tsConfigPaths(),
    // Start routes the whole app under the base path, so the tunnel has to be served under it too.
    tanstackStart(
      process.env.E2E_TEST_BASE_PATH ? { router: { basepath: process.env.E2E_TEST_BASE_PATH } } : undefined,
    ),
    nitro(),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
    sentryTanstackStart({
      sentryUrl: 'http://localhost:3032',
      authToken: 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
      tunnelRoute,
    }),
    recordChunksWithoutSourceMap(),
  ],
});
