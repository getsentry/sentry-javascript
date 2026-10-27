import type { Client } from '../client';
import { getClient } from '../currentScopes';
import { URL_PATH } from '@sentry/conventions/attributes';
import type { DsnComponents, DsnLike } from '../types/dsn';
import type { IgnoreSpanFilter, ServerTunnelOptions, TunnelInit, TunnelOptions } from '../types/options';
import { escapeStringForRegex } from '../vendor/escapeStringForRegex';
import { dsnToString, makeDsn } from './dsn';
import { parseUrl } from './url';

/**
 * Forwards a tunnel request to Sentry. Only `serveTunnelIntegration` brings it in, so apps without a tunnel don't bundle it.
 */
export type TunnelForwarder = (request: Request, allowedDsns: Array<string>) => Promise<Response>;

/**
 * A server client's tunnel paths, allowed DSNs and forwarder, computed once per client.
 */
interface ServedTunnel {
  paths: string[];
  allowedDsns: string[];
  forward: TunnelForwarder;
}

const servedTunnels = new WeakMap<Client, ServedTunnel>();

/**
 * Stores a server client's computed tunnel paths and allowed DSNs.
 */
export function setServedTunnel(client: Client, servedTunnel: ServedTunnel): void {
  servedTunnels.set(client, servedTunnel);
}

function getServedTunnel(): ServedTunnel | undefined {
  const client = getClient();

  return client && servedTunnels.get(client);
}

/**
 * Fills in framework defaults (like the base path) for a managed tunnel on the DSN-derived path. User options win.
 * A path the user wrote, as a string or `path`, is used as written, so a tunnel served outside the app keeps working.
 * The base path is normalized, and a root one is no default at all.
 */
export function applyTunnelDefaults(
  tunnel: TunnelInit | undefined,
  defaults: TunnelOptions | undefined,
): TunnelInit | undefined {
  if (!tunnel || typeof tunnel === 'string' || (tunnel !== true && tunnel.path)) {
    return tunnel;
  }

  const { basePath, ...rest } = defaults ?? {};
  const normalizedBasePath = normalizeTunnelBasePath(basePath);
  const resolvedDefaults: TunnelOptions = normalizedBasePath ? { ...rest, basePath: normalizedBasePath } : rest;
  if (!Object.keys(resolvedDefaults).length) {
    return tunnel;
  }

  return { ...resolvedDefaults, ...(tunnel === true ? {} : tunnel) };
}

/**
 * Returns the same-origin tunnel path for a DSN, e.g. `/k3x9q2a`, by default the active client's. Browser and server
 * derive it independently, and as a hash it gives ad-blocker filter lists nothing to match.
 */
export function getTunnelPath(dsn?: DsnLike): string | undefined {
  const components = dsn ? makeDsn(dsn) : getClient()?.getDsn();

  return components ? `/${fnv1a32(dsnToString(components)).toString(36)}` : undefined;
}

/**
 * The parts of a request the tunnel match reads. Satisfied by a fetch `Request` and Node's `IncomingMessage`.
 */
export interface TunnelRequestLike {
  method?: string;
  /** Absolute URL or path with query, e.g. Node's `IncomingMessage.url`. */
  url?: string;
}

/**
 * Returns the active server client's tunnel paths, relative to its base path. For frameworks that can only register
 * routes; everything else uses {@link handleTunnelRequestIfMatched}.
 */
export function getTunnelPaths(): string[] {
  return getServedTunnel()?.paths ?? [];
}

/**
 * Returns the DSNs the active server client's managed tunnel forwards, its own DSN included.
 */
export function getTunnelAllowedDsns(): string[] | undefined {
  return getServedTunnel()?.allowedDsns;
}

/**
 * The paths a managed tunnel is served at: the fixed `path`, or else one per allowed DSN.
 */
export function resolveTunnelPaths(tunnelOptions: ServerTunnelOptions, allowedDsns: Array<string>): string[] {
  // A root path would take over every POST to the app's root, so it falls back to the DSN-derived ones.
  const fixedPath = tunnelOptions.path?.replace(/\/$/, '');
  if (fixedPath) {
    return [fixedPath];
  }

  // Differently written DSNs can hash to the same path.
  const paths = allowedDsns.map(dsn => getTunnelPath(dsn));

  return [...new Set(paths.filter((path): path is string => !!path))];
}

/**
 * `ignoreSpans` filters for the server spans of tunnel requests. They match `url.path` and the legacy `http.url`,
 * which some framework spans start with (SvelteKit's `sveltekit.handle.root`).
 */
