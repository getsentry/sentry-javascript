import type { Client } from '../client';
import { getGlobalSingleton } from '../carrier';
import type { IgnoreSpanFilter } from '../types/options';
import type { TunnelDefaults } from './tunnelDefaults';
import type { ServedTunnel, TunnelForwarder } from './tunnel';
import type { NodeTunnelHandler } from './tunnelForward';

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
  /** Whether core's HTTP server instrumentation is set up, whose `emit` wrapper handles tunnel requests itself. */
  httpServerHandlesTunnel?: boolean;
  /** Answers tunnel requests on Node servers. The tunnel sets it, so apps without one don't bundle it. */
  nodeHandler?: NodeTunnelHandler;
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

/**
 * Records that core's HTTP server instrumentation is set up. Its `emit` wrapper handles tunnel requests, so `node:http`
 * servers need no second one for the tunnel.
 */
export function setHttpServerHandlesTunnel(): void {
  getTunnelStore().httpServerHandlesTunnel = true;
}

/**
 * Whether core's HTTP server instrumentation handles tunnel requests, see {@link setHttpServerHandlesTunnel}.
 */
export function httpServerHandlesTunnel(): boolean {
  return !!getTunnelStore().httpServerHandlesTunnel;
}

/**
 * Sets what answers tunnel requests on Node servers, like the forwarder `serveTunnelIntegration` brings in.
 */
export function setNodeTunnelHandler(handler: NodeTunnelHandler): void {
  getTunnelStore().nodeHandler = handler;
}

/**
 * What answers tunnel requests on Node servers, see {@link setNodeTunnelHandler}.
 */
export function getNodeTunnelHandler(): NodeTunnelHandler | undefined {
  return getTunnelStore().nodeHandler;
}
