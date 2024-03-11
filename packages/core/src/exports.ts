import type {
  CaptureContext,
  CheckIn,
  Event,
  EventHint,
  EventProcessor,
  Extra,
  Extras,
  FinishedCheckIn,
  MonitorConfig,
  Primitive,
  Session,
  SessionContext,
  SeverityLevel,
  User,
} from '@sentry/types';
import { GLOBAL_OBJ, isThenable, logger, timestampInSeconds, uuid4 } from '@sentry/utils';

import { DEFAULT_ENVIRONMENT } from './constants';
import { getClient, getCurrentScope, getIsolationScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import type { Hub } from './hub';
import { closeSession, makeSession, updateSession } from './session';
import type { ExclusiveEventHintOrCaptureContext } from './utils/prepareEvent';
import { parseEventHintOrCaptureContext } from './utils/prepareEvent';

/**
 * Captures an exception event and sends it to Sentry.
 *
 * @param exception The exception to capture.
 * @param hint Optional additional data to attach to the Sentry event.
 * @returns the id of the captured Sentry event.
 */
export function captureException(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exception: any,
  hint?: ExclusiveEventHintOrCaptureContext,
): string {
  return getCurrentScope().captureException(exception, parseEventHintOrCaptureContext(hint));
}

/**
 * Captures a message event and sends it to Sentry.
 *
 * @param exception The exception to capture.
 * @param captureContext Define the level of the message or pass in additional data to attach to the message.
 * @returns the id of the captured message.
 */
export function captureMessage(message: string, captureContext?: CaptureContext | SeverityLevel): string {
  // This is necessary to provide explicit scopes upgrade, without changing the original
  // arity of the `captureMessage(message, level)` method.
  const level = typeof captureContext === 'string' ? captureContext : undefined;
  const context = typeof captureContext !== 'string' ? { captureContext } : undefined;
  return getCurrentScope().captureMessage(message, level, context);
}

/**
 * Captures a manually created event and sends it to Sentry.
 *
 * @param exception The event to send to Sentry.
 * @param hint Optional additional data to attach to the Sentry event.
 * @returns the id of the captured event.
 */
export function captureEvent(event: Event, hint?: EventHint): string {
  return getCurrentScope().captureEvent(event, hint);
}

/**
 * Sets context data with the given name.
 * @param name of the context
 * @param context Any kind of data. This data will be normalized.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setContext(name: string, context: { [key: string]: any } | null): ReturnType<Hub['setContext']> {
  getIsolationScope().setContext(name, context);
}

/**
 * Set an object that will be merged sent as extra data with the event.
 * @param extras Extras object to merge into current context.
 */
export function setExtras(extras: Extras): ReturnType<Hub['setExtras']> {
  getIsolationScope().setExtras(extras);
}

/**
 * Set key:value that will be sent as extra data with the event.
 * @param key String of extra
 * @param extra Any kind of data. This data will be normalized.
 */
export function setExtra(key: string, extra: Extra): ReturnType<Hub['setExtra']> {
  getIsolationScope().setExtra(key, extra);
}

/**
 * Set an object that will be merged sent as tags data with the event.
 * @param tags Tags context object to merge into current context.
 */
export function setTags(tags: { [key: string]: Primitive }): ReturnType<Hub['setTags']> {
  getIsolationScope().setTags(tags);
}

/**
 * Set key:value that will be sent as tags data with the event.
 *
 * Can also be used to unset a tag, by passing `undefined`.
 *
 * @param key String key of tag
 * @param value Value of tag
 */
export function setTag(key: string, value: Primitive): ReturnType<Hub['setTag']> {
  getIsolationScope().setTag(key, value);
}

/**
 * Updates user context information for future events.
 *
 * @param user User context object to be set in the current context. Pass `null` to unset the user.
 */
export function setUser(user: User | null): ReturnType<Hub['setUser']> {
  getIsolationScope().setUser(user);
}

/**
 * Create a cron monitor check in and send it to Sentry.
 *
 * @param checkIn An object that describes a check in.
 * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
 * to create a monitor automatically when sending a check in.
 */
export function captureCheckIn(checkIn: CheckIn, upsertMonitorConfig?: MonitorConfig): string {
  const scope = getCurrentScope();
  const client = getClient();
  if (!client) {
    DEBUG_BUILD && logger.warn('Cannot capture check-in. No client defined.');
  } else if (!client.captureCheckIn) {
    DEBUG_BUILD && logger.warn('Cannot capture check-in. Client does not support sending check-ins.');
  } else {
    return client.captureCheckIn(checkIn, upsertMonitorConfig, scope);
  }

  return uuid4();
}

/**
 * Wraps a callback with a cron monitor check in. The check in will be sent to Sentry when the callback finishes.
 *
 * @param monitorSlug The distinct slug of the monitor.
 * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
 * to create a monitor automatically when sending a check in.
 */
export function withMonitor<T>(
  monitorSlug: CheckIn['monitorSlug'],
  callback: () => T,
  upsertMonitorConfig?: MonitorConfig,
): T {
  const checkInId = captureCheckIn({ monitorSlug, status: 'in_progress' }, upsertMonitorConfig);
  const now = timestampInSeconds();

  function finishCheckIn(status: FinishedCheckIn['status']): void {
    captureCheckIn({ monitorSlug, status, checkInId, duration: timestampInSeconds() - now });
  }

  let maybePromiseResult: T;
  try {
    maybePromiseResult = callback();
  } catch (e) {
    finishCheckIn('error');
    throw e;
  }

  if (isThenable(maybePromiseResult)) {
    Promise.resolve(maybePromiseResult).then(
      () => {
        finishCheckIn('ok');
      },
      () => {
        finishCheckIn('error');
      },
    );
  } else {
    finishCheckIn('ok');
  }

  return maybePromiseResult;
}

/**
 * Call `flush()` on the current client, if there is one. See {@link Client.flush}.
 *
 * @param timeout Maximum time in ms the client should wait to flush its event queue. Omitting this parameter will cause
 * the client to wait until all events are sent before resolving the promise.
 * @returns A promise which resolves to `true` if the queue successfully drains before the timeout, or `false` if it
 * doesn't (or if there's no client defined).
 */
export async function flush(timeout?: number): Promise<boolean> {
  const client = getClient();
  if (client) {
    return client.flush(timeout);
  }
  DEBUG_BUILD && logger.warn('Cannot flush events. No client defined.');
  return Promise.resolve(false);
}

/**
 * Call `close()` on the current client, if there is one. See {@link Client.close}.
 *
 * @param timeout Maximum time in ms the client should wait to flush its event queue before shutting down. Omitting this
 * parameter will cause the client to wait until all events are sent before disabling itself.
 * @returns A promise which resolves to `true` if the queue successfully drains before the timeout, or `false` if it
 * doesn't (or if there's no client defined).
 */
export async function close(timeout?: number): Promise<boolean> {
  const client = getClient();
  if (client) {
    return client.close(timeout);
  }
  DEBUG_BUILD && logger.warn('Cannot flush events and disable SDK. No client defined.');
  return Promise.resolve(false);
}

/**
 * Returns true if Sentry has been properly initialized.
 */
export function isInitialized(): boolean {
  return !!getClient();
}

/**
 * Add an event processor.
 * This will be added to the current isolation scope, ensuring any event that is processed in the current execution
 * context will have the processor applied.
 */
export function addEventProcessor(callback: EventProcessor): void {
  getIsolationScope().addEventProcessor(callback);
}

/**
 * Start a session on the current isolation scope.
 *
 * @param context (optional) additional properties to be applied to the returned session object
 *
 * @returns the new active session
 */
export function startSession(context?: SessionContext): Session {
  const client = getClient();
  const isolationScope = getIsolationScope();
  const currentScope = getCurrentScope();

  const { release, environment = DEFAULT_ENVIRONMENT } = (client && client.getOptions()) || {};

  // Will fetch userAgent if called from browser sdk
  const { userAgent } = GLOBAL_OBJ.navigator || {};

  const session = makeSession({
    release,
    environment,
    user: currentScope.getUser() || isolationScope.getUser(),
    ...(userAgent && { userAgent }),
    ...context,
  });

  // End existing session if there's one
  const currentSession = isolationScope.getSession();
  if (currentSession && currentSession.status === 'ok') {
    updateSession(currentSession, { status: 'exited' });
  }

  endSession();

  // Afterwards we set the new session on the scope
  isolationScope.setSession(session);

  // TODO (v8): Remove this and only use the isolation scope(?).
  // For v7 though, we can't "soft-break" people using getCurrentHub().getScope().setSession()
  currentScope.setSession(session);

  return session;
}

/**
 * End the session on the current isolation scope.
 */
export function endSession(): void {
  const isolationScope = getIsolationScope();
  const currentScope = getCurrentScope();

  const session = currentScope.getSession() || isolationScope.getSession();
  if (session) {
    closeSession(session);
  }
  _sendSessionUpdate();

  // the session is over; take it off of the scope
  isolationScope.setSession();

  // TODO (v8): Remove this and only use the isolation scope(?).
  // For v7 though, we can't "soft-break" people using getCurrentHub().getScope().setSession()
  currentScope.setSession();
}

/**
 * Sends the current Session on the scope
 */
function _sendSessionUpdate(): void {
  const isolationScope = getIsolationScope();
  const currentScope = getCurrentScope();
  const client = getClient();
  // TODO (v8): Remove currentScope and only use the isolation scope(?).
  // For v7 though, we can't "soft-break" people using getCurrentHub().getScope().setSession()
  const session = currentScope.getSession() || isolationScope.getSession();
  if (session && client) {
    client.captureSession(session);
  }
}

/**
 * Sends the current session on the scope to Sentry
 *
 * @param end If set the session will be marked as exited and removed from the scope.
 *            Defaults to `false`.
 */
export function captureSession(end: boolean = false): void {
  // both send the update and pull the session from the scope
  if (end) {
    endSession();
    return;
  }

  // only send the update
  _sendSessionUpdate();
}
