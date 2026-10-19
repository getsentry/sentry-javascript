import type { Client } from '../client';
import { getClient } from '../currentScopes';
import type { IgnoreSpanFilter, TunnelOptions } from '../types/options';
import {
  getTunnelIgnoreSpanFilters,
  normalizeTunnelBasePath,
  resolveAllowedDsns,
  resolveTunnelPaths,
  withPathBelowBasePath,
} from './tunnel';

/**
 * Managed tunnel settings a framework SDK knows outside `init`.
 */
interface ManagedTunnelDefaults {
  /** Enables the managed tunnel, e.g. from TanStack Start's `tunnelRoute` build option. */
  tunnel?: TunnelOptions;
  /** The path prefix the app is served under. */
  basePath?: string;
}

let managedTunnelDefaults: ManagedTunnelDefaults | undefined;

// The span filters each client got for its managed tunnel, so applying new defaults replaces them.
const installedSpanFilters = new WeakMap<Client, IgnoreSpanFilter[]>();

/**
 * Sets the managed tunnel settings a framework SDK knows outside `init`, for every server client created afterwards
 * and for the current one. Clients created per request, like on Cloudflare, then start with the tunnel and its span
 * filters, so not even their first tunnel request's span gets through. A managed tunnel or `basePath` that `init`
 * set wins.
 *
 * Framework SDKs call this once, when their server code loads.
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
 * Settles a server client's managed tunnel: the one its `init` enabled, or else the defaults, under the default base
 * path. It computes the DSNs the client forwards for and the paths it's served at, and installs the span filters for
 * them. Server clients call this when they're created, and {@link setManagedTunnelDefaults} calls it again for a
 * client that already exists, replacing the filters it added.
 */
export function applyManagedTunnelDefaults(client: Client | undefined): void {
  const options = client?.getOptions();
  const tunnelOptions = options?._managedTunnel ?? managedTunnelDefaults?.tunnel;
  if (!client || !options || !tunnelOptions) {
    return;
  }

  const basePath = normalizeTunnelBasePath(managedTunnelDefaults?.basePath);
  const resolved = withPathBelowBasePath(
    tunnelOptions.basePath === undefined && basePath ? { ...tunnelOptions, basePath } : tunnelOptions,
  );
  options._managedTunnel = resolved;
  options._managedTunnelAllowedDsns = resolveAllowedDsns(resolved.allowedDsns, client.getDsn());
  options._managedTunnelPaths = resolveTunnelPaths(resolved, options._managedTunnelAllowedDsns);

  const previousFilters = installedSpanFilters.get(client) ?? [];
  const spanFilters = getTunnelIgnoreSpanFilters(resolved, options._managedTunnelPaths);
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
