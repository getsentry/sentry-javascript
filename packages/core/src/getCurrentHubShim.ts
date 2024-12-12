import { addBreadcrumb } from './breadcrumbs';
import { getClient, getCurrentScope, getIsolationScope, withScope } from './currentScopes';
import {
  captureEvent,
  endSession,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startSession,
} from './exports';
import type { Client, EventHint, Hub, Integration, IntegrationClass, SeverityLevel } from './types-hoist';

/**
 * This is for legacy reasons, and returns a proxy object instead of a hub to be used.
 *
 * @deprecated Use the methods directly from the top level Sentry API (e.g. `Sentry.withScope`)
 * For more information see our migration guide for
 * [replacing `getCurrentHub` and `Hub`](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md#deprecate-hub)
 * usage
 */
// eslint-disable-next-line deprecation/deprecation
export function getCurrentHubShim(): Hub {
  return {
    bindClient(client: Client): void {
      const scope = getCurrentScope();
      scope.setClient(client);
    },

    withScope,
    getClient: <C extends Client>() => getClient() as C | undefined,
    getScope: getCurrentScope,
    getIsolationScope,
    captureException: (exception: unknown, hint?: EventHint) => {
      return getCurrentScope().captureException(exception, hint);
    },
    captureMessage: (message: string, level?: SeverityLevel, hint?: EventHint) => {
      return getCurrentScope().captureMessage(message, level, hint);
    },
    captureEvent,
    addBreadcrumb,
    setUser,
    setTags,
    setTag,
    setExtra,
    setExtras,
    setContext,

    getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
      const client = getClient();
      return (client && client.getIntegrationByName<T>(integration.id)) || null;
    },

    startSession,
    endSession,
    captureSession(end?: boolean): void {
      // both send the update and pull the session from the scope
      if (end) {
        return endSession();
      }

      // only send the update
      _sendSessionUpdate();
    },
  };
}

/**
 * Returns the default hub instance.
 *
 * If a hub is already registered in the global carrier but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered hub will be returned.
 *
 * @deprecated Use the respective replacement method directly instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const getCurrentHub = getCurrentHubShim;

/**
 * Sends the current Session on the scope
 */
function _sendSessionUpdate(): void {
  const scope = getCurrentScope();
  const client = getClient();

  const session = scope.getSession();
  if (client && session) {
    client.captureSession(session);
  }
}
