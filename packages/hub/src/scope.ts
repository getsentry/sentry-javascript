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
  Scope as ScopeInterface,
  ScopeContext,
  SeverityLevel,
  Span,
  Transaction,
  User,
} from '@sentry/types';
import { dateTimestampInSeconds, getGlobalObject, isPlainObject, isThenable, SyncPromise } from '@sentry/utils';

import { Session } from './session';

/**
 * Absolute maximum number of breadcrumbs added to an event.
 * The `maxBreadcrumbs` option cannot be higher than this value.
 */
const MAX_BREADCRUMBS = 100;

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */

const makeScope = (): ScopeInterface => {
  let _notifyingListeners: boolean = false;

  /** Callback for client to receive scope changes. */
  const _scopeListeners: Array<(scope: ScopeInterface) => void> = [];

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

  /**
   * @inheritDoc
   */
  function clearBreadcrumbs(): this {
    _breadcrumbs = [];
    _notifyScopeListeners();
    return this;
  }

  /**
   * Add internal on change listener. Used for sub SDKs that need to store the scope.
   * @hidden
   */
  function addScopeListener(callback: (scope: ScopeInterface) => void): void {
    _scopeListeners.push(callback);
  }

  /**
   * @inheritDoc
   */
  function addEventProcessor(callback: EventProcessor): this {
    _eventProcessors.push(callback);
    return this;
  }

  /**
   * @inheritDoc
   */
  function setUser(user: User | null): this {
    _user = user || {};
    if (_session) {
      _session.update({ user });
    }
    _notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  function getUser(): User | undefined {
    return _user;
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
  function setRequestSession(requestSession?: RequestSession): this {
    _requestSession = requestSession;
    return this;
  }

  /**
   * @inheritDoc
   */
  function setTags(tags: { [key: string]: Primitive }): this {
    _tags = {
      ..._tags,
      ...tags,
    };
    _notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  function setTag(key: string, value: Primitive): this {
    _tags = { ..._tags, [key]: value };
    _notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  function setExtras(extras: Extras): this {
    _extra = {
      ..._extra,
      ...extras,
    };
    _notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  function setExtra(key: string, extra: Extra): this {
    _extra = { ..._extra, [key]: extra };
    _notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  function setFingerprint(fingerprint: string[]): this {
    _fingerprint = fingerprint;
    _notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  function setLevel(level: SeverityLevel): this {
    _level = level;
    _notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  function setTransactionName(name?: string): this {
    _transactionName = name;
    _notifyScopeListeners();
    return this;
  }

  /**
   * Can be removed in major version.
   * @deprecated in favor of {@link setTransactionName}
   */
  function setTransaction(name?: string): this {
    return setTransactionName(name);
  }

  /**
   * @inheritDoc
   */
  function setContext(key: string, context: Context | null): this {
    if (context === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete _contexts[key];
    } else {
      _contexts = { ..._contexts, [key]: context };
    }

    _notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  function setSpan(span?: Span): this {
    _span = span;
    _notifyScopeListeners();
    return this;
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
  function setSession(session?: Session): this {
    if (!session) {
      _session = undefined;
    } else {
      _session = session;
    }
    _notifyScopeListeners();
    return this;
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
  function update(captureContext?: CaptureContext): this {
    if (!captureContext) {
      return this;
    }

    if (typeof captureContext === 'function') {
      const updatedScope = (captureContext as <T>(scope: T) => T)(this);
      return updatedScope instanceof Scope ? updatedScope : this;
    }

    if (captureContext instanceof Scope) {
      _tags = { ..._tags, ...captureContext._tags };
      _extra = { ..._extra, ...captureContext._extra };
      _contexts = { ..._contexts, ...captureContext._contexts };
      if (captureContext._user && Object.keys(captureContext._user).length) {
        _user = captureContext._user;
      }
      if (captureContext._level) {
        _level = captureContext._level;
      }
      if (captureContext._fingerprint) {
        _fingerprint = captureContext._fingerprint;
      }
      if (captureContext._requestSession) {
        _requestSession = captureContext._requestSession;
      }
    } else if (isPlainObject(captureContext)) {
      // eslint-disable-next-line no-param-reassign
      captureContext = captureContext as ScopeContext;
      _tags = { ..._tags, ...captureContext.tags };
      _extra = { ..._extra, ...captureContext.extra };
      _contexts = { ..._contexts, ...captureContext.contexts };
      if (captureContext.user) {
        _user = captureContext.user;
      }
      if (captureContext.level) {
        _level = captureContext.level;
      }
      if (captureContext.fingerprint) {
        _fingerprint = captureContext.fingerprint;
      }
      if (captureContext.requestSession) {
        _requestSession = captureContext.requestSession;
      }
    }

    return this;
  }

  /**
   * @inheritDoc
   */
  function clear(): this {
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
    return this;
  }

  /**
   * @inheritDoc
   */
  function addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    const maxCrumbs = typeof maxBreadcrumbs === 'number' ? Math.min(maxBreadcrumbs, MAX_BREADCRUMBS) : MAX_BREADCRUMBS;

    // No data has been changed, so don't notify scope listeners
    if (maxCrumbs <= 0) {
      return this;
    }

    const mergedBreadcrumb = {
      timestamp: dateTimestampInSeconds(),
      ...breadcrumb,
    };
    _breadcrumbs = [..._breadcrumbs, mergedBreadcrumb].slice(-maxCrumbs);
    _notifyScopeListeners();

    return this;
  }

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  function clone(scope?: ScopeInterface): ScopeInterface {
    const newScope = makeScope();
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
        callback(this);
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
};

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
