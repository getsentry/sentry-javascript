import { getGlobalObject, uuid4 } from '@sentry/utils';

import { Transaction } from '../transaction';
const sentryBrowserSessionKey = 'SENTRY_SESSION_UUID';

/**
 * Retrieves / creates a session dependent key for the current browser session.
 */
function getBrowserSessionID() {
  try {
    const global = getGlobalObject<Window>();
    if (global && global.sessionStorage) {
      let id = global.sessionStorage.getItem(sentryBrowserSessionKey);
      if (!id || id.length !== 16) {
        id = uuid4().substring(16);
        global.sessionStorage.setItem(sentryBrowserSessionKey, id);
      }

      return id;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Adds browser session data to the transaction.
 */
export function addBrowserSessionData(transaction: Transaction) {
  const id = getBrowserSessionID();
  if (id) {
    transaction.setTag('browser.session', id);
  }
}
