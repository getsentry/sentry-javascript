import type {
  Client,
  CustomSamplingContext,
  EventHint,
  Hub,
  Integration,
  IntegrationClass,
  Severity,
  SeverityLevel,
  TransactionContext,
} from '@sentry/types';

import {
  addBreadcrumb,
  captureEvent,
  configureScope,
  endSession,
  getClient,
  getCurrentScope,
  lastEventId,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startSession,
  withScope,
} from './api';
import { callExtensionMethod, getGlobalCarrier } from './globals';
import type { Scope } from './scope';
import type { SentryCarrier } from './types';

/** Ensure the global hub is our proxied hub. */
export function setupGlobalHub(): void {
  const carrier = getGlobalCarrier();
  carrier.hub = getCurrentHub();
}

/**
 * This is for legacy reasons, and returns a proxy object instead of a hub to be used.
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
    getClient,
    getScope: getCurrentScope,
    captureException: (exception: unknown, hint?: EventHint) => {
      return getCurrentScope().captureException(exception, hint);
    },
    captureMessage: (
      message: string,
      // eslint-disable-next-line deprecation/deprecation
      level?: Severity | SeverityLevel,
      hint?: EventHint,
    ) => {
      return getCurrentScope().captureMessage(message, level, hint);
    },
    captureEvent,
    lastEventId,
    addBreadcrumb,
    setUser,
    setTags,
    setTag,
    setExtra,
    setExtras,
    setContext,
    // eslint-disable-next-line deprecation/deprecation
    configureScope: configureScope,

    run(callback: (hub: Hub) => void): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return withScope(() => callback(this as any));
    },

    getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
      return getClient().getIntegration(integration);
    },

    traceHeaders(): { [key: string]: string } {
      return callExtensionMethod<{ [key: string]: string }>(this, 'traceHeaders');
    },

    startTransaction(
      _context: TransactionContext,
      _customSamplingContext?: CustomSamplingContext,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any {
      // eslint-disable-next-line no-console
      console.warn('startTransaction is a noop in @sentry/node-experimental. Use `startSpan` instead.');
      // We return an object here as hub.ts checks for the result of this
      // and renders a different warning if this is empty
      return {};
    },

    startSession,

    endSession,

    captureSession(endSession?: boolean): void {
      // both send the update and pull the session from the scope
      if (endSession) {
        return this.endSession();
      }

      // only send the update
      _sendSessionUpdate();
    },

    shouldSendDefaultPii(): boolean {
      const client = getClient();
      const options = client.getOptions();
      return Boolean(options.sendDefaultPii);
    },
  };
}

/**
 * Replaces the current main hub with the passed one on the global object
 *
 * @returns The old replaced hub
 */
export function makeMain(hub: Hub): Hub {
  // eslint-disable-next-line no-console
  console.warn('makeMain is a noop in @sentry/node-experimental. Use `setCurrentScope` instead.');
  return hub;
}

/**
 * Sends the current Session on the scope
 */
function _sendSessionUpdate(): void {
  const scope = getCurrentScope();
  const client = getClient();

  const session = scope.getSession();
  if (session && client.captureSession) {
    client.captureSession(session);
  }
}

/**
 * Set a mocked hub on the current carrier.
 */
export function setLegacyHubOnCarrier(carrier: SentryCarrier): boolean {
  carrier.hub = getCurrentHub();
  return true;
}
