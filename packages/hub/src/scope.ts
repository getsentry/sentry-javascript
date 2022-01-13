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
import { CaptureContextCallback } from '@sentry/types/src/scope';
import { dateTimestampInSeconds, getGlobalObject, isPlainObject, isThenable, SyncPromise } from '@sentry/utils';

import { Session, updateSession } from './session';

type ScopeListener = (scope: Scope) => void;

/**
 * Absolute maximum number of breadcrumbs added to an event.
 * The `maxBreadcrumbs` option cannot be higher than this value.
 */
const MAX_BREADCRUMBS = 100;

/**
 * Holds additional event information. {@link applyScopeToEvent} will be
 * called by the client before an event will be sent.
 */
export class Scope {
  /** Flag if notifying is happening. */
  public notifyingListeners: boolean = false;

  /** Callback for client to receive scope changes. */
  public scopeListeners: Array<(scope: Scope) => void> = [];

  /** Callback list that will be called after {@link applyScopeToEvent}. */
  public eventProcessors: EventProcessor[] = [];

  /** Array of breadcrumbs. */
  public breadcrumbs: Breadcrumb[] = [];

  /** User */
  public user: User = {};

  /** Tags */
  public tags: Record<string, Primitive> = {};

  /** Extra */
  public extra: Extras = {};

  /** Contexts */
  public contexts: Contexts = {};

  /** Fingerprint */
  public fingerprint?: string[];

  /** Severity */
  public level?: SeverityLevel;

  /** Transaction Name */
  public transactionName?: string;

  /** Span */
  public span?: Span;

  /** Session */
  public session?: Session;

  /** Request Mode Session Status */
  public requestSession?: RequestSession;
}

/**
 * Inherit values from the parent scope.
 * @param scope to clone.
 */
export function cloneScope(scope?: Scope): Scope {
  const newScope = new Scope();
  if (scope) {
    newScope.breadcrumbs = [...scope.breadcrumbs];
    newScope.tags = { ...scope.tags };
    newScope.extra = { ...scope.extra };
    newScope.contexts = { ...scope.contexts };
    newScope.user = scope.user;
    newScope.level = scope.level;
    newScope.span = scope.span;
    newScope.session = scope.session;
    newScope.transactionName = scope.transactionName;
    newScope.fingerprint = scope.fingerprint;
    newScope.eventProcessors = [...scope.eventProcessors];
    newScope.requestSession = scope.requestSession;
  }
  return newScope;
}

/**
 * Returns the `Session` if there is one
 */
export function getScopeSession(scope?: Scope): Session | undefined {
  return scope && scope.session;
}

/**
 * Add internal on change listener. Used for sub SDKs that need to store the scope.
 * @hidden
 */
export function addScopeListener(scope: Scope, callback: ScopeListener): Scope {
  scope.scopeListeners.push(callback);
  return scope;
}

/** Add new event processor that will be called after {@link applyScopeToEvent}. */
export function addScopeEventProcessor(scope: Scope, callback: EventProcessor): Scope {
  scope.eventProcessors.push(callback);
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
export function setScopeTag(scope: Scope, key: string, value: Primitive): Scope {
  scope.tags = { ...scope.tags, [key]: value };
  return notifyListeners(scope);
}

/**
 * Set an object that will be merged sent as extra data with the event.
 * @param scope
 * @param extras Extras object to merge into current context.
 */
export function setScopeExtras(scope: Scope, extras: Extras): Scope {
  scope.extra = {
    ...scope.extra,
    ...extras,
  };
  return notifyListeners(scope);
}

/**
 * Set key:value that will be sent as extra data with the event.
 * @param scope
 * @param key String of extra
 * @param extra Any kind of data. This data will be normalized.
 */
export function setScopeExtra(scope: Scope, key: string, extra: Extra): Scope {
  scope.extra = { ...scope.extra, [key]: extra };
  return notifyListeners(scope);
}

/**
 * Sets the fingerprint on the scope to send with the events.
 * @param scope
 * @param fingerprint string[] to group events in Sentry.
 */
export function setScopeFingerprint(scope: Scope, fingerprint: string[]): Scope {
  scope.fingerprint = fingerprint;
  return notifyListeners(scope);
}

/**
 * Sets the level on the scope for future events.
 * @param scope
 * @param level string {@link Severity}
 */
export function setScopeLevel(scope: Scope, level: SeverityLevel): Scope {
  scope.level = level;
  return notifyListeners(scope);
}

/**
 * Sets the transaction name on the scope for future events.
 */
export function setScopeTransactionName(scope: Scope, name?: string): Scope {
  scope.transactionName = name;
  return notifyListeners(scope);
}

/**
 * Sets the transaction name on the scope for future events.
 */
export function setScopeTransaction(scope: Scope, name?: string): Scope {
  return setScopeTransactionName(scope, name);
}

/**
 * Sets context data with the given name.
 * @param scope
 * @param key
 * @param context an object containing context data. This data will be normalized. Pass `null` to unset the context.
 */
export function setScopeContext(scope: Scope, key: string, context: Context | null): Scope {
  if (context === null) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete scope.contexts[key];
  } else {
    scope.contexts = { ...scope.contexts, [key]: context };
  }

  return notifyListeners(scope);
}

