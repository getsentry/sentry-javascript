import type { RequestOptions } from 'http';

/** Build a full URL from request options. */
export function getRequestUrl(requestOptions: RequestOptions): string {
  const protocol = requestOptions.protocol || '';
  const hostname = requestOptions.hostname || requestOptions.host || '';
  // Don't log standard :80 (http) and :443 (https) ports to reduce the noise
  // Also don't add port if the hostname already includes a port
  const port =
    !requestOptions.port || requestOptions.port === 80 || requestOptions.port === 443 || /^(.*):(\d+)$/.test(hostname)
      ? ''
      : `:${requestOptions.port}`;
  const path = requestOptions.path ? requestOptions.path : '/';
  return `${protocol}//${hostname}${port}${path}`;
}