export function getTunnelIgnoreSpanFilters(tunnelOptions: TunnelOptions, paths: string[]): IgnoreSpanFilter[] {
  if (!paths.length) {
    return [];
  }

  const basePath = escapeStringForRegex(normalizeTunnelBasePath(tunnelOptions.basePath));
  const pathPattern = `${basePath}(?:${paths.map(escapeStringForRegex).join('|')})/?`;

  return [
    // oxlint-disable-next-line sdk/no-regexp-constructor -- built from escaped config values, not end user input
    { attributes: { [URL_PATH]: new RegExp(`^${pathPattern}$`) } },
    // oxlint-disable-next-line sdk/no-regexp-constructor -- built from escaped config values, not end user input
    { attributes: { 'http.url': new RegExp(`^[a-z][a-z\\d+.-]*://[^/]+${pathPattern}(?:[?#].*)?$`) } },
  ];
}

/**
 * Normalizes a base path to `/app`, or `''` for the root.
 */
export function normalizeTunnelBasePath(basePath: string | undefined): string {
  const path = (basePath?.startsWith('./') ? basePath.slice(1) : (basePath ?? '')).replace(/\/$/, '');

  return !path || path.startsWith('/') ? path : `/${path}`;
}

/**
 * The paths, base path and allowed DSNs of a tunnel to match requests against.
 */
interface TunnelMatch {
  paths: string[];
  basePath?: string;
  allowedDsns: string[];
}

/**
 * Resolves the tunnel the public helpers match: `options`, else the one `serveTunnelIntegration` serves, else the
 * path of the active client's own DSN.
 */
export function resolveTunnelMatch(options?: ServerTunnelOptions): TunnelMatch {
  const client = getClient();
  const servedTunnel = getServedTunnel();
  if (!options && servedTunnel) {
    return { ...servedTunnel, basePath: client?.getOptions()._managedTunnel?.basePath };
  }

  const allowedDsns = resolveAllowedDsns(options?.allowedDsns, client?.getDsn());

  return { paths: resolveTunnelPaths(options ?? {}, allowedDsns), basePath: options?.basePath, allowedDsns };
}

/**
 * Returns true if the request is a POST to one of the tunnel's paths.
 */
export function matchesTunnel(request: TunnelRequestLike, tunnel: Omit<TunnelMatch, 'allowedDsns'>): boolean {
  if (request.method !== 'POST' || !request.url) {
    return false;
  }

  const path = stripBasePath(parseUrl(request.url).path || '/', tunnel.basePath);

  return path !== undefined && tunnel.paths.includes(path.replace(/\/$/, ''));
}

/**
 * Returns true if the request is a POST to the managed tunnel. The tunnel comes from `options`, else from
 * `serveTunnelIntegration`, else it's the path of the active client's own DSN.
 */
export function isTunnelRequest(request: TunnelRequestLike, options?: ServerTunnelOptions): boolean {
  return matchesTunnel(request, resolveTunnelMatch(options));
}

/**
 * Returns true if the request targets the tunnel `serveTunnelIntegration` serves. Unlike {@link isTunnelRequest},
 * there's no fallback, so the framework SDKs serve nothing without the integration.
 */
export function isServedTunnelRequest(request: TunnelRequestLike): boolean {
  const servedTunnel = getServedTunnel();

  return (
    !!servedTunnel &&
    matchesTunnel(request, {
      paths: servedTunnel.paths,
      basePath: getClient()?.getOptions()._managedTunnel?.basePath,
    })
  );
}

/**
 * Forwards the request if it targets the tunnel `serveTunnelIntegration` serves, otherwise returns `undefined`. The
 * framework SDKs answer tunnel requests with it.
 */
export function handleServedTunnelRequest(request: Request): Promise<Response> | undefined {
  const servedTunnel = getServedTunnel();
  if (!servedTunnel?.allowedDsns.length || !isServedTunnelRequest(request)) {
    return undefined;
  }

  return servedTunnel.forward(request, servedTunnel.allowedDsns);
}

/**
 * `allowedDsns` plus the server's own DSN, which is always allowed.
 */
export function resolveAllowedDsns(
  allowedDsns: Array<string> | undefined,
  ownDsn: DsnComponents | undefined,
): Array<string> {
  // Normalized like the envelope header's DSN, which has no secret key.
  const dsns = new Set<string>();
  for (const components of [...(allowedDsns ?? []).map(dsn => makeDsn(dsn)), ownDsn]) {
    if (components) {
      dsns.add(dsnToString(components));
    }
  }

  return [...dsns];
}

/**
 * Returns the path below `basePath`, or `undefined` outside it.
 */
function stripBasePath(pathname: string, basePath: string | undefined): string | undefined {
  const base = normalizeTunnelBasePath(basePath);
  if (!base) {
    return pathname;
  }

  return pathname === base || pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : undefined;
}

/**
 * 32-bit FNV-1a (https://www.ietf.org/archive/id/draft-eastlake-fnv-22.html#name-fnv32-code): synchronous (the
 * browser needs it in `init`) and dependency free. Changing it breaks mixed SDK versions, since browser and server
 * compute the path separately.
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  // eslint-disable-next-line no-bitwise
  return hash >>> 0;
}
