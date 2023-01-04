/* eslint-disable max-lines */
import type {
  Attachment,
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
  Session,
  Severity,
  SeverityLevel,
  Span,
  Transaction,
  User,
} from '@sentry/types';
import {
  arrayify,
  dateTimestampInSeconds,
  getGlobalSingleton,
  isPlainObject,
  isThenable,
  logger,
  SyncPromise,
} from '@sentry/utils';

import { updateSession } from './session';

/**
 * Default value for maximum number of breadcrumbs added to an event.
 */
const DEFAULT_MAX_BREADCRUMBS = 100;

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export class Scope implements ScopeInterface {
  /** Flag if notifying is happening. */
  protected _notifyingListeners: boolean;

  /** Callback for client to receive scope changes. */
  protected _scopeListeners: Array<(scope: Scope) => void>;

  /** Callback list that will be called after {@link applyToEvent}. */
  protected _eventProcessors: EventProcessor[];

  /** Array of breadcrumbs. */
  protected _breadcrumbs: Breadcrumb[];

  /** User */
  protected _user: User;

  /** Tags */
  protected _tags: { [key: string]: Primitive };

  /** Extra */
  protected _extra: Extras;

  /** Contexts */
  protected _contexts: Contexts;

  /** Attachments */
  protected _attachments: Attachment[];

  /**
   * A place to stash data which is needed at some point in the SDK's event processing pipeline but which shouldn't get
   * sent to Sentry
   */
  protected _sdkProcessingMetadata: { [key: string]: unknown };

  /** Fingerprint */
  protected _fingerprint?: string[];

  /** Severity */
  // eslint-disable-next-line deprecation/deprecation
  protected _level?: Severity | SeverityLevel;

  /** Transaction Name */
  protected _transactionName?: string;

  /** Span */
  protected _span?: Span;

  /** Session */
  protected _session?: Session;

  /** Request Mode Session Status */
  protected _requestSession?: RequestSession;

  // NOTE: Any field which gets added here should get added not only to the constructor but also to the `clone` method.

  public constructor() {
    this._notifyingListeners = false;
    this._scopeListeners = [];
    this._eventProcessors = [];
    this._breadcrumbs = [];
    this._attachments = [];
    this._user = {};
    this._tags = {};
    this._extra = {};
    this._contexts = {};
    this._sdkProcessingMetadata = {};
  }

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
      newScope._attachments = [...scope._attachments];
      newScope._sdkProcessingMetadata = { ...scope._sdkProcessingMetadata };
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
      updateSession(this._session, { user });
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
  public setLevel(
    // eslint-disable-next-line deprecation/deprecation
    level: Severity | SeverityLevel,
  ): this {
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
   * @inheritDoc
   */
  public setContext(key: string, context: Context | null): this {
    if (context === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this._contexts[key];
    } else {
      this._contexts[key] = context;
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
    // Often, this span (if it exists at all) will be a transaction, but it's not guaranteed to be. Regardless, it will
    // have a pointer to the currently-active transaction.
    const span = this.getSpan();
    return span && span.transaction;
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
    this._attachments = [];
    return this;
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    const maxCrumbs = typeof maxBreadcrumbs === 'number' ? maxBreadcrumbs : DEFAULT_MAX_BREADCRUMBS;

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
  public getLastBreadcrumb(): Breadcrumb | undefined {
    return this._breadcrumbs[this._breadcrumbs.length - 1];
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
   * @inheritDoc
   */
  public addAttachment(attachment: Attachment): this {
    this._attachments.push(attachment);
    return this;
  }

  /**
   * @inheritDoc
   */
  public getAttachments(): Attachment[] {
    return this._attachments;
  }

  /**
   * @inheritDoc
   */
  public clearAttachments(): this {
    this._attachments = [];
    return this;
  }

  /**
   * Applies data from the scope to the event and runs all event processors on it.
   *
   * @param event Event
   * @param hint Object containing additional information about the original exception, for use by the event processors.
   * @hidden
   */
  public applyToEvent(event: Event, hint: EventHint = {}): PromiseLike<Event | null> {
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
    // errors with transaction and it relies on that.
    if (this._span) {
      event.contexts = { trace: this._span.getTraceContext(), ...event.contexts };
      const transactionName = this._span.transaction && this._span.transaction.name;
      if (transactionName) {
        event.tags = { transaction: transactionName, ...event.tags };
      }
    }

    this._applyFingerprint(event);

    event.breadcrumbs = [...(event.breadcrumbs || []), ...this._breadcrumbs];
    event.breadcrumbs = event.breadcrumbs.length > 0 ? event.breadcrumbs : undefined;

    event.sdkProcessingMetadata = { ...event.sdkProcessingMetadata, ...this._sdkProcessingMetadata };

    return this._notifyEventProcessors([...getGlobalEventProcessors(), ...this._eventProcessors], event, hint);
  }

  /**
   * Add data which will be accessible during event processing but won't get sent to Sentry
   */
  public setSDKProcessingMetadata(newData: { [key: string]: unknown }): this {
    this._sdkProcessingMetadata = { ...this._sdkProcessingMetadata, ...newData };

    return this;
  }

  /**
   * This will be called after {@link applyToEvent} is finished.
   */
  protected _notifyEventProcessors(
    processors: EventProcessor[],
    event: Event | null,
    hint: EventHint,
    index: number = 0,
  ): PromiseLike<Event | null> {
    return new SyncPromise<Event | null>((resolve, reject) => {
      const processor = processors[index];
      if (event === null || typeof processor !== 'function') {
        resolve(event);
      } else {
        const result = processor({ ...event }, hint) as Event | null;

        __DEBUG_BUILD__ &&
          processor.id &&
          result === null &&
          logger.log(`Event processor "${processor.id}" dropped event`);

        if (isThenable(result)) {
          void result
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
    event.fingerprint = event.fingerprint ? arrayify(event.fingerprint) : [];

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
 * Returns the global event processors.
 */
function getGlobalEventProcessors(): EventProcessor[] {
  return getGlobalSingleton<EventProcessor[]>('globalEventProcessors', () => []);
}

/**
 * Add a EventProcessor to be kept globally.
 * @param callback EventProcessor to add
 */
export function addGlobalEventProcessor(callback: EventProcessor): void {
  getGlobalEventProcessors().push(callback);
}
