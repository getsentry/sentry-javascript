import { getEnvelopeEndpointWithUrlEncodedAuth } from '../api';
import type { Client } from '../client';
import { getClient } from '../currentScopes';
import { suppressTracing } from '../tracing/trace';
import { URL_PATH } from '@sentry/conventions/attributes';
import type { DsnComponents, DsnLike } from '../types/dsn';
import type { IgnoreSpanFilter, TunnelOptions } from '../types/options';
import { escapeStringForRegex } from '../vendor/escapeStringForRegex';
import { debug } from './debug-logger';
import { dsnToString, makeDsn } from './dsn';
import { parseUrl } from './url';

/**
 * A server client's tunnel paths and allowed DSNs, computed once per client.
 */
interface ServedTunnel {
  paths: string[];
  allowedDsns: string[];
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
 * Bounds what one tunnel request may send. SDK envelopes stay far below it.
 */
export const MAX_TUNNEL_BODY_SIZE = 20 * 1024 * 1024;

export interface HandleTunnelRequestOptions {
  /** Incoming request containing the Sentry envelope as its body */
  request: Request;
  /** DSNs whose envelopes may be forwarded, in addition to the DSN of the active client. */
  allowedDsns?: Array<string>;
}

/**
 * Splits a server `tunnel` option: a URL stays the transport tunnel, anything else enables the managed tunnel.
 */
export function resolveServerTunnelOption(tunnel: string | true | TunnelOptions | undefined): {
  tunnel: string | undefined;
  _managedTunnel?: TunnelOptions;
} {
  if (!tunnel) {
    return { tunnel };
  }

  if (typeof tunnel === 'string') {
    // A relative path can't be a transport URL on the server, so it's the path to serve.
    return tunnel.startsWith('/') ? { tunnel: undefined, _managedTunnel: { path: tunnel } } : { tunnel };
  }

  return { tunnel: undefined, _managedTunnel: tunnel === true ? {} : tunnel };
}

/**
 * Fills in framework defaults (like the base path) for a managed tunnel. User options win; URLs pass through.
 */
export function applyTunnelDefaults(
  tunnel: string | true | TunnelOptions | undefined,
  defaults: TunnelOptions | undefined,
): string | true | TunnelOptions | undefined {
  if (!tunnel || !defaults || !Object.keys(defaults).length) {
    return tunnel;
  }

  if (typeof tunnel === 'string') {
    return tunnel.startsWith('/') ? withPathBelowBasePath({ ...defaults, path: tunnel }) : tunnel;
  }

  return withPathBelowBasePath({ ...defaults, ...(tunnel === true ? {} : tunnel) });
}

/**
 * Returns the same-origin tunnel path for a DSN, e.g. `/k3x9q2a`. Browser and server derive it independently,
 * and as a hash it gives ad-blocker filter lists nothing to match.
 */
export function getTunnelPath(dsn: DsnLike): string | undefined {
  const components = makeDsn(dsn);

  return components ? `/${fnv1a(dsnToString(components)).toString(36)}` : undefined;
}

/**
 * The parts of a request the tunnel match reads. Satisfied by a fetch `Request` and Node's `IncomingMessage`.
 */
export interface TunnelRequestLike {
  method?: string;
  /** Absolute URL or path with query, e.g. Node's `IncomingMessage.url`. */
  url?: string;
  headers?: Headers | Record<string, string | string[] | undefined>;
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
export function resolveTunnelPaths(tunnelOptions: TunnelOptions, allowedDsns: Array<string>): string[] {
  if (tunnelOptions.path) {
    return [tunnelOptions.path.replace(/\/$/, '')];
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
 * Returns true if the request targets the active server client's managed tunnel.
 */
export function isTunnelRequest(request: TunnelRequestLike): boolean {
  if (request.method !== 'POST' || !request.url) {
    return false;
  }

  const tunnelOptions = getClient()?.getOptions()._managedTunnel;
  if (!tunnelOptions) {
    return false;
  }

  const path = stripBasePath(parseUrl(request.url).path || '/', tunnelOptions.basePath);

  return path !== undefined && getTunnelPaths().includes(path.replace(/\/$/, ''));
}

/**
 * Forwards the request if it targets the managed tunnel, otherwise returns `undefined` for the app to handle.
 */
export function handleTunnelRequestIfMatched(request: Request): Promise<Response> | undefined {
  const allowedDsns = getServedTunnel()?.allowedDsns;
  // Without a DSN to forward to, the app's 404 makes the browser send directly.
  if (!allowedDsns?.length || !isTunnelRequest(request)) {
    return undefined;
  }

  return forwardTunnelRequest(request, allowedDsns);
}

/**
 * Core Sentry tunnel handler - framework agnostic.
 *
 * Validates the envelope DSN against allowed DSNs, then forwards the
 * envelope to the Sentry ingest endpoint.
 *
 * @returns A `Response` — either the upstream Sentry response on success, or an error response.
 */
export function handleTunnelRequest(options: HandleTunnelRequestOptions): Promise<Response> {
  return forwardTunnelRequest(options.request, resolveAllowedDsns(options.allowedDsns, getClient()?.getDsn()));
}

/**
 * Marks responses from the tunnel handler, so the browser can tell them from e.g. a static host's `index.html`.
 */
export const TUNNEL_RESPONSE_HEADER = 'X-Sentry-Tunnel';

function markTunnelResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  // `fetch` already decoded the body, so its original encoding and length no longer describe it.
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.set(TUNNEL_RESPONSE_HEADER, '1');

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function forwardTunnelRequest(request: Request, allowedDsns: Array<string>): Promise<Response> {
  return markTunnelResponse(await forwardEnvelope(request, allowedDsns));
}

async function forwardEnvelope(request: Request, allowedDsns: Array<string>): Promise<Response> {
  if (allowedDsns.length === 0) {
    return new Response('Tunnel not configured', { status: 500 });
  }

  // The HTTP server ends the body at `Content-Length`, so the header bounds what the forward streams.
  const contentLength = Number(request.headers.get('content-length'));
  if (!contentLength) {
    return new Response('Length required', { status: 411 });
  }
  if (contentLength > MAX_TUNNEL_BODY_SIZE) {
    return new Response('Envelope too large', { status: 413 });
  }

  const reader = request.body?.getReader();
  // A client aborting mid-upload makes the read throw.
  const head = reader && (await readEnvelopeHeaderLine(reader).catch(() => undefined));
  if (!reader || !head) {
    return new Response('Invalid envelope', { status: 400 });
  }

  const sentryIngestUrl = resolveIngestUrl(head.line, allowedDsns);
  if (typeof sentryIngestUrl !== 'string') {
    reader.cancel().catch(() => undefined);

    return sentryIngestUrl;
  }

  try {
    return await suppressTracing(() =>
      fetch(sentryIngestUrl, {
        method: 'POST',
        headers: forwardHeaders(request),
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
 * Returns the ingest URL for an envelope header line, or the rejecting response.
 */
function resolveIngestUrl(headerLine: Uint8Array, allowedDsns: Array<string>): string | Response {
  let envelopeHeader: { dsn?: string } | null;
  try {
    envelopeHeader = JSON.parse(new TextDecoder().decode(headerLine));
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
 * A header line longer than this is not an envelope.
 */
const MAX_ENVELOPE_HEADER_BYTES = 64 * 1024;

/**
 * Reads the body up to the envelope header line. Returns the line and every byte read, or `undefined`.
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
  // No `Content-Length`: some runtimes reject it on a streamed body (Next.js edge in dev).
  const headers: Record<string, string> = { 'Content-Type': 'application/x-sentry-envelope' };

  // Relay would otherwise attribute the server's IP. Same precedence Relay uses.
  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for');
  if (clientIp) {
    headers['X-Sentry-Forwarded-For'] = clientIp;
  }

  return headers;
}

/**
 * `allowedDsns` plus the server's own DSN, which is always allowed.
 */
export function resolveAllowedDsns(
  allowedDsns: Array<string> | undefined,
  ownDsn: DsnComponents | undefined,
): Array<string> {
  const dsns = new Set(allowedDsns);
  if (ownDsn) {
    dsns.add(dsnToString(ownDsn));
  }

  return [...dsns];
}

/**
 * Makes a fixed `path` relative to `basePath`, so one written with the base path isn't served under it twice.
 */
export function withPathBelowBasePath(tunnelOptions: TunnelOptions): TunnelOptions {
  const path = tunnelOptions.path && stripBasePath(tunnelOptions.path, tunnelOptions.basePath);

  return path ? { ...tunnelOptions, path } : tunnelOptions;
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
 * 32-bit FNV-1a: synchronous (the browser needs it in `init`) and dependency free. Changing it breaks mixed SDK
 * versions, since browser and server compute the path separately.
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
