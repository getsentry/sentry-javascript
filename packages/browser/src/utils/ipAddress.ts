import type { Session, SessionAggregates, User } from '@sentry/core';

/**
 * @internal
 * By default, we want to infer the IP address, unless this is explicitly set to `null`
 * We do this after all other processing is done
 * If `ip_address` is explicitly set to `null` or a value, we leave it as is
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
 * Adds the `ip_address` attribute to the session if it is not explicitly set to `null` or a value.
 * @param session The session to add the `ip_address` attribute to.
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
    addAutoIpAddressToUser(session);
  }
}
