import { debug } from './debug-logger';
import { makeDsn } from './dsn';
import { parseEnvelope } from './envelope';

export interface HandleTunnelRequestOptions {
  /** Incoming request containing the Sentry envelope as its body */
  request: Request;
  /** Pre-parsed array of allowed DSN strings */
  allowedDsns: Array<string>;
}

/**
 * Core Sentry tunnel handler - framework agnostic.
 *
 * Validates the envelope DSN against allowed DSNs and constructs a
 * forwarding request to the Sentry ingest endpoint.
 *
 * @returns A `Request` to forward to Sentry on success, or a `Response` with an error.
 */
export async function createTunnelRequest(options: HandleTunnelRequestOptions): Promise<Request | Response> {
  const { request, allowedDsns } = options;

  if (allowedDsns.length === 0) {
    return new Response('Tunnel not configured', { status: 500 });
  }

  const body = new Uint8Array(await request.arrayBuffer());

  const [envelopeHeader] = parseEnvelope(body);
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

  const sentryIngestUrl = `https://${dsnComponents.host}/api/${dsnComponents.projectId}/envelope/`;

  return new Request(sentryIngestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
    },
    body,
  });
}
