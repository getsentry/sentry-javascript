import type { Client } from '../client';
import { getGlobalSingleton } from '../carrier';
import type { IgnoreSpanFilter } from '../types/options';
import type { TunnelDefaults } from './tunnelDefaults';
import type { ServedTunnel, TunnelForwarder } from './tunnel';

/**
 * What the tunnel keeps per server client.
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
 * The tunnel state, shared by every copy of `@sentry/core`: a framework's server bundle can carry its own
 * copy, which sets the tunnel up for the runtime's copy that answers it.
 */
export interface TunnelStore {
  clients: WeakMap<Client, ClientTunnelState>;
  defaults?: TunnelDefaults;
}

/**
 * Only this module touches the store, through the functions below.
 */
function getTunnelStore(): TunnelStore {
  return getGlobalSingleton('tunnelStore', () => ({ clients: new WeakMap() }));
}

/**
 * What the tunnel keeps for a client.
 */
export function getClientTunnel(client: Client): Readonly<ClientTunnelState> | undefined {
  return getTunnelStore().clients.get(client);
}

/**
 * Sets what the tunnel keeps for a client. Merges into what is already there, like `scope.setTags`.
 */
export function setClientTunnel(client: Client, state: ClientTunnelState): void {
  const { clients } = getTunnelStore();
  clients.set(client, { ...clients.get(client), ...state });
}

/**
 * The framework-known tunnel settings, see `setTunnelDefaults`.
 */
export function getStoredTunnelDefaults(): Readonly<TunnelDefaults> | undefined {
  return getTunnelStore().defaults;
}

/**
 * Replaces the framework-known tunnel settings.
 */
export function setStoredTunnelDefaults(defaults: TunnelDefaults | undefined): void {
  getTunnelStore().defaults = defaults;
}
