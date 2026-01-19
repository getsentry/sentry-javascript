import type { DsnComponents } from '../types-hoist/dsn';
import { debug } from './debug-logger';
import { makeDsn } from './dsn';

export interface TunnelResult {
  status: number;
  body: string;
  contentType: string;
}

/**
 * Core Sentry tunnel handler - framework agnostic.
 *
 * Validates the envelope DSN against allowed DSNs and forwards to Sentry.
 *
 * @param body - Raw request body (Sentry envelope)
 * @param allowedDsnComponents - Pre-parsed array of allowed DsnComponents
 * @returns Promise resolving to status, body, and contentType
 */
export async function handleTunnelRequest(
  body: string,
  allowedDsnComponents: Array<DsnComponents>,
): Promise<TunnelResult> {
  if (allowedDsnComponents.length === 0) {
    return {
      status: 500,
      body: 'Tunnel not configured',
      contentType: 'text/plain',
    };
  }

  // Sentry envelope format: first line is JSON header with DSN
  const [headerLine] = body.split('\n');
  if (!headerLine) {
    return {
      status: 400,
      body: 'Invalid envelope: missing header',
      contentType: 'text/plain',
    };
  }

  let envelopeHeader: { dsn?: string };
  try {
    envelopeHeader = JSON.parse(headerLine);
  } catch {
    return {
      status: 400,
      body: 'Invalid envelope: malformed header JSON',
      contentType: 'text/plain',
    };
  }

  const dsn = envelopeHeader.dsn;
  if (!dsn) {
    return {
      status: 400,
      body: 'Invalid envelope: missing DSN',
      contentType: 'text/plain',
    };
  }

  const dsnComponents = makeDsn(dsn);
  if (!dsnComponents) {
    return {
      status: 400,
      body: 'Invalid DSN format',
      contentType: 'text/plain',
    };
  }

  // SECURITY: Validate that the envelope DSN matches one of the allowed DSNs
  // This prevents SSRF attacks where attackers send crafted envelopes
  // with malicious DSNs pointing to arbitrary hosts
  const isAllowed = allowedDsnComponents.some(
    allowed => allowed.host === dsnComponents.host && allowed.projectId === dsnComponents.projectId,
  );

  if (!isAllowed) {
    debug.warn(
      `Sentry tunnel: rejected request with unauthorized DSN (host: ${dsnComponents.host}, project: ${dsnComponents.projectId})`,
    );
    return {
      status: 403,
      body: 'DSN not allowed',
      contentType: 'text/plain',
    };
  }

  const sentryIngestUrl = `https://${dsnComponents.host}/api/${dsnComponents.projectId}/envelope/`;

  const response = await fetch(sentryIngestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
    },
    body,
  });

  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get('Content-Type') || 'text/plain',
  };
}