/**
 * Sets the Span on the scope.
 * @param scope
 * @param span Span
 */
export function setScopeSpan(scope: Scope, span?: Span): Scope {
  scope.span = span;
  return notifyListeners(scope);
}

/**
 * @inheritDoc
 */
export function getScopeSpan(scope: Scope): Span | undefined {
  return scope.span;
}

/**
 * Returns the `Transaction` attached to the scope (if there is one)
 */
export function getScopeTransaction(scope: Scope): Transaction | undefined {
  // often, this span will be a transaction, but it's not guaranteed to be
  const span = getScopeSpan(scope) as undefined | (Span & { spanRecorder: { spans: Span[] } });

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
export function setScopeUser(scope: Scope, user: User | null): Scope {
  scope.user = user || {};
  if (scope.session) {
    updateSession(scope.session, { user });
  }
  return notifyListeners(scope);
}

/**
 * Returns the `User` if there is one
 */
export function getScopeUser(scope: Scope): User | undefined {
  return scope.user;
}

/**
 * Returns the `RequestSession` if there is one
 */
export function getScopeRequestSession(scope: Scope): RequestSession | undefined {
  return scope.requestSession;
}

/**
 * Set an object that will be merged sent as tags data with the event.
 * @param scope
 * @param tags Tags context object to merge into current context.
 */
export function setScopeTags(scope: Scope, tags: { [key: string]: Primitive }): Scope {
  scope.tags = {
    ...scope.tags,
    ...tags,
  };
  return notifyListeners(scope);
}

/**
 * Sets the `RequestSession` on the scope
 */
export function setScopeRequestSession(scope: Scope, requestSession?: RequestSession): Scope {
  scope.requestSession = requestSession;
  return scope;
}

/**
 * Sets the `Session` on the scope
 */
export function setScopeSession(scope: Scope, session?: Session): Scope {
  if (!session) {
    delete scope.session;
  } else {
    scope.session = session;
  }
  return notifyListeners(scope);
}

/**
 * Updates the scope with provided data. Can work in three variations:
 * - plain object containing updatable attributes
 * - Scope instance that'll extract the attributes from
 * - callback function that'll receive the current scope as an argument and allow for modifications
 * @param scope
 * @param captureContext scope modifier to be used
 */
export function updateScope(scope: Scope, captureContext?: CaptureContext): Scope {
  if (!captureContext) {
    return scope;
  }

  if (isCaptureContextCallback(captureContext)) {
    const updatedScope = captureContext(scope);
    // TODO: It seems to be defensive programming to check to check, since the
    // the type says you need to return a Scope back.
    return updatedScope instanceof Scope ? updatedScope : scope;
  }

  if (captureContext instanceof Scope) {
    return mergeScopes(scope, captureContext);
  } else if (isScopeContext(captureContext)) {
    return mergeScopeContext(scope, captureContext);
  }

  return scope;
}

/**
 * Clears the current scope and resets its properties.
 * */
export function clearScope(scope: Scope): Scope {
  scope.breadcrumbs = [];
  scope.tags = {};
  scope.extra = {};
  scope.user = {};
  scope.contexts = {};
  scope.level = undefined;
  scope.transactionName = undefined;
  scope.fingerprint = undefined;
  scope.requestSession = undefined;
  scope.span = undefined;
  scope.session = undefined;
  notifyListeners(scope);
  return scope;
}

/**
 * Sets the breadcrumbs in the scope
 * @param scope
 * @param breadcrumb
 * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
 */
export function addScopeBreadcrumb(scope: Scope, breadcrumb: Breadcrumb, maxBreadcrumbs?: number): Scope {
  // TODO: Defensive programming checking for `number`
  const maxCrumbs = typeof maxBreadcrumbs === 'number' ? Math.min(maxBreadcrumbs, MAX_BREADCRUMBS) : MAX_BREADCRUMBS;

  // No data has been changed, so don't notify scope listeners
  if (maxCrumbs <= 0) {
    return scope;
  }

  const mergedBreadcrumb = {
    timestamp: dateTimestampInSeconds(),
    ...breadcrumb,
  };
  scope.breadcrumbs = [...scope.breadcrumbs, mergedBreadcrumb].slice(-maxCrumbs);

  return notifyListeners(scope);
}

/**
 * Clears all currently set Breadcrumbs.
 */
export function clearScopeBreadcrumbs(scope: Scope): Scope {
  scope.breadcrumbs = [];
  return notifyListeners(scope);
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
export function applyScopeToEvent(scope: Scope, event: Event, hint?: EventHint): PromiseLike<Event | null> {
  if (scope.extra && Object.keys(scope.extra).length) {
    event.extra = { ...scope.extra, ...event.extra };
  }
  if (scope.tags && Object.keys(scope.tags).length) {
    event.tags = { ...scope.tags, ...event.tags };
  }
  if (scope.user && Object.keys(scope.user).length) {
    event.user = { ...scope.user, ...event.user };
  }
  if (scope.contexts && Object.keys(scope.contexts).length) {
    event.contexts = { ...scope.contexts, ...event.contexts };
  }
  if (scope.level) {
    event.level = scope.level;
  }
  if (scope.transactionName) {
    event.transaction = scope.transactionName;
  }
  // We want to set the trace context for normal events only if there isn't already
  // a trace context on the event. There is a product feature in place where we link
  // errors with transaction and it relies on that.
  if (scope.span) {
    event.contexts = { trace: scope.span.getTraceContext(), ...event.contexts };
    const transactionName = scope.span.transaction && scope.span.transaction.name;
    if (transactionName) {
      event.tags = { transaction: transactionName, ...event.tags };
    }
  }

  applyFingerprint(scope, event);

  event.breadcrumbs = [...(event.breadcrumbs || []), ...scope.breadcrumbs];
  event.breadcrumbs = event.breadcrumbs.length > 0 ? event.breadcrumbs : undefined;

  return notifyEventProcessors(scope, [...getGlobalEventProcessors(), ...scope.eventProcessors], event, hint);
}

/**
 * Add a EventProcessor to be kept globally.
 * @param callback EventProcessor to add
 */
export function addGlobalEventProcessor(callback: EventProcessor): void {
  getGlobalEventProcessors().push(callback);
}

function mergeScopeContext(scope: Scope, captureContext: Partial<ScopeContext>): Scope {
  scope.tags = { ...scope.tags, ...captureContext.tags };
  scope.extra = { ...scope.extra, ...captureContext.extra };
  scope.contexts = { ...scope.contexts, ...captureContext.contexts };
  if (captureContext.user) {
    scope.user = captureContext.user;
  }
  if (captureContext.level) {
    scope.level = captureContext.level;
  }
  if (captureContext.fingerprint) {
    scope.fingerprint = captureContext.fingerprint;
  }
  if (captureContext.requestSession) {
    scope.requestSession = captureContext.requestSession;
  }

  return scope;
}

function mergeScopes(scope: Scope, newScope: Scope): Scope {
  scope.tags = { ...scope.tags, ...newScope.tags };
  scope.extra = { ...scope.extra, ...newScope.extra };
  scope.contexts = { ...scope.contexts, ...newScope.contexts };
  if (newScope.user && Object.keys(newScope.user).length) {
    scope.user = newScope.user;
  }
  if (newScope.level) {
    scope.level = newScope.level;
  }
  if (newScope.fingerprint) {
    scope.fingerprint = newScope.fingerprint;
  }
  if (newScope.requestSession) {
    scope.requestSession = newScope.requestSession;
  }

  return scope;
}

function isCaptureContextCallback(val: unknown): val is CaptureContextCallback {
  return typeof val === 'function';
}

function isScopeContext(val: unknown): val is Partial<ScopeContext> {
  return isPlainObject(val);
}

/**
 * This will be called after {@link applyScopeToEvent} is finished.
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
function notifyListeners(scope: Scope): Scope {
  // We need this check for this._notifyingListeners to be able to work on scope during updates
  // If this check is not here we'll produce endless recursion when something is done with the scope
  // during the callback.
  if (!scope.notifyingListeners) {
    scope.notifyingListeners = true;
    scope.scopeListeners.forEach(callback => callback(scope));
    scope.notifyingListeners = false;
  }

  return scope;
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
  if (scope.fingerprint) {
    event.fingerprint = event.fingerprint.concat(scope.fingerprint);
  }

  // If we have no data at all, remove empty array default
  if (event.fingerprint && !event.fingerprint.length) {
    delete event.fingerprint;
  }
}

// TODO: I would move this out of there and move it to some globals package like `getGlobalObject` is
/**
 * Returns the global event processors.
 */
function getGlobalEventProcessors(): EventProcessor[] {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access  */
  const global = getGlobalObject<any>();
  global.__SENTRY__ = global.__SENTRY__ || {};
  global.__SENTRY__.globalEventProcessors = global.__SENTRY__.globalEventProcessors || [];
  return global.__SENTRY__.globalEventProcessors ?? [];
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
}
