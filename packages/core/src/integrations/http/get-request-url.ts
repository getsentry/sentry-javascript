import type { HttpClientRequest } from './types';

/**
 * Build the full URL string from a Node.js ClientRequest.
 * Mirrors the `getClientRequestUrl` helper in node-core.
 */
export function getRequestUrl(request: HttpClientRequest): string {
  const hostname = request.getHeader('host') || request.host;
  const protocol = request.protocol ?? 'http:';
  const path = request.path ?? '/';
  return `${protocol}//${hostname}${path}`;
}
