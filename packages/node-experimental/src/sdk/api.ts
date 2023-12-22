// PUBLIC APIS

import { context } from '@opentelemetry/api';
import { DEFAULT_ENVIRONMENT, closeSession, makeSession, updateSession } from '@sentry/core';
import type {
  Breadcrumb,
  BreadcrumbHint,
  CaptureContext,
  Event,
  EventHint,
  EventProcessor,
  Extra,
  Extras,
  Primitive,
  Session,
  Severity,
  SeverityLevel,
  User,
} from '@sentry/types';
import { GLOBAL_OBJ, consoleSandbox, dateTimestampInSeconds } from '@sentry/utils';
import { getScopesFromContext, setScopesOnContext } from '../utils/contextData';

import type { ExclusiveEventHintOrCaptureContext } from '../utils/prepareEvent';
import { parseEventHintOrCaptureContext } from '../utils/prepareEvent';
import type { Scope } from './scope';
import { getClient, getCurrentScope, getGlobalScope, getIsolationScope } from './scope';

export { getCurrentScope, getGlobalScope, getIsolationScope, getClient };
export { setCurrentScope, setIsolationScope } from './scope';

/**
 * Fork a scope from the current scope, and make it the current scope in the given callback
 */
export function withScope<T>(callback: (scope: Scope) => T): T {
  return context.with(context.active(), () => callback(getCurrentScope()));
}

/**
 * For a new isolation scope from the current isolation scope,
 * and make it the current isolation scope in the given callback.
 */
export function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T {
  const ctx = context.active();
  const currentScopes = getScopesFromContext(ctx);
  const scopes = currentScopes
    ? { ...currentScopes }
    : {
        scope: getCurrentScope(),
        isolationScope: getIsolationScope(),
      };

  scopes.isolationScope = scopes.isolationScope.clone();

  return context.with(setScopesOnContext(ctx, scopes), () => {
    return callback(getIsolationScope());
  });
}

/** Get the ID of the last sent error event. */
export function lastEventId(): string | undefined {
  return getCurrentScope().lastEventId();
}

/**
 * Configure the current scope.
 * @deprecated Use `getCurrentScope()` instead.
 */
export function configureScope(callback: (scope: Scope) => void): void {
  callback(getCurrentScope());
}

/** Record an exception and send it to Sentry. */
export function captureException(exception: unknown, hint?: ExclusiveEventHintOrCaptureContext): string {
  return getCurrentScope().captureException(exception, parseEventHintOrCaptureContext(hint));
}

/** Record a message and send it to Sentry. */
export function captureMessage(
  message: string,
  // eslint-disable-next-line deprecation/deprecation
  captureContext?: CaptureContext | Severity | SeverityLevel,
): string {
  // This is necessary to provide explicit scopes upgrade, without changing the original
  // arity of the `captureMessage(message, level)` method.
  const level = typeof captureContext === 'string' ? captureContext : undefined;
  const context = typeof captureContext !== 'string' ? { captureContext } : undefined;

  return getCurrentScope().captureMessage(message, level, context);
}

/** Capture a generic event and send it to Sentry. */
export function captureEvent(event: Event, hint?: EventHint): string {
  return getCurrentScope().captureEvent(event, hint);
}

/**
 * Add a breadcrumb to the current isolation scope.
 */
export function addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
  const client = getClient();

  const { beforeBreadcrumb, maxBreadcrumbs } = client.getOptions();

  if (maxBreadcrumbs && maxBreadcrumbs <= 0) return;

  const timestamp = dateTimestampInSeconds();
  const mergedBreadcrumb = { timestamp, ...breadcrumb };
  const finalBreadcrumb = beforeBreadcrumb
    ? (consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) as Breadcrumb | null)
    : mergedBreadcrumb;

  if (finalBreadcrumb === null) return;

  if (client.emit) {
    client.emit('beforeAddBreadcrumb', finalBreadcrumb, hint);
  }

  getIsolationScope().addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
}

/**
 * Add a global event processor.
 */
export function addGlobalEventProcessor(eventProcessor: EventProcessor): void {
  getGlobalScope().addEventProcessor(eventProcessor);
}

/**
 * Add an event processor to the current isolation scope.
 */
export function addEventProcessor(eventProcessor: EventProcessor): void {
  getIsolationScope().addEventProcessor(eventProcessor);
}

/** Set the user for the current isolation scope. */
export function setUser(user: User | null): void {
  getIsolationScope().setUser(user);
}

/** Set tags for the current isolation scope. */
export function setTags(tags: { [key: string]: Primitive }): void {
  getIsolationScope().setTags(tags);
}

/** Set a single tag user for the current isolation scope. */
export function setTag(key: string, value: Primitive): void {
  getIsolationScope().setTag(key, value);
}

/** Set extra data for the current isolation scope. */
export function setExtra(key: string, extra: Extra): void {
  getIsolationScope().setExtra(key, extra);
}

/** Set multiple extra data for the current isolation scope. */
export function setExtras(extras: Extras): void {
  getIsolationScope().setExtras(extras);
}

/** Set context data for the current isolation scope. */
export function setContext(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { [key: string]: any } | null,
): void {
  getIsolationScope().setContext(name, context);
}

/** Start a session on the current isolation scope. */
export function startSession(context?: Session): Session {
  const client = getClient();
  const isolationScope = getIsolationScope();

  const { release, environment = DEFAULT_ENVIRONMENT } = client.getOptions();

  // Will fetch userAgent if called from browser sdk
  const { userAgent } = GLOBAL_OBJ.navigator || {};

  const session = makeSession({
    release,
    environment,
    user: isolationScope.getUser(),
    ...(userAgent && { userAgent }),
    ...context,
  });

  // End existing session if there's one
  const currentSession = isolationScope.getSession && isolationScope.getSession();
  if (currentSession && currentSession.status === 'ok') {
    updateSession(currentSession, { status: 'exited' });
  }
  endSession();

  // Afterwards we set the new session on the scope
  isolationScope.setSession(session);

  return session;
}

/** End the session on the current isolation scope. */
export function endSession(): void {
  const isolationScope = getIsolationScope();
  const session = isolationScope.getSession();
  if (session) {
    closeSession(session);
  }
  _sendSessionUpdate();

  // the session is over; take it off of the scope
  isolationScope.setSession();
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
