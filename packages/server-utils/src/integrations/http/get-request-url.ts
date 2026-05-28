import type { HttpClientRequest, HttpRequestOptions } from './types';

/** Convert an outgoing request to request options. */
export function getRequestOptions(request: HttpClientRequest): HttpRequestOptions {
  // request.host may be 'hostname:port' when the caller passed
  // { host: 'hostname:port' } to http.request(). Split it so that
  // `hostname` is always port-free (matching the http.RequestOptions contract)
  // and the port is not lost when request.port is undefined.
  const hostWithPort = request.host || '';
  const portInHost = /^(.*):(\d+)$/.exec(hostWithPort);
  const hostname = portInHost ? portInHost[1] : hostWithPort;
  const port = request.port ?? (portInHost ? Number(portInHost[2]) : undefined);

  return {
    method: request.method,
    port,
    protocol: request.protocol,
    host: request.host,
    hostname,
    path: request.path,
    headers: request.getHeaders(),
  };
}

export function getRequestUrl(requestOptions: HttpRequestOptions): string {
  return String(getRequestUrlObject(requestOptions));
}

export function getRequestUrlObject(requestOptions: HttpRequestOptions): URL {
  const protocol = requestOptions.protocol || 'http:';
  const hostHeader = requestOptions.headers?.host && String(requestOptions.headers?.host);
  const hostname = hostHeader || requestOptions.hostname || requestOptions.host || '';
  // Don't log standard :80 (http) and :443 (https) ports to reduce the noise
  // Also don't add port if the hostname already includes a port
  const port =
    !requestOptions.port || requestOptions.port === 80 || requestOptions.port === 443 || /^(.*):(\d+)$/.test(hostname)
      ? ''
      : `:${requestOptions.port}`;
  const path = requestOptions.path ? requestOptions.path : '/';
  return new URL(path, `${protocol}//${hostname}${port}`);
}

/**
 * Build the full URL string from a Node.js ClientRequest.
 */
export function getRequestUrlFromClientRequest(request: HttpClientRequest): string {
  return String(getRequestUrl(getRequestOptions(request)));
}
