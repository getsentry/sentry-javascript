import { getEnvelopeEndpointWithUrlEncodedAuth } from '../api';
import { getClient } from '../currentScopes';
import { suppressTracing } from '../tracing/trace';
import { URL_PATH } from '@sentry/conventions/attributes';
import type { DsnComponents, DsnLike } from '../types/dsn';
import type { IgnoreSpanFilter, TunnelOptions } from '../types/options';
import { escapeStringForRegex } from '../vendor/escapeStringForRegex';
import { debug } from './debug-logger';
import { dsnToString, makeDsn } from './dsn';
import { parseEnvelope } from './envelope';
import { parseUrl } from './url';

export interface HandleTunnelRequestOptions {
  /** Incoming request containing the Sentry envelope as its body */
  request: Request;
  /** DSNs whose envelopes may be forwarded. Defaults to the DSN of the active client. */
  allowedDsns?: Array<string>;
}

// Servers derive the paths on every POST, so parse and hash each DSN once. This also keeps an invalid DSN in
// `allowedDsns` from logging on every request. Keys come from config, never from requests, so the map stays small.
const tunnelPathCache = new Map<string, string | undefined>();

/**
 * Splits the `tunnel` option a server SDK's `init` received. A URL stays the transport tunnel for the server's own
 * envelopes. `true` or {@link TunnelOptions} enables serving the managed tunnel instead.
 */
export function resolveServerTunnelOption(tunnel: string | true | TunnelOptions | undefined): {
  tunnel: string | undefined;
  _managedTunnel?: TunnelOptions;
} {
  if (!tunnel) {
    return { tunnel };
  }

  if (typeof tunnel === 'string') {
    // A relative path can't be a transport URL on the server, so it names the path to serve instead.
    return tunnel.startsWith('/') ? { tunnel: undefined, _managedTunnel: { path: tunnel } } : { tunnel };
  }

  return { tunnel: undefined, _managedTunnel: tunnel === true ? {} : tunnel };
}

/**
 * Returns the same-origin tunnel path for a DSN, e.g. `/k3x9q2a`.
 *
 * Browser and server SDKs derive the path independently from the DSN, so no build step has to pass it
 * between them. The path is a hash so it carries nothing an ad-blocker filter list could match on.
 */
export function getTunnelPath(dsn: DsnLike): string | undefined {
  if (typeof dsn === 'string' && tunnelPathCache.has(dsn)) {
    return tunnelPathCache.get(dsn);
  }

  const components = makeDsn(dsn);
  const path = components ? `/${fnv1a(dsnToString(components)).toString(36)}` : undefined;
  if (typeof dsn === 'string') {
    tunnelPathCache.set(dsn, path);
  }

  return path;
}

/**
 * The parts of an incoming request the tunnel decision may look at. A fetch `Request` satisfies it, and Node SDKs pass
 * an `IncomingMessage` directly. Callers always pass the whole request so the decision can change without touching them.
 */
export interface TunnelRequestLike {
  method?: string;
  /** Absolute URL or path with query, e.g. Node's `IncomingMessage.url`. */
  url?: string;
  headers?: Headers | Record<string, string | string[] | undefined>;
}

/**
 * Returns the tunnel paths the server accepts, relative to its base path. Frameworks that can only register routes
 * use these, everything else should call {@link isTunnelRequest} or {@link handleTunnelRequestIfMatched}.
 *
 * Without `options`, this uses the managed tunnel config of the active client.
 */
export function getTunnelPaths(options?: TunnelOptions): string[] {
  const tunnelOptions = options ?? getClient()?.getOptions()._managedTunnel;
  if (!tunnelOptions) {
    return [];
  }

  return tunnelPathsFor(tunnelOptions, resolveAllowedDsns(tunnelOptions.allowedDsns));
}

/**
 * An `ignoreSpans` filter for the server spans of tunnel requests. Server SDKs start the span before a framework
 * hook gets to answer the request, so clients add this whenever the managed tunnel is enabled.
 */
export function getTunnelIgnoreSpanFilter(
  tunnelOptions: TunnelOptions,
  dsn: DsnComponents | undefined,
): IgnoreSpanFilter | undefined {
  const allowedDsns = tunnelOptions.allowedDsns ?? (dsn ? [dsnToString(dsn)] : []);
  const paths = tunnelPathsFor(tunnelOptions, allowedDsns).map(escapeStringForRegex);
  if (!paths.length) {
    return undefined;
  }

  const basePath = escapeStringForRegex(tunnelOptions.basePath?.replace(/\/$/, '') ?? '');

  // oxlint-disable-next-line sdk/no-regexp-constructor -- built from escaped config values, not end user input
  return { attributes: { [URL_PATH]: new RegExp(`^(?:${basePath})?(?:${paths.join('|')})/?$`) } };
}

