import type { Client } from '../client';
import { getClient } from '../currentScopes';
import { URL_PATH } from '@sentry/conventions/attributes';
import type { DsnComponents, DsnLike } from '../types/dsn';
import type { IgnoreSpanFilter, ServerTunnelOptions, TunnelInit, TunnelOptions } from '../types/options';
import { DEBUG_BUILD } from '../debug-build';
import { escapeStringForRegex } from '../vendor/escapeStringForRegex';
import { debug } from './debug-logger';
import { dsnToString, makeDsn } from './dsn';
import { getClientTunnel, setClientTunnel } from './tunnelStore';
import { parseUrl } from './url';

/**
 * Forwards a tunnel request to Sentry. Only `serveTunnelIntegration` brings it in, so apps without a tunnel don't bundle it.
 */
export type TunnelForwarder = (request: Request, allowedDsns: Array<string>) => Promise<Response>;

/**
 * A server client's tunnel paths, base path, allowed DSNs and forwarder, computed once per client.
 */
export interface ServedTunnel extends TunnelMatch {
  forward: TunnelForwarder;
  /** Whether the SDK answers tunnel requests itself, see `ServerTunnelOptions.intercept`. */
  intercept: boolean;
}

/**
 * Computes a server client's served tunnel from its resolved options, and stores it.
 */
export function setServedTunnel(
  client: Client,
  tunnelOptions: ServerTunnelOptions,
  forward: TunnelForwarder,
): ServedTunnel {
  const allowedDsns = resolveAllowedDsns(tunnelOptions.allowedDsns, client.getDsn());
  const servedTunnel = {
    paths: resolveTunnelPaths(tunnelOptions, allowedDsns),
    basePath: tunnelOptions.basePath,
    allowedDsns,
    forward,
    intercept: tunnelOptions.intercept !== false,
  };
  setClientTunnel(client, { served: servedTunnel });

  return servedTunnel;
}

/**
 * The active client's served tunnel. It lives in the tunnel store, so a copy of this module that didn't set it up,
 * like the one a bundler gives Next.js's middleware next to its `instrumentation`, still finds it.
 */
function getServedTunnel(): ServedTunnel | undefined {
  const client = getClient();

  return client && getClientTunnel(client)?.served;
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
  const servedTunnel = !options && getServedTunnel();
  if (servedTunnel) {
    return servedTunnel;
  }

  const allowedDsns = resolveAllowedDsns(options?.allowedDsns, getClient()?.getDsn());

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
 * Returns true if the request targets the tunnel `serveTunnelIntegration` serves, whether the SDK answers it or the
 * app does with `intercept: false`. The server SDKs record nothing for these. Unlike {@link isTunnelRequest}, there's
 * no fallback, so the framework SDKs serve nothing without the integration.
 */
export function isServedTunnelRequest(request: TunnelRequestLike): boolean {
  try {
    return !!matchServedTunnel(request);
  } catch (error) {
    DEBUG_BUILD && debug.error('Sentry tunnel: failed to match a request', error);

    return false;
  }
}

/**
 * The served tunnel, if the SDK answers this request on it.
 */
export function getServedTunnelMatch(request: TunnelRequestLike): ServedTunnel | undefined {
  const servedTunnel = matchServedTunnel(request);

  return servedTunnel?.intercept ? servedTunnel : undefined;
}

/**
 * The served tunnel, if this request targets it.
 */
function matchServedTunnel(request: TunnelRequestLike): ServedTunnel | undefined {
  const servedTunnel = getServedTunnel();

  return servedTunnel?.allowedDsns.length && matchesTunnel(request, servedTunnel) ? servedTunnel : undefined;
}

/**
 * Forwards the request if it targets the tunnel `serveTunnelIntegration` serves, otherwise returns `undefined`. The
 * runtime and framework SDKs answer tunnel requests with it, ahead of the app.
 *
 * It never throws, since a throw here would break the app's own requests. Until a request is claimed, a failure hands
 * it to the app. Once claimed, its body may be read already, so a failure ends in a 502 instead.
 */
export function handleServedTunnelRequest(request: Request): Promise<Response> | undefined {
  let handled: Promise<Response>;
  try {
    // An envelope always has a body. Nuxt's Cloudflare plugin passes a copy without one, which its app answers later.
    const servedTunnel = request.body && getServedTunnelMatch(request);
    if (!servedTunnel) {
      return undefined;
    }

    handled = servedTunnel.forward(request, servedTunnel.allowedDsns);
  } catch (error) {
    DEBUG_BUILD && debug.error('Sentry tunnel: failed to match a request', error);

    return undefined;
  }

  return handled.catch(error => {
    DEBUG_BUILD && debug.error('Sentry tunnel: failed to forward a request', error);

    return new Response(null, { status: 502 });
  });
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
