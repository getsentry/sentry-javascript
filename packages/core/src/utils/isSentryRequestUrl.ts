import type { Client, DsnComponents } from '@sentry/types';

/**
 * Checks whether given url points to Sentry server
 *
 * @param url url to verify
 */
export function isSentryRequestUrl(url: string, client: Client | undefined): boolean {
  const dsn = client && client.getDsn();
  return checkDsn(url, dsn);
}

function checkDsn(url: string, dsn: DsnComponents | undefined): boolean {
  return dsn ? url.includes(dsn.host) : false;
}