/**
 * Returns true if the request targets the managed tunnel.
 *
 * Without `options`, this uses the managed tunnel config of the active client and matches nothing unless its
 * `init` was called with `tunnel: true`.
 */
export function isTunnelRequest(request: TunnelRequestLike, options?: TunnelOptions): boolean {
  if (request.method !== 'POST' || !request.url) {
    return false;
  }

  const tunnelOptions = options ?? getClient()?.getOptions()._managedTunnel;
  if (!tunnelOptions) {
    return false;
  }

  const path = stripBasePath(parseUrl(request.url).path || '/', tunnelOptions.basePath).replace(/\/$/, '');

  return getTunnelPaths(tunnelOptions).includes(path);
}

/**
 * Forwards the request to Sentry if it targets the managed tunnel, otherwise returns `undefined` so the caller
 * can hand the request to the app.
 */
export function handleTunnelRequestIfMatched(request: Request, options?: TunnelOptions): Promise<Response> | undefined {
  if (!isTunnelRequest(request, options)) {
    return undefined;
  }

  const allowedDsns = (options ?? getClient()?.getOptions()._managedTunnel)?.allowedDsns;

  return handleTunnelRequest({ request, allowedDsns });
}

/**
 * Core Sentry tunnel handler - framework agnostic.
 *
 * Validates the envelope DSN against allowed DSNs, then forwards the
 * envelope to the Sentry ingest endpoint.
 *
 * @returns A `Response` — either the upstream Sentry response on success, or an error response.
 */
export async function handleTunnelRequest(options: HandleTunnelRequestOptions): Promise<Response> {
  const { request } = options;
  const allowedDsns = resolveAllowedDsns(options.allowedDsns);

  if (allowedDsns.length === 0) {
    return new Response('Tunnel not configured', { status: 500 });
  }

  const body = new Uint8Array(await request.arrayBuffer());

  let envelopeHeader;
  try {
    [envelopeHeader] = parseEnvelope(body);
  } catch {
    return new Response('Invalid envelope', { status: 400 });
  }

  if (!envelopeHeader) {
    return new Response('Invalid envelope: missing header', { status: 400 });
  }

  const dsn = envelopeHeader.dsn;
  if (!dsn) {
    return new Response('Invalid envelope: missing DSN', { status: 400 });
  }

  // SECURITY: Validate that the envelope DSN matches one of the allowed DSNs
  // This prevents SSRF attacks where attackers send crafted envelopes
  // with malicious DSNs pointing to arbitrary hosts
  const isAllowed = allowedDsns.some(allowed => allowed === dsn);

  if (!isAllowed) {
    debug.warn(`Sentry tunnel: rejected request with unauthorized DSN (${dsn})`);
    return new Response('DSN not allowed', { status: 403 });
  }

  const dsnComponents = makeDsn(dsn);
  if (!dsnComponents) {
    debug.warn(`Could not extract DSN Components from: ${dsn}`);
    return new Response('Invalid DSN', { status: 403 });
  }

  const sentryIngestUrl = getEnvelopeEndpointWithUrlEncodedAuth(dsnComponents);

  try {
    // The forward is SDK plumbing, not app work, so it must not show up as a span.
    return await suppressTracing(() =>
      fetch(sentryIngestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
        },
        body,
      }),
    );
  } catch (error) {
    debug.error('Sentry tunnel: failed to forward envelope', error);
    return new Response('Failed to forward envelope to Sentry', { status: 500 });
  }
}

function resolveAllowedDsns(allowedDsns: Array<string> | undefined): Array<string> {
  if (allowedDsns) {
    return allowedDsns;
  }

  const dsn = getClient()?.getDsn();

  return dsn ? [dsnToString(dsn)] : [];
}

function stripBasePath(pathname: string, basePath: string | undefined): string {
  const base = basePath?.replace(/\/$/, '');
  if (!base) {
    return pathname;
  }

  return pathname === base || pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

/**
 * 32-bit FNV-1a, because the browser needs the path synchronously in `init` (`crypto.subtle.digest` is async) and it
 * runs in every runtime without dependencies. It needn't be cryptographic since the DSN is public.
 *
 * Browser and server SDKs compute the path separately, so changing the algorithm breaks mixed SDK versions.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  // eslint-disable-next-line no-bitwise
  return hash >>> 0;
}

function tunnelPathsFor(tunnelOptions: TunnelOptions, allowedDsns: Array<string>): string[] {
  if (tunnelOptions.path) {
    return [tunnelOptions.path];
  }

  return allowedDsns.map(dsn => getTunnelPath(dsn)).filter((path): path is string => !!path);
}
