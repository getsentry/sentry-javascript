/* eslint-disable max-lines */
import {
  Breadcrumb,
  CaptureContext,
  Context,
  Contexts,
  Event,
  EventHint,
  EventProcessor,
  Extra,
  Extras,
  Primitive,
  RequestSession,
  ScopeContext,
  SeverityLevel,
  Span,
  Transaction,
  User,
} from '@sentry/types';
import { dateTimestampInSeconds, getGlobalObject, isPlainObject, isThenable, SyncPromise } from '@sentry/utils';

import { Session, updateSession } from './session';

/**
 * Absolute maximum number of breadcrumbs added to an event.
 * The `maxBreadcrumbs` option cannot be higher than this value.
 */
const MAX_BREADCRUMBS = 100;

/**
 * Holds additional event information. {@link applyToEvent} will be
 * called by the client before an event will be sent.
 */
export class Scope {
  /** Flag if notifying is happening. */
  public _notifyingListeners: boolean = false;

  /** Callback for client to receive scope changes. */
  public _scopeListeners: Array<(scope: Scope) => void> = [];

  /** Callback list that will be called after {@link applyToEvent}. */
  public _eventProcessors: EventProcessor[] = [];

  /** Array of breadcrumbs. */
  public _breadcrumbs: Breadcrumb[] = [];

  /** User */
  public _user: User = {};

  /** Tags */
  public _tags: { [key: string]: Primitive } = {};

  /** Extra */
  public _extra: Extras = {};

  /** Contexts */
  public _contexts: Contexts = {};

  /** Fingerprint */
  public _fingerprint?: string[];

  /** Severity */
  public _level?: SeverityLevel;

  /** Transaction Name */
  public _transactionName?: string;

  /** Span */
  public _span?: Span;

  /** Session */
  public _session?: Session;

  /** Request Mode Session Status */
  public _requestSession?: RequestSession;
}

/**
 * Inherit values from the parent scope.
 * @param scope to clone.
 */
export function cloneScope(scope?: Scope): Scope {
  const newScope = new Scope();
  if (scope) {
    newScope._breadcrumbs = [...scope._breadcrumbs];
    newScope._tags = { ...scope._tags };
    newScope._extra = { ...scope._extra };
    newScope._contexts = { ...scope._contexts };
    newScope._user = scope._user;
    newScope._level = scope._level;
    newScope._span = scope._span;
    newScope._session = scope._session;
    newScope._transactionName = scope._transactionName;
    newScope._fingerprint = scope._fingerprint;
    newScope._eventProcessors = [...scope._eventProcessors];
    newScope._requestSession = scope._requestSession;
  }
  return newScope;
}

/**
 * Returns the `Session` if there is one
 */
export function getSession(scope?: Scope): Session | undefined {
  return scope && scope._session;
}

/**
 * Add internal on change listener. Used for sub SDKs that need to store the scope.
 * @hidden
 */
export function addScopeListener(scope: Scope, callback: (scope: Scope) => void): Scope {
  scope._scopeListeners.push(callback);
  return scope;
}

/** Add new event processor that will be called after {@link applyToEvent}. */
export function addEventProcessor(scope: Scope, callback: EventProcessor): Scope {
  scope._eventProcessors.push(callback);
  return scope;
}

/**
 * Set key:value that will be sent as tags data with the event.
 *
 * Can also be used to unset a tag by passing `undefined`.
 *
 * @param scope
 * @param key String key of tag
 * @param value Value of tag
 */
