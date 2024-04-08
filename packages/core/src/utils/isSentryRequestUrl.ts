import type { Client, DsnComponents } from '@sentry/types';

/**
 * Checks whether given url points to Sentry server
 *
 * @param url url to verify
 */
export function isSentryRequestUrl(url: string, client: Client | undefined): boolean {
  const dsn = client && client.getDsn();
  const tunnel = client && client.getOptions().tunnel;
  return checkDsn(url, dsn) || checkTunnel(url, tunnel);
}

function checkTunnel(url: string, tunnel: string | undefined): boolean {
  if (!tunnel) {
    return false;
  }

  return removeTrailingSlash(url) === removeTrailingSlash(tunnel);
}

function checkDsn(url: string, dsn: DsnComponents | undefined): boolean {
  return dsn ? url.includes(dsn.host) : false;
}

function removeTrailingSlash(str: string): string {
  return str[str.length - 1] === '/' ? str.slice(0, -1) : str;
}
