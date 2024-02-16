import type {
  Client,
  CustomSamplingContext,
  EventHint,
  Hub,
  Integration,
  IntegrationClass,
  Scope,
  SeverityLevel,
  TransactionContext,
} from '@sentry/types';

import {
  addBreadcrumb,
  captureEvent,
  endSession,
  getClient,
  getCurrentScope,
  getIsolationScope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startSession,
  withScope,
} from '@sentry/core';

/**
 * This is for legacy reasons, and returns a proxy object instead of a hub to be used.
 * @deprecated Use the methods directly.
 */
export function getCurrentHub(): Hub {
  return {
    isOlderThan(_version: number): boolean {
      return false;
    },

    bindClient(client: Client): void {
      const scope = getCurrentScope();
      scope.setClient(client);
    },

    pushScope(): Scope {
      // TODO: This does not work and is actually deprecated
      return getCurrentScope();
    },

    popScope(): boolean {
      // TODO: This does not work and is actually deprecated
      return false;
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

    run(callback: (hub: Hub) => void): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return withScope(() => callback(this as any));
    },

    getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
      // eslint-disable-next-line deprecation/deprecation
      return getClient()?.getIntegration(integration) || null;
    },

    traceHeaders(): { [key: string]: string } {
      // TODO: Do we need this??
      return {};
    },

    startTransaction(
      _context: TransactionContext,
      _customSamplingContext?: CustomSamplingContext,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any {
      // eslint-disable-next-line no-console
      console.warn('startTransaction is a noop in @sentry/opentelemetry. Use `startSpan` instead.');
      // We return an object here as hub.ts checks for the result of this
      // and renders a different warning if this is empty
      return {};
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

    shouldSendDefaultPii(): boolean {
      const client = getClient();
      return Boolean(client ? client.getOptions().sendDefaultPii : false);
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
