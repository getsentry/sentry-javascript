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
  Severity,
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
export class Scope implements ScopeInterface {
  /** Flag if notifiying is happening. */
  protected _notifyingListeners: boolean = false;

  /** Callback for client to receive scope changes. */
  protected _scopeListeners: Array<(scope: Scope) => void> = [];

  /** Callback list that will be called after {@link applyToEvent}. */
  protected _eventProcessors: EventProcessor[] = [];

  /** Array of breadcrumbs. */
  protected _breadcrumbs: Breadcrumb[] = [];

  /** User */
  protected _user: User = {};

  /** Tags */
  protected _tags: { [key: string]: Primitive } = {};

  /** Extra */
  protected _extra: Extras = {};

  /** Contexts */
  protected _contexts: Contexts = {};

  /** Fingerprint */
  protected _fingerprint?: string[];

  /** Severity */
  protected _level?: Severity;

  /** Transaction Name */
  protected _transactionName?: string;

  /** Span */
  protected _span?: Span;

  /** Session */
  protected _session?: Session;

  /** Request Mode Session Status */
  protected _requestSession?: RequestSession;

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  public static clone(scope?: Scope): Scope {
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
   * Add internal on change listener. Used for sub SDKs that need to store the scope.
   * @hidden
   */
  public addScopeListener(callback: (scope: Scope) => void): void {
    this._scopeListeners.push(callback);
  }

  /**
   * @inheritDoc
   */
  public addEventProcessor(callback: EventProcessor): this {
    this._eventProcessors.push(callback);
    return this;
  }

  /**
   * @inheritDoc
   */
  public setUser(user: User | null): this {
    this._user = user || {};
    if (this._session) {
      this._session.update({ user });
    }
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public getUser(): User | undefined {
    return this._user;
  }

  /**
   * @inheritDoc
   */
  public getRequestSession(): RequestSession | undefined {
    return this._requestSession;
  }

  /**
   * @inheritDoc
   */
  public setRequestSession(requestSession?: RequestSession): this {
    this._requestSession = requestSession;
    return this;
  }

  /**
   * @inheritDoc
   */
  public setTags(tags: { [key: string]: Primitive }): this {
    this._tags = {
      ...this._tags,
      ...tags,
    };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: Primitive): this {
    this._tags = { ...this._tags, [key]: value };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setExtras(extras: Extras): this {
    this._extra = {
      ...this._extra,
      ...extras,
    };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setExtra(key: string, extra: Extra): this {
    this._extra = { ...this._extra, [key]: extra };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setFingerprint(fingerprint: string[]): this {
    this._fingerprint = fingerprint;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setLevel(level: Severity): this {
    this._level = level;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setTransactionName(name?: string): this {
    this._transactionName = name;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Can be removed in major version.
   * @deprecated in favor of {@link this.setTransactionName}
   */
  public setTransaction(name?: string): this {
    return this.setTransactionName(name);
  }

  /**
   * @inheritDoc
   */
  public setContext(key: string, context: Context | null): this {
    if (context === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this._contexts[key];
    } else {
      this._contexts = { ...this._contexts, [key]: context };
    }

    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public setSpan(span?: Span): this {
    this._span = span;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public getSpan(): Span | undefined {
    return this._span;
  }

  /**
   * @inheritDoc
   */
  public getTransaction(): Transaction | undefined {
    // often, this span will be a transaction, but it's not guaranteed to be
    const span = this.getSpan() as undefined | (Span & { spanRecorder: { spans: Span[] } });

    // try it the new way first
    if (span?.transaction) {
      return span?.transaction;
    }

    // fallback to the old way (known bug: this only finds transactions with sampled = true)
    if (span?.spanRecorder?.spans[0]) {
      return span.spanRecorder.spans[0] as Transaction;
    }

    // neither way found a transaction
    return undefined;
  }

  /**
   * @inheritDoc
   */
  public setSession(session?: Session): this {
    if (!session) {
      delete this._session;
    } else {
      this._session = session;
    }
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public getSession(): Session | undefined {
    return this._session;
  }

  /**
   * @inheritDoc
   */
  public update(captureContext?: CaptureContext): this {
    if (!captureContext) {
      return this;
    }

    if (typeof captureContext === 'function') {
      const updatedScope = (captureContext as <T>(scope: T) => T)(this);
      return updatedScope instanceof Scope ? updatedScope : this;
    }

    if (captureContext instanceof Scope) {
      this._tags = { ...this._tags, ...captureContext._tags };
      this._extra = { ...this._extra, ...captureContext._extra };
      this._contexts = { ...this._contexts, ...captureContext._contexts };
      if (captureContext._user && Object.keys(captureContext._user).length) {
        this._user = captureContext._user;
      }
      if (captureContext._level) {
        this._level = captureContext._level;
      }
      if (captureContext._fingerprint) {
        this._fingerprint = captureContext._fingerprint;
      }
      if (captureContext._requestSession) {
        this._requestSession = captureContext._requestSession;
      }
    } else if (isPlainObject(captureContext)) {
      // eslint-disable-next-line no-param-reassign
      captureContext = captureContext as ScopeContext;
      this._tags = { ...this._tags, ...captureContext.tags };
      this._extra = { ...this._extra, ...captureContext.extra };
      this._contexts = { ...this._contexts, ...captureContext.contexts };
      if (captureContext.user) {
        this._user = captureContext.user;
      }
      if (captureContext.level) {
        this._level = captureContext.level;
      }
      if (captureContext.fingerprint) {
        this._fingerprint = captureContext.fingerprint;
      }
      if (captureContext.requestSession) {
        this._requestSession = captureContext.requestSession;
      }
    }

    return this;
  }

  /**
   * @inheritDoc
   */
  public clear(): this {
    this._breadcrumbs = [];
    this._tags = {};
    this._extra = {};
    this._user = {};
    this._contexts = {};
    this._level = undefined;
    this._transactionName = undefined;
    this._fingerprint = undefined;
    this._requestSession = undefined;
    this._span = undefined;
    this._session = undefined;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    const maxCrumbs = typeof maxBreadcrumbs === 'number' ? Math.min(maxBreadcrumbs, MAX_BREADCRUMBS) : MAX_BREADCRUMBS;

    // No data has been changed, so don't notify scope listeners
    if (maxCrumbs <= 0) {
      return this;
    }

    const mergedBreadcrumb = {
      timestamp: dateTimestampInSeconds(),
      ...breadcrumb,
    };
    this._breadcrumbs = [...this._breadcrumbs, mergedBreadcrumb].slice(-maxCrumbs);
    this._notifyScopeListeners();

    return this;
  }

  /**
   * @inheritDoc
   */
  public clearBreadcrumbs(): this {
    this._breadcrumbs = [];
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Applies the current context and fingerprint to the event.
   * Note that breadcrumbs will be added by the client.
   * Also if the event has already breadcrumbs on it, we do not merge them.
   * @param event Event
   * @param hint May contain additional informartion about the original exception.
   * @hidden
   */
  public applyToEvent(event: Event, hint?: EventHint): PromiseLike<Event | null> {
    if (this._extra && Object.keys(this._extra).length) {
      event.extra = { ...this._extra, ...event.extra };
    }
    if (this._tags && Object.keys(this._tags).length) {
      event.tags = { ...this._tags, ...event.tags };
    }
    if (this._user && Object.keys(this._user).length) {
      event.user = { ...this._user, ...event.user };
    }
    if (this._contexts && Object.keys(this._contexts).length) {
      event.contexts = { ...this._contexts, ...event.contexts };
    }
    if (this._level) {
      event.level = this._level;
    }
    if (this._transactionName) {
      event.transaction = this._transactionName;
    }
    // We want to set the trace context for normal events only if there isn't already
    // a trace context on the event. There is a product feature in place where we link
    // errors with transaction and it relys on that.
    if (this._span) {
      event.contexts = { trace: this._span.getTraceContext(), ...event.contexts };
      const transactionName = this._span.transaction?.name;
      if (transactionName) {
        event.tags = { transaction: transactionName, ...event.tags };
      }
    }

    this._applyFingerprint(event);

    event.breadcrumbs = [...(event.breadcrumbs || []), ...this._breadcrumbs];
    event.breadcrumbs = event.breadcrumbs.length > 0 ? event.breadcrumbs : undefined;

    return this._notifyEventProcessors([...getGlobalEventProcessors(), ...this._eventProcessors], event, hint);
  }

  /**
   * This will be called after {@link applyToEvent} is finished.
   */
  protected _notifyEventProcessors(
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
            .then(final => this._notifyEventProcessors(processors, final, hint, index + 1).then(resolve))
            .then(null, reject);
        } else {
          void this._notifyEventProcessors(processors, result, hint, index + 1)
            .then(resolve)
            .then(null, reject);
        }
      }
    });
  }

  /**
   * This will be called on every set call.
   */
  protected _notifyScopeListeners(): void {
    // We need this check for this._notifyingListeners to be able to work on scope during updates
    // If this check is not here we'll produce endless recursion when something is done with the scope
    // during the callback.
    if (!this._notifyingListeners) {
      this._notifyingListeners = true;
      this._scopeListeners.forEach(callback => {
        callback(this);
      });
      this._notifyingListeners = false;
    }
  }

  /**
   * Applies fingerprint from the scope to the event if there's one,
   * uses message if there's one instead or get rid of empty fingerprint
   */
  private _applyFingerprint(event: Event): void {
    // Make sure it's an array first and we actually have something in place
    event.fingerprint = event.fingerprint
      ? Array.isArray(event.fingerprint)
        ? event.fingerprint
        : [event.fingerprint]
      : [];

    // If we have something on the scope, then merge it with event
    if (this._fingerprint) {
      event.fingerprint = event.fingerprint.concat(this._fingerprint);
    }

    // If we have no data at all, remove empty array default
    if (event.fingerprint && !event.fingerprint.length) {
      delete event.fingerprint;
    }
  }
}

/**
 * Retruns the global event processors.
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
