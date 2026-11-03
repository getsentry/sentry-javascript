import type { Client } from '../client';
import { getGlobalSingleton } from '../carrier';
import type { IgnoreSpanFilter } from '../types/options';
import type { ManagedTunnelDefaults } from './managedTunnelDefaults';
import type { ServedTunnel, TunnelForwarder } from './tunnel';

/**
 * What the managed tunnel keeps per server client.
 */
export interface ClientTunnelState {
  /** The paths, allowed DSNs and forwarder the client answers tunnel requests with. */
  served?: ServedTunnel;
  /** The forwarder `serveTunnelIntegration` enabled the tunnel with. */
  forward?: TunnelForwarder;
  /** The span filters the tunnel installed, so applying it again replaces them instead of adding more. */
  spanFilters?: IgnoreSpanFilter[];
}

/**
 * The managed tunnel state, shared by every copy of `@sentry/core`: a framework's server bundle can carry its own
 * copy, which sets the tunnel up for the runtime's copy that answers it.
 */
export interface TunnelRegistry {
  clients: WeakMap<Client, ClientTunnelState>;
  defaults?: ManagedTunnelDefaults;
}

/**
 * Only this module touches the registry, through the functions below.
 */
function getTunnelRegistry(): TunnelRegistry {
  return getGlobalSingleton('tunnelRegistry', () => ({ clients: new WeakMap() }));
}

/**
 * What the managed tunnel keeps for a client.
 */
export function getClientTunnel(client: Client): Readonly<ClientTunnelState> | undefined {
  return getTunnelRegistry().clients.get(client);
}

/**
 * Sets what the managed tunnel keeps for a client. Merges into what is already there, like `scope.setTags`.
 */
export function setClientTunnel(client: Client, state: ClientTunnelState): void {
  const { clients } = getTunnelRegistry();
  clients.set(client, { ...clients.get(client), ...state });
}

/**
 * The framework-known tunnel settings, see `setManagedTunnelDefaults`.
 */
export function getTunnelDefaults(): Readonly<ManagedTunnelDefaults> | undefined {
  return getTunnelRegistry().defaults;
}

/**
 * Replaces the framework-known tunnel settings.
 */
export function setTunnelDefaults(defaults: ManagedTunnelDefaults | undefined): void {
  getTunnelRegistry().defaults = defaults;
}
