import { getEnvelopeEndpointWithUrlEncodedAuth } from '../api';
import { getClient } from '../currentScopes';
import { suppressTracing } from '../tracing/trace';
import { debug } from './debug-logger';
import { makeDsn } from './dsn';
import type { ServerTunnelOptions } from '../types/options';
import { matchesTunnel, resolveAllowedDsns, resolveTunnelMatch } from './tunnel';

/**
 * Options for {@link handleTunnelRequest}.
 */
export interface HandleTunnelRequestOptions {
  /**
   * The incoming request.
   *
   * @deprecated Pass the request as the first argument of `handleTunnelRequest` instead.
   */
  request: Request;
  /**
   * DSNs whose envelopes may be forwarded, in addition to the DSN of the active client. Defaults to the DSNs
   * `serveTunnelIntegration` allows.
   */
  allowedDsns?: Array<string>;
}

/**
 * The options of {@link handleTunnelRequest} that take the request as an argument.
 */
type TunnelForwardOptions = Omit<HandleTunnelRequestOptions, 'request'>;

/**
 * The parts of Node's `IncomingMessage` the tunnel reads.
 */
interface NodeTunnelRequest extends AsyncIterable<Uint8Array | string> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * The parts of Node's `ServerResponse` the tunnel writes.
 */
interface NodeTunnelResponse {
  writeHead(statusCode: number, headers?: Record<string, string>): unknown;
  end(chunk: Uint8Array): unknown;
}

/**
 * Forwards a tunnel request to Sentry, if its envelope's DSN is the active client's or one of `allowedDsns`.
 * It doesn't check the path: route the tunnel requests to it, e.g. on `getTunnelPath(dsn)`.
 *
 * @returns Sentry's response, or the response rejecting the request.
 */
export function handleTunnelRequest(request: Request, options?: TunnelForwardOptions): Promise<Response>;
/**
 * Forwards a tunnel request from a Node server, like Express or `node:http`, and writes the answer to `response`.
 * Mount it before body parsers, which would read the envelope first.
 */
export function handleTunnelRequest(
  request: NodeTunnelRequest,
  response: NodeTunnelResponse,
  options?: TunnelForwardOptions,
): Promise<void>;
/**
 * The released form, kept until v12.
 *
 * @deprecated Pass the request as the first argument instead: `handleTunnelRequest(request, options)`.
 */
export function handleTunnelRequest(options: HandleTunnelRequestOptions): Promise<Response>;
export function handleTunnelRequest(
  requestOrOptions: Request | NodeTunnelRequest | HandleTunnelRequestOptions,
  responseOrOptions?: NodeTunnelResponse | TunnelForwardOptions,
  nodeOptions?: TunnelForwardOptions,
): Promise<Response | void> {
  if (isNodeTunnelResponse(responseOrOptions)) {
    const nodeResponse = responseOrOptions;

    return forwardTunnelRequest(
      toFetchRequest(requestOrOptions as NodeTunnelRequest),
      getAllowedDsns(nodeOptions),
    ).then(fetchResponse => writeNodeResponse(nodeResponse, fetchResponse));
  }

  // The released `handleTunnelRequest({ request })` form. A `Request` has a `method`, the options object doesn't.
  const isLegacyCall = 'request' in requestOrOptions && !('method' in requestOrOptions);
  // oxlint-disable-next-line typescript/no-deprecated -- reads the released form to keep it working
  const request = isLegacyCall ? requestOrOptions.request : (requestOrOptions as Request);
  const options = isLegacyCall ? requestOrOptions : responseOrOptions;

  return forwardTunnelRequest(request, getAllowedDsns(options));
}

/**
 * Forwards the request if it's a POST to the managed tunnel, otherwise returns `undefined` for the app to handle. The
 * tunnel comes from `options`, else from `serveTunnelIntegration`, else it's the path of the active client's own DSN.
 */
export function handleTunnelRequestIfMatched(
  request: Request,
  options?: ServerTunnelOptions,
): Promise<Response> | undefined;
/**
 * Forwards a tunnel request from a Node server, like Express or `node:http`, and writes the answer to `response`.
 * Returns `undefined` for anything else, so the app can handle it.
 */
