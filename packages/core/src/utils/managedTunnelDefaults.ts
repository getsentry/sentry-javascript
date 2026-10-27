import type { Client } from '../client';
import { getClient } from '../currentScopes';
import type { IgnoreSpanFilter, ServerTunnelOptions } from '../types/options';
import {
  getTunnelIgnoreSpanFilters,
  normalizeTunnelBasePath,
  resolveAllowedDsns,
  resolveTunnelPaths,
  setServedTunnel,
  stripBasePathFromTunnelPath,
} from './tunnel';

/**
 * Managed tunnel settings a framework SDK knows outside `init`.
 */
interface ManagedTunnelDefaults {
  /**
   * Enables the managed tunnel when `init` didn't, e.g. from TanStack Start's `tunnelRoute` build option. Its base
   * path is `basePath`, so it has none of its own.
   */
  tunnel?: Omit<ServerTunnelOptions, 'basePath'>;
  /** The path prefix the app is served under. Applies however the tunnel was enabled, unless `init` set its own. */
  basePath?: string;
}

let managedTunnelDefaults: ManagedTunnelDefaults | undefined;

// So re-applying defaults replaces a client's filters instead of adding more.
const installedSpanFilters = new WeakMap<Client, IgnoreSpanFilter[]>();

/**
 * Sets framework-known tunnel settings for the current and every later server client, so per-request clients
 * (Cloudflare) start with them. Settings from `init` win. Framework SDKs call this once at load.
 */
export function setManagedTunnelDefaults(defaults: ManagedTunnelDefaults): void {
  managedTunnelDefaults = {
    ...managedTunnelDefaults,
    ...(defaults.tunnel && { tunnel: defaults.tunnel }),
    ...(defaults.basePath !== undefined && { basePath: defaults.basePath }),
  };
  applyManagedTunnelDefaults(getClient());
}

/**
 * Resolves a server client's managed tunnel (from `init` or the defaults), computes its paths and allowed DSNs, and
 * installs its span filters. Runs when a server client is created and from {@link setManagedTunnelDefaults}.
 */
export function applyManagedTunnelDefaults(client: Client | undefined): void {
  const options = client?.getOptions();
  const tunnelOptions: ServerTunnelOptions | undefined = options?._managedTunnel ?? managedTunnelDefaults?.tunnel;
  if (!client || !options || !tunnelOptions) {
    return;
  }

  const basePath = normalizeTunnelBasePath(managedTunnelDefaults?.basePath);
  const resolved = stripBasePathFromTunnelPath(
    tunnelOptions.basePath === undefined && basePath ? { ...tunnelOptions, basePath } : tunnelOptions,
  );
  options._managedTunnel = resolved;
  const allowedDsns = resolveAllowedDsns(resolved.allowedDsns, client.getDsn());
  const paths = resolveTunnelPaths(resolved, allowedDsns);
  setServedTunnel(client, { paths, allowedDsns });

  const previousFilters = installedSpanFilters.get(client) ?? [];
  const spanFilters = getTunnelIgnoreSpanFilters(resolved, paths);
  options.ignoreSpans = [
    ...(options.ignoreSpans ?? []).filter(filter => !(previousFilters as unknown[]).includes(filter)),
    ...spanFilters,
  ];
  installedSpanFilters.set(client, spanFilters);
}

/**
 * Resets {@link setManagedTunnelDefaults}, for tests.
 *
 * @internal
 */
export function _INTERNAL_resetManagedTunnelDefaults(): void {
  managedTunnelDefaults = undefined;
}
