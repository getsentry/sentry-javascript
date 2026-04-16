import type { Plugin } from "vite";

export interface TunnelRouteOptions {
  /**
   * A list of DSNs that are allowed to use the managed tunnel route.
   */
  allowedDsns: string[];

  /**
   * Controls the public route path used by the managed tunnel route.
   *
   * - `true` generates an opaque path once per dev session or production build.
   * - `'/custom-path'` uses a fixed absolute route path.
   *
   * @default true
   */
  tunnel?: true | string;
}

const MANAGED_TUNNEL_ROUTE_IMPORT = "SentryManagedTunnelRouteImport";
const MANAGED_TUNNEL_ROUTE_NAME = "SentryManagedTunnelRoute";
const MANAGED_TUNNEL_ROUTE_PATH_ENV_KEY =
  "__SENTRY_INTERNAL_TANSTACKSTART_TUNNEL_ROUTE__";

const VIRTUAL_TUNNEL_ROUTE_ID =
  "virtual:sentry-tanstackstart-react/tunnel-route";
const RESOLVED_VIRTUAL_TUNNEL_ROUTE_ID = `\0${VIRTUAL_TUNNEL_ROUTE_ID}`;

function generateRandomTunnelRoute(): string {
  const randomPath = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join("");

  return `/${randomPath}`;
}

export function resolveTunnelRoute(tunnel: true | string): string {
  if (typeof tunnel === "string") {
    return tunnel;
  }

  if (process.env[MANAGED_TUNNEL_ROUTE_PATH_ENV_KEY]) {
    return process.env[MANAGED_TUNNEL_ROUTE_PATH_ENV_KEY];
  }

  const resolvedTunnelRoute = generateRandomTunnelRoute();
  process.env[MANAGED_TUNNEL_ROUTE_PATH_ENV_KEY] = resolvedTunnelRoute;
  return resolvedTunnelRoute;
}

function validateTunnelRouteOptions(options: TunnelRouteOptions): string {
  if (options.allowedDsns.length === 0) {
    throw new Error(
      "[@sentry/tanstackstart-react] `sentryTanstackStart({ tunnelRoute })` requires at least one allowed DSN.",
    );
  }

  const tunnelRoute = options.tunnel ?? true;

  if (
    typeof tunnelRoute === "string" &&
    (!tunnelRoute.startsWith("/") ||
      tunnelRoute.includes("?") ||
      tunnelRoute.includes("#"))
  ) {
    throw new Error(
      "[@sentry/tanstackstart-react] `tunnelRoute.tunnel` must be `true` or an absolute route path starting with `/` and without query or hash segments.",
    );
  }

  return resolveTunnelRoute(tunnelRoute);
}

function hasRouteConflict(
  source: string,
  resolvedTunnelRoute: string,
): boolean {
  return (
    source.includes(`fullPath: '${resolvedTunnelRoute}'`) ||
    source.includes(`path: '${resolvedTunnelRoute}'`) ||
    source.includes(`id: '${resolvedTunnelRoute}'`)
  );
}

function injectAfterLastImport(source: string, statement: string): string {
  const importMatches = [...source.matchAll(/^import .+$/gm)];
  const lastImport = importMatches.at(-1);

  if (!lastImport || lastImport.index === undefined) {
    throw new Error(
      "[@sentry/tanstackstart-react] Failed to inject the managed tunnel route because `routeTree.gen.ts` imports could not be located.",
    );
  }

  const insertIndex = lastImport.index + lastImport[0].length;
  return `${source.slice(0, insertIndex)}\n${statement}${source.slice(insertIndex)}`;
}

export function injectManagedTunnelRoute(
  source: string,
  resolvedTunnelRoute: string,
): string {
  if (source.includes(VIRTUAL_TUNNEL_ROUTE_ID)) {
    return source;
  }

  if (hasRouteConflict(source, resolvedTunnelRoute)) {
    throw new Error(
      `[@sentry/tanstackstart-react] Cannot register managed tunnel route "${resolvedTunnelRoute}" because an existing TanStack Start route already uses that path.`,
    );
  }

  const serializedTunnelRoute = JSON.stringify(resolvedTunnelRoute);

  let transformedSource = injectAfterLastImport(
    source,
    `import { Route as ${MANAGED_TUNNEL_ROUTE_IMPORT} } from '${VIRTUAL_TUNNEL_ROUTE_ID}'`,
  );

  const rootRouteChildrenMatch = transformedSource.match(
    /const rootRouteChildren(?:\s*:\s*RootRouteChildren)?\s*=\s*\{/,
  );

  if (!rootRouteChildrenMatch || rootRouteChildrenMatch.index === undefined) {
    throw new Error(
      "[@sentry/tanstackstart-react] Failed to inject the managed tunnel route because the generated TanStack route tree did not contain `rootRouteChildren`.",
    );
  }

  const injectedRootRouteChildrenDeclaration = `const ${MANAGED_TUNNEL_ROUTE_NAME} = ${MANAGED_TUNNEL_ROUTE_IMPORT}.update({
  id: ${serializedTunnelRoute},
  path: ${serializedTunnelRoute},
  getParentRoute: () => rootRouteImport,
} as any)

${rootRouteChildrenMatch[0]}
  ${MANAGED_TUNNEL_ROUTE_NAME}: ${MANAGED_TUNNEL_ROUTE_NAME},
`;

  transformedSource = `${transformedSource.slice(0, rootRouteChildrenMatch.index)}${injectedRootRouteChildrenDeclaration}${transformedSource.slice(rootRouteChildrenMatch.index + rootRouteChildrenMatch[0].length)}`;

  return transformedSource;
}

export function makeTunnelRoutePlugin(
  options: TunnelRouteOptions,
  debug?: boolean,
): Plugin {
  const resolvedTunnelRoute = validateTunnelRouteOptions(options);
  const serializedTunnelRoute = JSON.stringify(resolvedTunnelRoute);
  const serializedAllowedDsns = JSON.stringify(options.allowedDsns);

  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[@sentry/tanstackstart-react] Registered tunnel route: ${resolvedTunnelRoute}`,
    );
  }

  return {
    name: "sentry-tanstackstart-tunnel-route",
    enforce: "pre",
    config() {
      return {
        define: {
          __SENTRY_TANSTACKSTART_TUNNEL_ROUTE__: serializedTunnelRoute,
        },
      };
    },
    resolveId(source) {
      return source === VIRTUAL_TUNNEL_ROUTE_ID
        ? RESOLVED_VIRTUAL_TUNNEL_ROUTE_ID
        : null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_TUNNEL_ROUTE_ID) {
        return null;
      }

      return `import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(${serializedTunnelRoute})({
  server: {
    handlers: {
      async POST({ request }) {
        const Sentry = await import('@sentry/tanstackstart-react');
        return Sentry.createSentryTunnelRoute({
          allowedDsns: ${serializedAllowedDsns},
        }).handlers.POST({ request });
      },
    },
  },
});
`;
    },
    transform(source, id) {
      if (
        !id.endsWith("/routeTree.gen.ts") &&
        !id.endsWith("\\routeTree.gen.ts")
      ) {
        return null;
      }

      return injectManagedTunnelRoute(source, resolvedTunnelRoute);
    },
  };
}
