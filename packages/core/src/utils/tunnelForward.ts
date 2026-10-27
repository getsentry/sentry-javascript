import { getEnvelopeEndpointWithUrlEncodedAuth } from '../api';
import { getClient } from '../currentScopes';
import { suppressTracing } from '../tracing/trace';
import { debug } from './debug-logger';
import { makeDsn } from './dsn';
import { resolveAllowedDsns } from './tunnel';

export interface HandleTunnelRequestOptions {
  /** Incoming request containing the Sentry envelope as its body */
  request: Request;
  /** DSNs whose envelopes may be forwarded, in addition to the DSN of the active client. */
  allowedDsns?: Array<string>;
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
