import { getEnvelopeEndpointWithUrlEncodedAuth } from '../api';
import { getClient } from '../currentScopes';
import { suppressTracing } from '../tracing/trace';
import type { DsnLike } from '../types/dsn';
import type { TunnelOptions } from '../types/options';
import { debug } from './debug-logger';
import { dsnToString, makeDsn } from './dsn';
import { parseEnvelope } from './envelope';

export interface HandleTunnelRequestOptions {
  /** Incoming request containing the Sentry envelope as its body */
  request: Request;
  /** DSNs whose envelopes may be forwarded. Defaults to the DSN of the active client. */
  allowedDsns?: Array<string>;
}

/**
 * Splits the `tunnel` option a server SDK's `init` received. A URL stays the transport tunnel for the server's own
 * envelopes. `true` or {@link TunnelOptions} enables serving the managed tunnel instead.
 */
export function resolveServerTunnelOption(tunnel: string | true | TunnelOptions | undefined): {
  tunnel: string | undefined;
  _managedTunnel?: TunnelOptions;
} {
  if (typeof tunnel === 'string' || !tunnel) {
    return { tunnel };
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
  const components = makeDsn(dsn);
  return components ? `/${fnv1a(dsnToString(components)).toString(36)}` : undefined;
}

/**
 * Returns true if the request targets the managed tunnel.
 *
 * Without `options`, this uses the managed tunnel config of the active client and matches nothing unless its
 * `init` was called with `tunnel: true`.
 */
export function isTunnelRequest(method: string, pathname: string, options?: TunnelOptions): boolean {
  if (method !== 'POST') {
    return false;
  }

  const tunnelOptions = options ?? getClient()?.getOptions()._managedTunnel;
  if (!tunnelOptions) {
    return false;
  }

  const path = stripBasePath(pathname, tunnelOptions.basePath).replace(/\/$/, '');
  return resolveAllowedDsns(tunnelOptions.allowedDsns).some(dsn => getTunnelPath(dsn) === path);
}

/**
 * Forwards the request to Sentry if it targets the managed tunnel, otherwise returns `undefined` so the caller
 * can hand the request to the app.
 */
export function handleTunnelRequestIfMatched(request: Request, options?: TunnelOptions): Promise<Response> | undefined {
  if (!isTunnelRequest(request.method, new URL(request.url).pathname, options)) {
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

/** 32-bit FNV-1a. Synchronous, so the browser can derive the path before its client is constructed. */
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
