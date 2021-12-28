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
  Scope,
  ScopeContext,
  SeverityLevel,
  Span,
  Transaction,
  User,
} from '@sentry/types';
import { dateTimestampInSeconds, getGlobalObject, isPlainObject, isThenable, SyncPromise } from '@sentry/utils';

import { Session } from './session';

function isScopeInterface(scope: Scope | Partial<ScopeContext>): scope is Scope {
  return isPlainObject(scope) && 'addEventProcessor' in scope;
}

/**
 * Absolute maximum number of breadcrumbs added to an event.
 * The `maxBreadcrumbs` option cannot be higher than this value.
 */
const MAX_BREADCRUMBS = 100;

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export function makeScope(): Scope {
  let _notifyingListeners: boolean = false;

  /** Callback for client to receive scope changes. */
  const _scopeListeners: Array<(scope: Scope) => void> = [];

  /** Callback list that will be called after {@link applyToEvent}. */
  const _eventProcessors: EventProcessor[] = [];

  /** Array of breadcrumbs. */
  let _breadcrumbs: Breadcrumb[] = [];

  /** User */
  let _user: User = {};

  /** Tags */
  let _tags: { [key: string]: Primitive } = {};

  /** Extra */
  let _extra: Extras = {};

  /** Contexts */
  let _contexts: Contexts = {};

  /** Fingerprint */
  let _fingerprint: string[] | undefined = undefined;

  /** Severity */
  let _level: SeverityLevel | undefined = undefined;

  /** Transaction Name */
  let _transactionName: string | undefined = undefined;

  /** Span */
  let _span: Span | undefined = undefined;

  /** Session */
  let _session: Session | undefined = undefined;

  /** Request Mode Session Status */
  let _requestSession: RequestSession | undefined = undefined;

  const scope: Scope = {
    applyToEvent,
    addBreadcrumb,
    addEventProcessor,
    addScopeListener,
    clearBreadcrumbs,
    setUser,
    getUser,
    getRequestSession,
    setRequestSession,
    setTags,
    setTag,
    setExtras,
    setExtra,
    setFingerprint,
    setLevel,
    setTransactionName,
    setTransaction,
    setContext,
    setContexts,
    setSpan,
    setSession,
    getSpan,
    getTransaction,
    getBreadcrumbs,
    getProcessors,
    getContext,
    getContexts,
    getExtra,
    getExtras,
    getTag,
    getTags,
    getFingerprint,
    getLevel,
    getTransactionName,
    getSession,
    clone,
    clear,
    update,
  };

  /**
   * @inheritDoc
   */
  function clearBreadcrumbs(): Scope {
    _breadcrumbs = [];
    _notifyScopeListeners();

    return scope;
  }

  /**
   * Add internal on change listener. Used for sub SDKs that need to store the scope.
   * @hidden
   */
  function addScopeListener(callback: (scope: Scope) => void): Scope {
    _scopeListeners.push(callback);
    return scope;
  }

  /**
   * @inheritDoc
   */
  function addEventProcessor(callback: EventProcessor): Scope {
    _eventProcessors.push(callback);
    return scope;
  }

  /**
   * @inheritdoc
   */
  function getProcessors(): EventProcessor[] {
    return [..._eventProcessors];
  }

  /**
   * @inheritDoc
   */
  function setUser(user: User | null): Scope {
    _user = user || {};
    if (_session) {
      _session.update({ user });
    }
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getUser(): User | undefined {
    return Object.keys(_user).length > 0 ? _user : undefined;
  }

  /**
   * @inheritDoc
   */
  function getRequestSession(): RequestSession | undefined {
    return _requestSession;
  }

  /**
   * @inheritDoc
   */
  function getBreadcrumbs(): Breadcrumb[] {
    return [..._breadcrumbs];
  }

  /**
   * @inheritDoc
   */
  function setRequestSession(requestSession?: RequestSession): Scope {
    _requestSession = requestSession;
    return scope;
  }

  /**
   * @inheritDoc
   */
  function setTags(tags: { [key: string]: Primitive }): Scope {
    _tags = {
      ..._tags,
      ...tags,
    };
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getTags(): typeof _tags {
    return { ..._tags };
  }

  /**
   * @inheritDoc
   */
  function setTag(key: string, value: Primitive): Scope {
    _tags = { ..._tags, [key]: value };
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getTag(key: string): Primitive | undefined {
    return _tags[key];
  }

  /**
   * @inheritDoc
   */
  function setExtras(extras: Extras): Scope {
    _extra = {
      ..._extra,
      ...extras,
    };
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getExtras(): Extras {
    return { ..._extra };
  }

  /**
   * @inheritDoc
   */
  function setExtra(key: string, extra: Extra): Scope {
    _extra = { ..._extra, [key]: extra };
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getExtra(key: string): Extra | undefined {
    return _extra[key];
  }

  /**
   * @inheritDoc
   */
  function setFingerprint(fingerprint: string[]): Scope {
    _fingerprint = fingerprint;
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getFingerprint(): string[] | undefined {
    return _fingerprint ? _fingerprint.slice(0) : undefined;
  }

  /**
   * @inheritDoc
   */
  function setLevel(level: SeverityLevel): Scope {
    _level = level;
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getLevel(): SeverityLevel | undefined {
    return _level;
  }

  /**
   * @inheritDoc
   */
  function setTransactionName(name?: string): Scope {
    _transactionName = name;
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getTransactionName(): string | undefined {
    return _transactionName;
  }

  /**
   * Can be removed in major version.
   * @deprecated in favor of {@link setTransactionName}
   */
  function setTransaction(name?: string): Scope {
    setTransactionName(name);
    return scope;
  }

  /**
   * @inheritDoc
   */
  function setContexts(contexts: Record<string, Context>): Scope {
    _contexts = contexts;
    return scope;
  }

  /**
   * @inheritDoc
   */
  function setContext(key: string, context: Context | null): Scope {
    if (context === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete _contexts[key];
    } else {
      _contexts = { ..._contexts, [key]: context };
    }

    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getContext(key: string): Context | undefined {
    return _contexts ? _contexts[key] : undefined;
  }

  /**
   * @inheritDoc
   */
  function getContexts(): Contexts {
    return _contexts;
  }

  /**
   * @inheritDoc
   */
  function setSpan(span?: Span): Scope {
    _span = span;
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getSpan(): Span | undefined {
    return _span;
  }

  /**
   * @inheritDoc
   */
  function getTransaction(): Transaction | undefined {
    // often, this span will be a transaction, but it's not guaranteed to be
    const span = getSpan() as undefined | (Span & { spanRecorder: { spans: Span[] } });

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
   * @inheritDoc
   */
  function setSession(session?: Session): Scope {
    if (!session) {
      _session = undefined;
    } else {
      _session = session;
    }
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function getSession(): Session | undefined {
    return _session;
  }

  /**
   * @inheritDoc
   */
  function update(captureContext?: CaptureContext): Scope {
    if (!captureContext) {
      return scope;
    }

    if (typeof captureContext === 'function') {
      const updatedScope = (captureContext as <T>(scope: T) => T)(scope);
      return isScopeInterface(updatedScope) ? updatedScope : scope;
    }

    if (isScopeInterface(captureContext)) {
      setTags({ ..._tags, ...captureContext.getTags() });
      setExtras({ ..._extra, ...captureContext.getExtras() });
      setContexts({ ..._contexts, ...captureContext.getContexts() });

      if (captureContext.getUser()) {
        setUser(captureContext.getUser()!);
      }
      if (captureContext.getLevel()) {
        setLevel(captureContext.getLevel()!);
      }
      if (captureContext.getFingerprint()) {
        setFingerprint(captureContext.getFingerprint()!);
      }
      if (captureContext.getRequestSession()) {
        setRequestSession(captureContext.getRequestSession());
      }
    } else if (isPlainObject(captureContext)) {
      // eslint-disable-next-line no-param-reassign
      setTags({ ..._tags, ...captureContext.tags });
      setExtras({ ..._extra, ...captureContext.extra });
      setContexts({ ..._contexts, ...captureContext.contexts });

      if (captureContext.user) {
        setUser(captureContext.user);
      }
      if (captureContext.level) {
        setLevel(captureContext.level);
      }
      if (captureContext.fingerprint) {
        setFingerprint(captureContext.fingerprint);
      }
      if (captureContext.requestSession) {
        setRequestSession(captureContext.requestSession);
      }
    }

    return scope;
  }

  /**
   * @inheritDoc
   */
  function clear(): Scope {
    _breadcrumbs = [];
    _tags = {};
    _extra = {};
    _user = {};
    _contexts = {};
    _level = undefined;
    _transactionName = undefined;
    _fingerprint = undefined;
    _requestSession = undefined;
    _span = undefined;
    _session = undefined;
    _notifyScopeListeners();
    return scope;
  }

  /**
   * @inheritDoc
   */
  function addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): Scope {
    const maxCrumbs = typeof maxBreadcrumbs === 'number' ? Math.min(maxBreadcrumbs, MAX_BREADCRUMBS) : MAX_BREADCRUMBS;

    // No data has been changed, so don't notify scope listeners
    if (maxCrumbs <= 0) {
      return scope;
    }

    const mergedBreadcrumb = {
      timestamp: dateTimestampInSeconds(),
      ...breadcrumb,
    };
    _breadcrumbs = [..._breadcrumbs, mergedBreadcrumb].slice(-maxCrumbs);
    _notifyScopeListeners();
    return scope;
  }

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  function clone(): Scope {
    const newScope = makeScope();

    newScope.setTags(scope.getTags());
    newScope.setExtras(scope.getExtras());
    newScope.setContexts(scope.getContexts());
    newScope.setUser(scope.getUser() ?? null);
    if (scope.getLevel()) {
      newScope.setLevel(scope.getLevel()!);
    }
    newScope.setSpan(scope.getSpan());
    newScope.setSession(scope.getSession());
    newScope.setTransactionName(scope.getTransactionName());

    if (scope.getFingerprint()) {
      newScope.setFingerprint(scope.getFingerprint()!);
    }

    for (const processor of scope.getProcessors()) {
      newScope.addEventProcessor(processor);
    }

    newScope.setRequestSession(scope.getRequestSession());

    return newScope;
  }

  /**
   * Applies fingerprint from the scope to the event if there's one,
   * uses message if there's one instead or get rid of empty fingerprint
   */
  function _applyFingerprint(event: Event): void {
    // Make sure it's an array first and we actually have something in place
    event.fingerprint = event.fingerprint
      ? Array.isArray(event.fingerprint)
        ? event.fingerprint
        : [event.fingerprint]
      : [];

    // If we have something on the scope, then merge it with event
    if (_fingerprint) {
      event.fingerprint = event.fingerprint.concat(_fingerprint);
    }

    // If we have no data at all, remove empty array default
    if (event.fingerprint && !event.fingerprint.length) {
      delete event.fingerprint;
    }
  }

  /**
   * Applies the current context and fingerprint to the event.
   * Note that breadcrumbs will be added by the client.
   * Also if the event has already breadcrumbs on it, we do not merge them.
   * @param event Event
   * @param hint May contain additional information about the original exception.
   * @hidden
   */
  function applyToEvent(event: Event, hint?: EventHint): PromiseLike<Event | null> {
    if (_extra && Object.keys(_extra).length) {
      event.extra = { ..._extra, ...event.extra };
    }
    if (_tags && Object.keys(_tags).length) {
      event.tags = { ..._tags, ...event.tags };
    }
    if (_user && Object.keys(_user).length) {
      event.user = { ..._user, ...event.user };
    }
    if (_contexts && Object.keys(_contexts).length) {
      event.contexts = { ..._contexts, ...event.contexts };
    }
    if (_level) {
      event.level = _level;
    }
    if (_transactionName) {
      event.transaction = _transactionName;
    }
    // We want to set the trace context for normal events only if there isn't already
    // a trace context on the event. There is a product feature in place where we link
    // errors with transaction and it relies on that.
    if (_span) {
      event.contexts = { trace: _span.getTraceContext(), ...event.contexts };
      const transactionName = _span.transaction && _span.transaction.name;
      if (transactionName) {
        event.tags = { transaction: transactionName, ...event.tags };
      }
    }

    _applyFingerprint(event);

    event.breadcrumbs = [...(event.breadcrumbs || []), ..._breadcrumbs];
    event.breadcrumbs = event.breadcrumbs.length > 0 ? event.breadcrumbs : undefined;

    return _notifyEventProcessors([...getGlobalEventProcessors(), ..._eventProcessors], event, hint);
  }

  /**
   * This will be called on every set call.
   */
  function _notifyScopeListeners(): void {
    // We need this check for this._notifyingListeners to be able to work on scope during updates
    // If this check is not here we'll produce endless recursion when something is done with the scope
    // during the callback.
    if (!_notifyingListeners) {
      _notifyingListeners = true;
      _scopeListeners.forEach(callback => {
        callback(scope);
      });
      _notifyingListeners = false;
    }
  }

  /**
   * This will be called after {@link applyToEvent} is finished.
   */
  function _notifyEventProcessors(
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
            .then(final => _notifyEventProcessors(processors, final, hint, index + 1).then(resolve))
            .then(null, reject);
        } else {
          void _notifyEventProcessors(processors, result, hint, index + 1)
            .then(resolve)
            .then(null, reject);
        }
      }
    });
  }

  return scope;
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
