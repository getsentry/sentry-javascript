import type { Client, EventHint, Hub, Integration, IntegrationClass, SeverityLevel } from '@sentry/types';
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

/**
 * This is for legacy reasons, and returns a proxy object instead of a hub to be used.
 *
 * @deprecated Use the methods directly.
 */
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

    captureSession(endSession?: boolean): void {
      // both send the update and pull the session from the scope
      if (endSession) {
        // eslint-disable-next-line deprecation/deprecation
        return this.endSession();
      }

      // only send the update
      _sendSessionUpdate();
    },
  };
}

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
