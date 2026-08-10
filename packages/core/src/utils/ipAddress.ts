import type { Session, SessionAggregates } from '../types/session';

// By default, we want to infer the IP address, unless this is explicitly set to `null`
// We do this after all other processing is done
// If `ip_address` is explicitly set to `null` or a value, we leave it as is

/**
 * @internal
 */
export function addAutoIpAddressToSession(session: Session | SessionAggregates): void {
  if ('aggregates' in session) {
    if (session.attrs?.['ip_address'] === undefined) {
      session.attrs = {
        ...session.attrs,
        ip_address: '{{auto}}',
      };
    }
  } else {
    if (session.ipAddress === undefined) {
      session.ipAddress = '{{auto}}';
    }
  }
}
