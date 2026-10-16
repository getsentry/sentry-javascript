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

// Bounds the memory of each request. SDK envelopes stay far below it.
export const MAX_TUNNEL_BODY_SIZE = 20 * 1024 * 1024;

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
  return { attributes: { [URL_PATH]: new RegExp(`^${basePath}(?:${paths.join('|')})/?$`) } };
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

  const path = stripBasePath(parseUrl(request.url).path || '/', tunnelOptions.basePath);

  return path !== undefined && getTunnelPaths(tunnelOptions).includes(path.replace(/\/$/, ''));
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

  const reader = request.body?.getReader();
  const head = reader && (await readEnvelopeHeaderLine(reader));
  if (!reader || !head) {
    return new Response('Invalid envelope', { status: 400 });
  }

  const sentryIngestUrl = resolveIngestUrl(head.line, allowedDsns);
  if (typeof sentryIngestUrl !== 'string') {
    // Nothing past the header gets forwarded, so the runtime can stop receiving the body.
    reader.cancel().catch(() => undefined);

    return sentryIngestUrl;
  }

  try {
    // The forward is SDK plumbing, not app work, so it must not show up as a span.
    return await suppressTracing(() =>
      fetch(sentryIngestUrl, {
        method: 'POST',
        headers: forwardHeaders(request),
        // The body streams through without being buffered, so its size is left for Sentry to judge.
        body: prependToStream(head.read, reader),
        duplex: 'half',
      } as RequestInit),
    );
  } catch (error) {
    debug.error('Sentry tunnel: failed to forward envelope', error);
    return new Response('Failed to forward envelope to Sentry', { status: 500 });
  }
}

/**
 * Returns the Sentry ingest URL for an envelope header line, or the response that rejects it.
 */
function resolveIngestUrl(headerLine: Uint8Array, allowedDsns: Array<string>): string | Response {
  let envelopeHeader;
  try {
    [envelopeHeader] = parseEnvelope(headerLine);
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

  return getEnvelopeEndpointWithUrlEncodedAuth(dsnComponents);
}

/**
 * The header is a small JSON object, so a line longer than this is not an envelope.
 */
const MAX_ENVELOPE_HEADER_BYTES = 64 * 1024;

/**
 * Reads the request body only up to the end of the envelope header line.
 * Returns the line and every byte read so far, or `undefined` when no header line fits the limit.
 */
async function readEnvelopeHeaderLine(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ line: Uint8Array; read: Uint8Array } | undefined> {
  let read: Uint8Array = new Uint8Array(0);

  while (read.length <= MAX_ENVELOPE_HEADER_BYTES) {
    const { done, value } = await reader.read();
    if (done) {
      return read.length ? { line: read, read } : undefined;
    }

    const searchFrom = read.length;
    read = concatBytes(read, value);

    const newline = read.indexOf(0x0a, searchFrom);
    if (newline !== -1) {
      return { line: read.subarray(0, newline), read };
    }
  }

  await reader.cancel();

  return undefined;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a);
  merged.set(b, a.length);

  return merged;
}

function prependToStream(
  prefix: Uint8Array,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(prefix);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function forwardHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-sentry-envelope' };
  // Keeps the upload fixed-length where the runtime allows it (Node, Bun), instead of chunked.
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    headers['Content-Length'] = contentLength;
  }

  // Relay infers the user's IP and geo from the sender, which is now this server. Proxies and CDNs put the
  // visitor's IP in these headers, in the order Relay itself reads them.
  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for');
  if (clientIp) {
    headers['X-Sentry-Forwarded-For'] = clientIp;
  }

  return headers;
}

function resolveAllowedDsns(allowedDsns: Array<string> | undefined): Array<string> {
  if (allowedDsns) {
    return allowedDsns;
  }

  const dsn = getClient()?.getDsn();

  return dsn ? [dsnToString(dsn)] : [];
}

/**
 * Returns the path below `basePath`, or `undefined` for a path outside it, which the tunnel doesn't serve.
 */
function stripBasePath(pathname: string, basePath: string | undefined): string | undefined {
  const base = basePath?.replace(/\/$/, '');
  if (!base) {
    return pathname;
  }

  return pathname === base || pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : undefined;
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
    return [tunnelOptions.path.replace(/\/$/, '')];
  }

  return allowedDsns.map(dsn => getTunnelPath(dsn)).filter((path): path is string => !!path);
}