export function setTag(scope: Scope, key: string, value: Primitive): Scope {
  scope._tags = { ...scope._tags, [key]: value };
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Set an object that will be merged sent as extra data with the event.
 * @param scope
 * @param extras Extras object to merge into current context.
 */
export function setExtras(scope: Scope, extras: Extras): Scope {
  scope._extra = {
    ...scope._extra,
    ...extras,
  };
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Set key:value that will be sent as extra data with the event.
 * @param scope
 * @param key String of extra
 * @param extra Any kind of data. This data will be normalized.
 */
export function setExtra(scope: Scope, key: string, extra: Extra): Scope {
  scope._extra = { ...scope._extra, [key]: extra };
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Sets the fingerprint on the scope to send with the events.
 * @param scope
 * @param fingerprint string[] to group events in Sentry.
 */
export function setFingerprint(scope: Scope, fingerprint: string[]): Scope {
  scope._fingerprint = fingerprint;
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Sets the level on the scope for future events.
 * @param scope
 * @param level string {@link Severity}
 */
export function setLevel(scope: Scope, level: SeverityLevel): Scope {
  scope._level = level;
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Sets the transaction name on the scope for future events.
 */
export function setTransactionName(scope: Scope, name?: string): Scope {
  scope._transactionName = name;
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Sets the transaction name on the scope for future events.
 */
export function setTransaction(scope: Scope, name?: string): Scope {
  return setTransactionName(scope, name);
}

/**
 * Sets context data with the given name.
 * @param scope
 * @param key
 * @param context an object containing context data. This data will be normalized. Pass `null` to unset the context.
 */
export function setContext(scope: Scope, key: string, context: Context | null): Scope {
  if (context === null) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete scope._contexts[key];
  } else {
    scope._contexts = { ...scope._contexts, [key]: context };
  }

  notifyScopeListeners(scope);
  return scope;
}

/**
 * Sets the Span on the scope.
 * @param scope
 * @param span Span
 */
export function setSpan(scope: Scope, span?: Span): Scope {
  scope._span = span;
  notifyScopeListeners(scope);
  return scope;
}

/**
 * @inheritDoc
 */
export function getSpan(scope: Scope): Span | undefined {
  return scope._span;
}

/**
 * Returns the `Transaction` attached to the scope (if there is one)
 */
export function getTransaction(scope: Scope): Transaction | undefined {
  // often, this span will be a transaction, but it's not guaranteed to be
  const span = getSpan(scope) as undefined | (Span & { spanRecorder: { spans: Span[] } });

  // try it the new way first
  if (span && span.transaction) {
    return span.transaction;
  }

  // fallback to the old way (known bug: this only finds transactions with sampled = true)
  if (span && span.spanRecorder && span.spanRecorder.spans[0]) {
    return span.spanRecorder.spans[0] as Transaction;
  }

  // neither way found a transaction
  return undefined;
}

/**
 * Updates user context information for future events.
 *
 * @param scope
 * @param user User context object to be set in the current context. Pass `null` to unset the user.
 */
export function setUser(scope: Scope, user: User | null): Scope {
  scope._user = user || {};
  if (scope._session) {
    updateSession(scope._session, { user });
  }
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Returns the `User` if there is one
 */
export function getUser(scope: Scope): User | undefined {
  return scope._user;
}

/**
 * Returns the `RequestSession` if there is one
 */
export function getRequestSession(scope: Scope): RequestSession | undefined {
  return scope._requestSession;
}

/**
 * Set an object that will be merged sent as tags data with the event.
 * @param scope
 * @param tags Tags context object to merge into current context.
 */
export function setTags(scope: Scope, tags: { [key: string]: Primitive }): Scope {
  scope._tags = {
    ...scope._tags,
    ...tags,
  };
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Sets the `RequestSession` on the scope
 */
export function setRequestSession(scope: Scope, requestSession?: RequestSession): Scope {
  scope._requestSession = requestSession;
  return scope;
}

/**
 * Sets the `Session` on the scope
 */
export function setSession(scope: Scope, session?: Session): Scope {
  if (!session) {
    delete scope._session;
  } else {
    scope._session = session;
  }
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Updates the scope with provided data. Can work in three variations:
 * - plain object containing updatable attributes
 * - Scope instance that'll extract the attributes from
 * - callback function that'll receive the current scope as an argument and allow for modifications
 * @param scope
 * @param captureContext scope modifier to be used
 */
export function update(scope: Scope, captureContext?: CaptureContext): Scope {
  if (!captureContext) {
    return scope;
  }

  if (typeof captureContext === 'function') {
    const updatedScope = (captureContext as <T>(scope: T) => T)(scope);
    return updatedScope instanceof Scope ? updatedScope : scope;
  }

  if (captureContext instanceof Scope) {
    scope._tags = { ...scope._tags, ...captureContext._tags };
    scope._extra = { ...scope._extra, ...captureContext._extra };
    scope._contexts = { ...scope._contexts, ...captureContext._contexts };
    if (captureContext._user && Object.keys(captureContext._user).length) {
      scope._user = captureContext._user;
    }
    if (captureContext._level) {
      scope._level = captureContext._level;
    }
    if (captureContext._fingerprint) {
      scope._fingerprint = captureContext._fingerprint;
    }
    if (captureContext._requestSession) {
      scope._requestSession = captureContext._requestSession;
    }
  } else if (isPlainObject(captureContext)) {
    // eslint-disable-next-line no-param-reassign
    captureContext = captureContext as ScopeContext;
    scope._tags = { ...scope._tags, ...captureContext.tags };
    scope._extra = { ...scope._extra, ...captureContext.extra };
    scope._contexts = { ...scope._contexts, ...captureContext.contexts };
    if (captureContext.user) {
      scope._user = captureContext.user;
    }
    if (captureContext.level) {
      scope._level = captureContext.level;
    }
    if (captureContext.fingerprint) {
      scope._fingerprint = captureContext.fingerprint;
    }
    if (captureContext.requestSession) {
      scope._requestSession = captureContext.requestSession;
    }
  }

  return scope;
}

/** Clears the current scope and resets its properties. */
export function clear(scope: Scope): Scope {
  scope._breadcrumbs = [];
  scope._tags = {};
  scope._extra = {};
  scope._user = {};
  scope._contexts = {};
  scope._level = undefined;
  scope._transactionName = undefined;
  scope._fingerprint = undefined;
  scope._requestSession = undefined;
  scope._span = undefined;
  scope._session = undefined;
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Sets the breadcrumbs in the scope
 * @param scope
 * @param breadcrumb
 * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
 */
export function addBreadcrumb(scope: Scope, breadcrumb: Breadcrumb, maxBreadcrumbs?: number): Scope {
  const maxCrumbs = typeof maxBreadcrumbs === 'number' ? Math.min(maxBreadcrumbs, MAX_BREADCRUMBS) : MAX_BREADCRUMBS;

  // No data has been changed, so don't notify scope listeners
  if (maxCrumbs <= 0) {
    return scope;
  }

  const mergedBreadcrumb = {
    timestamp: dateTimestampInSeconds(),
    ...breadcrumb,
  };
  scope._breadcrumbs = [...scope._breadcrumbs, mergedBreadcrumb].slice(-maxCrumbs);
  notifyScopeListeners(scope);

  return scope;
}

/**
 * Clears all currently set Breadcrumbs.
 */
export function clearBreadcrumbs(scope: Scope): Scope {
  scope._breadcrumbs = [];
  notifyScopeListeners(scope);
  return scope;
}

/**
 * Applies the current context and fingerprint to the event.
 * Note that breadcrumbs will be added by the client.
 * Also if the event has already breadcrumbs on it, we do not merge them.
 * @param scope The Scope to apply the event to.
 * @param event Event
 * @param hint May contain additional information about the original exception.
 * @hidden
 */
export function applyToEvent(scope: Scope, event: Event, hint?: EventHint): PromiseLike<Event | null> {
  if (scope._extra && Object.keys(scope._extra).length) {
    event.extra = { ...scope._extra, ...event.extra };
  }
  if (scope._tags && Object.keys(scope._tags).length) {
    event.tags = { ...scope._tags, ...event.tags };
  }
  if (scope._user && Object.keys(scope._user).length) {
    event.user = { ...scope._user, ...event.user };
  }
  if (scope._contexts && Object.keys(scope._contexts).length) {
    event.contexts = { ...scope._contexts, ...event.contexts };
  }
  if (scope._level) {
    event.level = scope._level;
  }
  if (scope._transactionName) {
    event.transaction = scope._transactionName;
  }
  // We want to set the trace context for normal events only if there isn't already
  // a trace context on the event. There is a product feature in place where we link
  // errors with transaction and it relies on that.
  if (scope._span) {
    event.contexts = { trace: scope._span.getTraceContext(), ...event.contexts };
    const transactionName = scope._span.transaction && scope._span.transaction.name;
    if (transactionName) {
      event.tags = { transaction: transactionName, ...event.tags };
    }
  }

  applyFingerprint(scope, event);

  event.breadcrumbs = [...(event.breadcrumbs || []), ...scope._breadcrumbs];
  event.breadcrumbs = event.breadcrumbs.length > 0 ? event.breadcrumbs : undefined;

  return notifyEventProcessors(scope, [...getGlobalEventProcessors(), ...scope._eventProcessors], event, hint);
}

/**
 * This will be called after {@link applyToEvent} is finished.
 */
function notifyEventProcessors(
  scope: Scope,
  processors: EventProcessor[],
  event: Event | null,
  hint?: EventHint,
  index: number = 0,
): PromiseLike<Event | null> {
  return new SyncPromise<Event | null>((resolve, reject) => {
    const processor = processors[index];
    if (event === null || typeof processor !== 'function') {
      resolve(event);
    } else {
      const result = processor({ ...event }, hint) as Event | null;
      if (isThenable(result)) {
        void (result as PromiseLike<Event | null>)
          .then(final => notifyEventProcessors(scope, processors, final, hint, index + 1).then(resolve))
          .then(null, reject);
      } else {
        void notifyEventProcessors(scope, processors, result, hint, index + 1)
          .then(resolve)
          .then(null, reject);
      }
    }
  });
}

/**
 * This will be called on every set call.
 */
function notifyScopeListeners(scope: Scope): void {
  // We need this check for this._notifyingListeners to be able to work on scope during updates
  // If this check is not here we'll produce endless recursion when something is done with the scope
  // during the callback.
  if (!scope._notifyingListeners) {
    scope._notifyingListeners = true;
    scope._scopeListeners.forEach(callback => {
      callback(scope);
    });
    scope._notifyingListeners = false;
  }
}

/**
 * Applies fingerprint from the scope to the event if there's one,
 * uses message if there's one instead or get rid of empty fingerprint
 */
function applyFingerprint(scope: Scope, event: Event): void {
  // Make sure it's an array first and we actually have something in place
  event.fingerprint = event.fingerprint
    ? Array.isArray(event.fingerprint)
      ? event.fingerprint
      : [event.fingerprint]
    : [];

  // If we have something on the scope, then merge it with event
  if (scope._fingerprint) {
    event.fingerprint = event.fingerprint.concat(scope._fingerprint);
  }

  // If we have no data at all, remove empty array default
  if (event.fingerprint && !event.fingerprint.length) {
    delete event.fingerprint;
  }
}

/**
 * Returns the global event processors.
 */
function getGlobalEventProcessors(): EventProcessor[] {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access  */
  const global = getGlobalObject<any>();
  global.__SENTRY__ = global.__SENTRY__ || {};
  global.__SENTRY__.globalEventProcessors = global.__SENTRY__.globalEventProcessors || [];
  return global.__SENTRY__.globalEventProcessors;
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
}

/**
 * Add a EventProcessor to be kept globally.
 * @param callback EventProcessor to add
 */
export function addGlobalEventProcessor(callback: EventProcessor): void {
  getGlobalEventProcessors().push(callback);
}
