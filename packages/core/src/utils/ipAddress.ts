import type { Session, SessionAggregates } from '../types-hoist/session';
import type { User } from '../types-hoist/user';

// By default, we want to infer the IP address, unless this is explicitly set to `null`
// We do this after all other processing is done
// If `ip_address` is explicitly set to `null` or a value, we leave it as is

/**
 * @internal
 * @deprecated -- set ip inferral via via SDK metadata options on client instead.
 */
export function addAutoIpAddressToUser(objWithMaybeUser: { user?: User | null }): void {
  if (objWithMaybeUser.user?.ip_address === undefined) {
    objWithMaybeUser.user = {
      ...objWithMaybeUser.user,
      ip_address: '{{auto}}',
    };
  }
}

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