export function handleTunnelRequestIfMatched(
  request: NodeTunnelRequest,
  response: NodeTunnelResponse,
  options?: ServerTunnelOptions,
): Promise<void> | undefined;
export function handleTunnelRequestIfMatched(
  request: Request | NodeTunnelRequest,
  responseOrOptions?: NodeTunnelResponse | ServerTunnelOptions,
  nodeOptions?: ServerTunnelOptions,
): Promise<Response | void> | undefined {
  const response = isNodeTunnelResponse(responseOrOptions) ? responseOrOptions : undefined;
  const tunnel = resolveTunnelMatch(response ? nodeOptions : (responseOrOptions as ServerTunnelOptions | undefined));
  if (!tunnel.allowedDsns.length || !matchesTunnel(request, tunnel)) {
    return undefined;
  }

  if (!response) {
    return forwardTunnelRequest(request as Request, tunnel.allowedDsns);
  }

  return forwardTunnelRequest(toFetchRequest(request as NodeTunnelRequest), tunnel.allowedDsns).then(fetchResponse =>
    writeNodeResponse(response, fetchResponse),
  );
}

/**
 * `allowedDsns` plus the server's own DSN. Without `allowedDsns`, the DSNs `serveTunnelIntegration` allows, so its
 * options apply here too.
 */
function getAllowedDsns(options: TunnelForwardOptions | undefined): string[] {
  return options?.allowedDsns
    ? resolveAllowedDsns(options.allowedDsns, getClient()?.getDsn())
    : resolveTunnelMatch().allowedDsns;
}

/**
 * The headers of Sentry's answer the browser SDK reads. The rest describe the connection to Sentry, which HTTP/2
 * rejects.
 */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-sentry-rate-limits'];

function isNodeTunnelResponse(value: unknown): value is NodeTunnelResponse {
  return typeof (value as NodeTunnelResponse | undefined)?.writeHead === 'function';
}

function toFetchRequest(request: NodeTunnelRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    // HTTP/2 pseudo-headers like `:authority` aren't valid fetch header names.
    if (value !== undefined && !name.startsWith(':')) {
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
  }
  const iterator = request[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  // Not `ReadableStream.from`, which Bun 1.3 lacks.
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }

      controller.enqueue(typeof value === 'string' ? encoder.encode(value) : value);
    },
    // Node only reads the rest of a body nobody started reading, and unread bytes stall a keep-alive connection.
    async cancel() {
      while (!(await iterator.next()).done) {
        // Drain.
      }
    },
  });

  // The forward reads only the headers and the body. A URL built from the request's `Host` would throw on one
  // Node accepts, like `a b`.
  return new Request('http://localhost/', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit);
}

async function writeNodeResponse(response: NodeTunnelResponse, fetchResponse: Response): Promise<void> {
  // Read before writing, so an answer from Sentry that breaks off still ends the browser's request.
  const body = await fetchResponse.arrayBuffer().catch(() => undefined);
  if (!body) {
    response.writeHead(500);
    response.end(new Uint8Array());
    return;
  }

  const responseHeaders: Record<string, string> = {};
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = fetchResponse.headers.get(name);
    if (value) {
      responseHeaders[name] = value;
    }
  }
  response.writeHead(fetchResponse.status, responseHeaders);
  response.end(new Uint8Array(body));
}

function withDecodedBodyHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  // `fetch` already decoded the body, so its original encoding and length no longer describe it.
  headers.delete('content-encoding');
  headers.delete('content-length');

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Forwards an envelope to Sentry if its DSN is one of `allowedDsns`, otherwise answers with the rejecting response.
 */
export async function forwardTunnelRequest(request: Request, allowedDsns: Array<string>): Promise<Response> {
  return withDecodedBodyHeaders(await forwardEnvelope(request, allowedDsns));
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
  let envelopeHeader: { dsn?: unknown } | null;
  try {
    envelopeHeader = JSON.parse(new TextDecoder().decode(headerLine));
  } catch {
    return new Response('Invalid envelope', { status: 400 });
  }

  if (!envelopeHeader) {
    return new Response('Invalid envelope: missing header', { status: 400 });
  }

  const dsn = envelopeHeader.dsn;
  if (!dsn || typeof dsn !== 'string') {
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
 * Client headers Relay reads from a browser's own request: the user agent and its client hints to tell the browser,
 * and `Origin` or `Referer` for the project's allowed domains check, which Relay skips without them.
 */
const FORWARDED_CLIENT_HEADERS = [
  'user-agent',
  'sec-ch-ua',
  'sec-ch-ua-model',
  'sec-ch-ua-platform',
  'sec-ch-ua-platform-version',
  'origin',
  'referer',
];

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

  for (const name of FORWARDED_CLIENT_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  }

  return headers;
}
