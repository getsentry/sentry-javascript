/* eslint-disable max-lines */
import {
  Breadcrumb,
  CaptureContext,
  Context,
  Event,
  EventHint,
  EventProcessor,
  Extra,
  Primitive,
  Scope,
  ScopeContext,
  ScopeData,
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

  const scope: Scope = {
    addScopeListener,
    addEventProcessor,
    addTag,
    addExtra,
    addContext,
    getTag,
    getExtra,
    getContext,
    getTransaction,
    getProcessors,
    update,
    clear,
    addBreadcrumb,
    clearBreadcrumbs,
    applyToEvent,
    clone,
    getScopeData,
    setScopeData,
  };

  let scopeData: ScopeData = {
    breadcrumbs: [],
    tags: {},
    extras: {},
    contexts: {},
  };

  // eslint-disable-next-line complexity
  function setScopeData<K extends keyof Omit<ScopeData, 'breadcrumbs'>>(key: string, value: ScopeData[K]): Scope {
    switch (key) {
      case 'user': {
        scopeData.user = (value as User) || {};
        if (scopeData.session) {
          scopeData.session.update({ user: scopeData.user });
        }
        _notifyScopeListeners();
        break;
      }
      case 'tags':
      case 'extras': {
        scopeData[key] = {
          ...scopeData[key],
          // @ts-ignore
          ...value,
        };
        _notifyScopeListeners();
        break;
      }
      case 'contexts': {
        scopeData.contexts = value as Record<string, Context>;
        break;
      }

      case 'fingerprint':
      case 'level':
      case 'span':
      case 'transactionName':
      case 'requestSession': {
        // @ts-ignore
        scopeData[key] = value;
        _notifyScopeListeners();
        break;
      }
      case 'session': {
        scopeData.session = value ? (value as Session) : undefined;
        _notifyScopeListeners();
        break;
      }
    }

    return scope;
  }

  function getScopeData<K extends keyof ScopeData>(key: K): ScopeData[K] {
    return scopeData[key];
  }

  function getTransaction(): Transaction | undefined {
    const span = scopeData.span as undefined | (Span & { spanRecorder: { spans: Span[] } });

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

  function addTag(key: string, tag: Primitive): Scope {
    scopeData.tags[key] = tag;
    _notifyScopeListeners();
    return scope;
  }
  function getTag(key: string): Primitive | undefined {
    return scopeData.tags[key];
  }
  function addExtra(key: string, extra: Extra): Scope {
    scopeData.extras[key] = extra;
    _notifyScopeListeners();
    return scope;
  }
  function getExtra(key: string): Extra | undefined {
    return scopeData.extras[key];
  }
  function addContext(key: string, context: Context): Scope {
    if (context === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete scopeData.contexts[key];
    } else {
      scopeData.contexts = { ...scopeData.contexts, [key]: context };
    }

    _notifyScopeListeners();
    return scope;
  }
  function getContext(key: string): Context | undefined {
    return scopeData.contexts[key];
  }

  function getProcessors(): EventProcessor[] {
    return [..._eventProcessors];
  }

  /**
   * @inheritDoc
   */
  function clearBreadcrumbs(): Scope {
    scopeData.breadcrumbs = [];
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
      scopeData.tags = { ...scopeData.tags, ...captureContext.getScopeData('tags') };
      scopeData.extras = { ...scopeData.extras, ...captureContext.getScopeData('extras') };
      scopeData.contexts = { ...scopeData.contexts, ...captureContext.getScopeData('contexts') };

      if (captureContext.getScopeData('user')) {
        scopeData.user = captureContext.getScopeData('user');
      }
      if (captureContext.getScopeData('level')) {
        scopeData.level = captureContext.getScopeData('level');
      }
      if (captureContext.getScopeData('fingerprint')) {
        scopeData.fingerprint = captureContext.getScopeData('fingerprint');
      }
      if (captureContext.getScopeData('requestSession')) {
        scopeData.requestSession = captureContext.getScopeData('requestSession');
      }
    } else if (isPlainObject(captureContext)) {
      // eslint-disable-next-line no-param-reassign
      scopeData.tags = { ...scopeData.tags, ...captureContext.tags };
      scopeData.extras = { ...scopeData.extras, ...captureContext.extra };
      scopeData.contexts = { ...scopeData.contexts, ...captureContext.contexts };
      if (captureContext.user) {
        scopeData.user = captureContext.user;
      }
      if (captureContext.level) {
        scopeData.level = captureContext.level;
      }
      if (captureContext.fingerprint) {
        scopeData.fingerprint = captureContext.fingerprint;
      }
      if (captureContext.requestSession) {
        scopeData.requestSession = captureContext.requestSession;
      }
    }

    return scope;
  }

  /**
   * @inheritDoc
   */
  function clear(): Scope {
    scopeData = {
      breadcrumbs: [],
      tags: {},
      extras: {},
      contexts: {},
    };
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
    scopeData.breadcrumbs = [...scopeData.breadcrumbs, mergedBreadcrumb].slice(-maxCrumbs);
    _notifyScopeListeners();
    return scope;
  }

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  function clone(): Scope {
    const newScope = makeScope();

    newScope.setScopeData('tags', scope.getScopeData('tags'));
    newScope.setScopeData('extras', scope.getScopeData('extras'));
    newScope.setScopeData('contexts', scope.getScopeData('contexts'));
    newScope.setScopeData('user', scope.getScopeData('user'));

    if (scope.getScopeData('level')) {
      newScope.setScopeData('level', scope.getScopeData('level'));
    }
    newScope.setScopeData('span', scope.getScopeData('span'));
    newScope.setScopeData('session', scope.getScopeData('session'));
    newScope.setScopeData('transactionName', scope.getScopeData('transactionName'));

    if (scope.getScopeData('fingerprint')) {
      newScope.setScopeData('fingerprint', scope.getScopeData('fingerprint'));
    }

    for (const processor of scope.getProcessors()) {
      newScope.addEventProcessor(processor);
    }

    newScope.setScopeData('requestSession', scope.getScopeData('requestSession'));

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
    if (scopeData.fingerprint) {
      event.fingerprint = event.fingerprint.concat(scopeData.fingerprint);
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
    if (scopeData.extras && Object.keys(scopeData.extras).length) {
      event.extra = { ...scopeData.extras, ...event.extra };
    }
    if (scopeData.tags && Object.keys(scopeData.tags).length) {
      event.tags = { ...scopeData.tags, ...event.tags };
    }
    if (scopeData.user && Object.keys(scopeData.user).length) {
      event.user = { ...scopeData.user, ...event.user };
    }
    if (scopeData.contexts && Object.keys(scopeData.contexts).length) {
      event.contexts = { ...scopeData.contexts, ...event.contexts };
    }
    if (scopeData.level) {
      event.level = scopeData.level;
    }
    if (scopeData.transactionName) {
      event.transaction = scopeData.transactionName;
    }
    // We want to set the trace context for normal events only if there isn't already
    // a trace context on the event. There is a product feature in place where we link
    // errors with transaction and it relies on that.
    if (scopeData.span) {
      event.contexts = { trace: scopeData.span.getTraceContext(), ...event.contexts };
      const transactionName = scopeData.span.transaction && scopeData.span.transaction.name;
      if (transactionName) {
        event.tags = { transaction: transactionName, ...event.tags };
      }
    }

    _applyFingerprint(event);

    event.breadcrumbs = [...(event.breadcrumbs || []), ...scopeData.breadcrumbs];
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
