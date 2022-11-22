// Vendored / modified from @sergiodxa/remix-utils
// https://github.com/sergiodxa/remix-utils/blob/02af80e12829a53696bfa8f3c2363975cf59f55e/src/server/get-client-ip-address.ts

import { isIP } from 'net';

/**
 * This is the list of headers, in order of preference, that will be used to
 * determine the client's IP address.
 */
const headerNames = [
  'X-Client-IP',
  'X-Forwarded-For',
  'Fly-Client-IP',
  'CF-Connecting-IP',
  'Fastly-Client-Ip',
  'True-Client-Ip',
  'X-Real-IP',
  'X-Cluster-Client-IP',
  'X-Forwarded',
  'Forwarded-For',
  'Forwarded',
];
/**
 * Get the IP address of the client sending a request.
 *
 * It receives a Request headers object and use it to get the
 * IP address from one of the following headers in order.
 *
 * - X-Client-IP
 * - X-Forwarded-For
 * - Fly-Client-IP
 * - CF-Connecting-IP
 * - Fastly-Client-Ip
 * - True-Client-Ip
 * - X-Real-IP
 * - X-Cluster-Client-IP
 * - X-Forwarded
 * - Forwarded-For
 * - Forwarded
 *
 * If the IP address is valid, it will be returned. Otherwise, null will be
 * returned.
 *
 * If the header values contains more than one IP address, the first valid one
 * will be returned.
 */
export function getClientIPAddress(headers: Headers): string | null {
  const ipAddress = headerNames
    .map((headerName: string) => {
      const value = headers.get(headerName);
      if (headerName === 'Forwarded') {
        return parseForwardedHeader(value);
      }
      if (!value?.includes(', ')) return value;
      return value.split(', ');
    })
    .reduce((acc: string[], val) => {
      if (!val) {
        return acc;
      }

      return acc.concat(val);
    }, [])
    .find(ip => {
      if (ip === null) return false;
      return isIP(ip);
    });

  return ipAddress ?? null;
}

function parseForwardedHeader(value: string | null): string | null {
  if (!value) return null;
  for (const part of value.split(';')) {
    if (part.startsWith('for=')) return part.slice(4);
    continue;
  }
  return null;
}
