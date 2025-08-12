import type { Client } from '../client';
import type { DsnComponents } from '../types-hoist/dsn';

/**
 * Checks whether given url points to Sentry server
 *
 * @param url url to verify
 */
export function isSentryRequestUrl(url: string, client: Client | undefined): boolean {
  const dsn = client?.getDsn();
  const tunnel = client?.getOptions().tunnel;
  return checkDsn(url, dsn) || checkTunnel(url, tunnel);
}

function checkTunnel(url: string, tunnel: string | undefined): boolean {
  if (!tunnel) {
    return false;
  }

  return removeTrailingSlash(url) === removeTrailingSlash(tunnel);
}

function checkDsn(url: string, dsn: DsnComponents | undefined): boolean {
  // Requests to Sentry's ingest endpoint must have a `sentry_key` in the query string
  // This is equivalent to the public_key which is required in the DSN
  // see https://develop.sentry.dev/sdk/overview/#parsing-the-dsn
  return dsn ? url.includes(dsn.host) && !!url.match(/sentry_key/) : false;
}

function removeTrailingSlash(str: string): string {
  return str[str.length - 1] === '/' ? str.slice(0, -1) : str;
}
