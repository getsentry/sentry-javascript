import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react-swc";
import { nitro } from "nitro/vite";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";

const tunnelRouteMode = process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? "off";
const useManagedTunnelRoute = tunnelRouteMode !== "off";
const useCustomTunnelRoute = process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === "1";

const appDsn = useManagedTunnelRoute || useCustomTunnelRoute
  ? "http://public@localhost:3031/1337"
  : "https://public@dsn.ingest.sentry.io/1337";

const appTunnel = useManagedTunnelRoute
  ? undefined
  : useCustomTunnelRoute
    ? "/custom-monitor"
    : "http://localhost:3031/";

const tunnelRoute =
  tunnelRouteMode === "dynamic"
    ? { allowedDsns: [appDsn], tunnel: true as const }
    : tunnelRouteMode === "static"
      ? { allowedDsns: [appDsn], tunnel: "/monitor" }
      : undefined;

export default defineConfig({
  server: {
    port: 3000,
  },
  define: {
    __APP_DSN__: JSON.stringify(appDsn),
    __APP_TUNNEL__:
      appTunnel === undefined ? "undefined" : JSON.stringify(appTunnel),
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    nitro(),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
    sentryTanstackStart({
      org: process.env.E2E_TEST_SENTRY_ORG_SLUG,
      project: process.env.E2E_TEST_SENTRY_PROJECT,
      authToken: process.env.E2E_TEST_AUTH_TOKEN,
      debug: true,
      tunnelRoute,
    }),
  ],
});
