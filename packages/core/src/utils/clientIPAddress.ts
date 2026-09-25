import { getClientIPAddress as getBareClientIPAddress, ipHeaderNames } from '../vendor/getIpAddress';

const IP_HEADER_NAMES = new Set(ipHeaderNames.map(name => name.toLowerCase()));

/**
 * Get the IP address of the client sending a request, from its forwarding headers.
 *
 * The vendored implementation accepts only bare addresses, so the header values are
 * normalized first. Some proxies (for example Azure App Service) add the client port,
 * and RFC 7239 allows a quoted `Forwarded` value and any case for `for=`.
 */
export function getClientIPAddress(headers: { [key: string]: string | string[] | undefined }): string | null {
  const normalized: { [key: string]: string } = {};

  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if (value === undefined || !IP_HEADER_NAMES.has(name)) {
      continue;
    }

    const joined = Array.isArray(value) ? value.join(',') : value;
    normalized[key] =
      name === 'forwarded'
        ? normalizeForwardedHeader(joined)
        : joined
            .split(',')
            .map(ip => stripPort(ip.trim()))
            .join(',');
  }

  return getBareClientIPAddress(normalized);
}

// The vendored parser reads the first `for=` pair only, so only that pair is kept.
function normalizeForwardedHeader(value: string): string {
  const forPair = value
    .split(/[,;]/)
    .map(part => part.trim())
    .find(part => part.slice(0, 4).toLowerCase() === 'for=');

  return forPair ? `for=${stripPort(forPair.slice(4).replace(/^"(.*)"$/, '$1'))}` : '';
}

// `203.0.113.7:4711` -> `203.0.113.7`, `[2001:db8::1]:4711` -> `2001:db8::1`
function stripPort(ip: string): string {
  return ip.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1] ?? ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)?.[1] ?? ip;
}
