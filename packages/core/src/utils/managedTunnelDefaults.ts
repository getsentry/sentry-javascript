import type { Client } from '../client';
import { getClient } from '../currentScopes';
import type { IgnoreSpanFilter, ServerTunnelOptions } from '../types/options';
import type { TunnelForwarder } from './tunnel';
import {
  getManagedTunnelState,
  getServeTunnelForwarder,
  getTunnelIgnoreSpanFilters,
  normalizeTunnelBasePath,
  setServedTunnel,
} from './tunnel';

/**
 * Managed tunnel settings a framework SDK knows outside `init`.
 */
export interface ManagedTunnelDefaults {
  /**
   * Enables the managed tunnel when `init` didn't, e.g. from TanStack Start's `tunnelRoute` build option. Its base
   * path is `basePath`, so it has none of its own.
   */
  tunnel?: Omit<ServerTunnelOptions, 'basePath'>;
  /** Forwards the requests of the tunnel `tunnel` enables. */
  forward?: TunnelForwarder;
  /**
   * The path prefix the app is served under. Applies to the DSN-derived path however the tunnel was enabled, unless
   * `init` set its own. A fixed `path` is served as written.
   */
  basePath?: string;
}

const tunnelForwarders = new WeakMap<Client, TunnelForwarder>();

// So re-applying defaults replaces a client's filters instead of adding more.
const installedSpanFilters = new WeakMap<Client, IgnoreSpanFilter[]>();

/**
 * Sets framework-known tunnel settings for the current and every later server client, so per-request clients
 * (Cloudflare) start with them. Settings from `init` win. Framework SDKs call this once at load.
 */
export function setManagedTunnelDefaults(defaults: ManagedTunnelDefaults): void {
  const state = getManagedTunnelState();
  state.defaults = {
    ...state.defaults,
    ...(defaults.tunnel && { tunnel: defaults.tunnel, forward: defaults.forward }),
    ...(defaults.basePath !== undefined && { basePath: defaults.basePath }),
  };
  applyManagedTunnelDefaults(getClient());
}

/**
 * Enables the managed tunnel on a server client, from `serveTunnelIntegration`.
 */
export function enableManagedTunnel(
  client: Client,
  tunnelOptions: ServerTunnelOptions,
  forward: TunnelForwarder,
): void {
  client.getOptions()._managedTunnel = { ...tunnelOptions };
  tunnelForwarders.set(client, forward);
  applyManagedTunnelDefaults(client);
}

/**
 * Resolves a server client's managed tunnel (from `serveTunnelIntegration` or the defaults), computes its paths and
 * allowed DSNs, and installs its span filters. Runs when a server client is created and from
 * {@link setManagedTunnelDefaults}.
 */
export function applyManagedTunnelDefaults(client: Client | undefined): void {
  const managedTunnelDefaults = getManagedTunnelState().defaults;
  const options = client?.getOptions();
  const tunnelOptions: ServerTunnelOptions | undefined = options?._managedTunnel ?? managedTunnelDefaults?.tunnel;
  // A framework SDK can bundle its own copy of this module, which only reaches the forwarder through the client.
  const forward =
    client && (tunnelForwarders.get(client) ?? getServeTunnelForwarder(client) ?? managedTunnelDefaults?.forward);
  if (!client || !options || !tunnelOptions || !forward) {
    return;
  }

  const basePath = normalizeTunnelBasePath(managedTunnelDefaults?.basePath);
  const resolved =
    tunnelOptions.basePath === undefined && !tunnelOptions.path && basePath
      ? { ...tunnelOptions, basePath }
      : tunnelOptions;
  options._managedTunnel = resolved;
  const { paths } = setServedTunnel(client, resolved, forward);

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
  getManagedTunnelState().defaults = undefined;
}
