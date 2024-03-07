/* eslint-disable max-lines */
import type {
  Attachment,
  Breadcrumb,
  CaptureContext,
  Client,
  Context,
  Contexts,
  Event,
  EventHint,
  EventProcessor,
  Extra,
  Extras,
  Primitive,
  PropagationContext,
  RequestSession,
  Scope as ScopeInterface,
  ScopeContext,
  ScopeData,
  Session,
  Severity,
  SeverityLevel,
  Span,
  Transaction,
  User,
} from '@sentry/types';
import { dateTimestampInSeconds, isPlainObject, logger, uuid4 } from '@sentry/utils';

import { getGlobalEventProcessors, notifyEventProcessors } from './eventProcessors';
import { updateSession } from './session';
import { applyScopeDataToEvent } from './utils/applyScopeDataToEvent';

/**
 * Default value for maximum number of breadcrumbs added to an event.
 */
const DEFAULT_MAX_BREADCRUMBS = 100;

/**
 * The global scope is kept in this module.
 * When accessing this via `getGlobalScope()` we'll make sure to set one if none is currently present.
 */
let globalScope: ScopeInterface | undefined;

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

  /** Propagation Context for distributed tracing */
  protected _propagationContext: PropagationContext;

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

  /**
   * Transaction Name
   */
  protected _transactionName?: string;

  /** Span */
  protected _span?: Span;

  /** Session */
  protected _session?: Session;

  /** Request Mode Session Status */
  protected _requestSession?: RequestSession;

  /** The client on this scope */
  protected _client?: Client;

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
    this._propagationContext = generatePropagationContext();
  }

  /**
   * Inherit values from the parent scope.
   * @deprecated Use `scope.clone()` and `new Scope()` instead.
   */
  public static clone(scope?: Scope): Scope {
    return scope ? scope.clone() : new Scope();
  }

  /**
   * Clone this scope instance.
   */
  public clone(): Scope {
    const newScope = new Scope();
    newScope._breadcrumbs = [...this._breadcrumbs];
    newScope._tags = { ...this._tags };
    newScope._extra = { ...this._extra };
    newScope._contexts = { ...this._contexts };
    newScope._user = this._user;
    newScope._level = this._level;
    newScope._span = this._span;
    newScope._session = this._session;
    newScope._transactionName = this._transactionName;
    newScope._fingerprint = this._fingerprint;
    newScope._eventProcessors = [...this._eventProcessors];
    newScope._requestSession = this._requestSession;
    newScope._attachments = [...this._attachments];
    newScope._sdkProcessingMetadata = { ...this._sdkProcessingMetadata };
    newScope._propagationContext = { ...this._propagationContext };
    newScope._client = this._client;

    return newScope;
  }

  /** Update the client on the scope. */
  public setClient(client: Client | undefined): void {
    this._client = client;
  }

  /**
   * Get the client assigned to this scope.
   *
   * It is generally recommended to use the global function `Sentry.getClient()` instead, unless you know what you are doing.
   */
  public getClient(): Client | undefined {
    return this._client;
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
    // If null is passed we want to unset everything, but still define keys,
    // so that later down in the pipeline any existing values are cleared.
    this._user = user || {
      email: undefined,
      id: undefined,
      ip_address: undefined,
      segment: undefined,
      username: undefined,
    };

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
   * Sets the transaction name on the scope for future events.
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
   * Sets the Span on the scope.
   * @param span Span
   * @deprecated Instead of setting a span on a scope, use `startSpan()`/`startSpanManual()` instead.
   */
  public setSpan(span?: Span): this {
    this._span = span;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Returns the `Span` if there is one.
   * @deprecated Use `getActiveSpan()` instead.
   */
  public getSpan(): Span | undefined {
    return this._span;
  }

  /**
   * Returns the `Transaction` attached to the scope (if there is one).
   * @deprecated You should not rely on the transaction, but just use `startSpan()` APIs instead.
   */
  public getTransaction(): Transaction | undefined {
    // Often, this span (if it exists at all) will be a transaction, but it's not guaranteed to be. Regardless, it will
    // have a pointer to the currently-active transaction.
    const span = this._span;
    // Cannot replace with getRootSpan because getRootSpan returns a span, not a transaction
    // Also, this method will be removed anyway.
    // eslint-disable-next-line deprecation/deprecation
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

    const scopeToMerge = typeof captureContext === 'function' ? captureContext(this) : captureContext;

    if (scopeToMerge instanceof Scope) {
      const scopeData = scopeToMerge.getScopeData();

      this._tags = { ...this._tags, ...scopeData.tags };
      this._extra = { ...this._extra, ...scopeData.extra };
      this._contexts = { ...this._contexts, ...scopeData.contexts };
      if (scopeData.user && Object.keys(scopeData.user).length) {
        this._user = scopeData.user;
      }
      if (scopeData.level) {
        this._level = scopeData.level;
      }
      if (scopeData.fingerprint.length) {
        this._fingerprint = scopeData.fingerprint;
      }
      if (scopeToMerge.getRequestSession()) {
        this._requestSession = scopeToMerge.getRequestSession();
      }
      if (scopeData.propagationContext) {
        this._propagationContext = scopeData.propagationContext;
      }
    } else if (isPlainObject(scopeToMerge)) {
      const scopeContext = captureContext as ScopeContext;
      this._tags = { ...this._tags, ...scopeContext.tags };
      this._extra = { ...this._extra, ...scopeContext.extra };
      this._contexts = { ...this._contexts, ...scopeContext.contexts };
      if (scopeContext.user) {
        this._user = scopeContext.user;
      }
      if (scopeContext.level) {
        this._level = scopeContext.level;
      }
      if (scopeContext.fingerprint) {
        this._fingerprint = scopeContext.fingerprint;
      }
      if (scopeContext.requestSession) {
        this._requestSession = scopeContext.requestSession;
      }
      if (scopeContext.propagationContext) {
        this._propagationContext = scopeContext.propagationContext;
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
    this._propagationContext = generatePropagationContext();
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

    const breadcrumbs = this._breadcrumbs;
    breadcrumbs.push(mergedBreadcrumb);
    this._breadcrumbs = breadcrumbs.length > maxCrumbs ? breadcrumbs.slice(-maxCrumbs) : breadcrumbs;

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
   * @deprecated Use `getScopeData()` instead.
   */
  public getAttachments(): Attachment[] {
    const data = this.getScopeData();

    return data.attachments;
  }

  /**
   * @inheritDoc
   */
  public clearAttachments(): this {
    this._attachments = [];
    return this;
  }

  /** @inheritDoc */
  public getScopeData(): ScopeData {
    const {
      _breadcrumbs,
      _attachments,
      _contexts,
      _tags,
      _extra,
      _user,
      _level,
      _fingerprint,
      _eventProcessors,
      _propagationContext,
      _sdkProcessingMetadata,
      _transactionName,
      _span,
    } = this;

    return {
      breadcrumbs: _breadcrumbs,
      attachments: _attachments,
      contexts: _contexts,
      tags: _tags,
      extra: _extra,
      user: _user,
      level: _level,
      fingerprint: _fingerprint || [],
      eventProcessors: _eventProcessors,
      propagationContext: _propagationContext,
      sdkProcessingMetadata: _sdkProcessingMetadata,
      transactionName: _transactionName,
      span: _span,
    };
  }

  /**
   * Applies data from the scope to the event and runs all event processors on it.
   *
   * @param event Event
   * @param hint Object containing additional information about the original exception, for use by the event processors.
   * @hidden
   * @deprecated Use `applyScopeDataToEvent()` directly
   */
  public applyToEvent(
    event: Event,
    hint: EventHint = {},
    additionalEventProcessors: EventProcessor[] = [],
  ): PromiseLike<Event | null> {
    applyScopeDataToEvent(event, this.getScopeData());

    // TODO (v8): Update this order to be: Global > Client > Scope
    const eventProcessors: EventProcessor[] = [
      ...additionalEventProcessors,
      // eslint-disable-next-line deprecation/deprecation
      ...getGlobalEventProcessors(),
      ...this._eventProcessors,
    ];

    return notifyEventProcessors(eventProcessors, event, hint);
  }

  /**
   * Add data which will be accessible during event processing but won't get sent to Sentry
   */
  public setSDKProcessingMetadata(newData: { [key: string]: unknown }): this {
    this._sdkProcessingMetadata = { ...this._sdkProcessingMetadata, ...newData };

    return this;
  }

  /**
   * @inheritDoc
   */
  public setPropagationContext(context: PropagationContext): this {
    this._propagationContext = context;
    return this;
  }

  /**
   * @inheritDoc
   */
  public getPropagationContext(): PropagationContext {
    return this._propagationContext;
  }

  /**
   * Capture an exception for this scope.
   *
   * @param exception The exception to capture.
   * @param hint Optinal additional data to attach to the Sentry event.
   * @returns the id of the captured Sentry event.
   */
  public captureException(exception: unknown, hint?: EventHint): string {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();

    if (!this._client) {
      logger.warn('No client configured on scope - will not capture exception!');
      return eventId;
    }

    const syntheticException = new Error('Sentry syntheticException');

    this._client.captureException(
      exception,
      {
        originalException: exception,
        syntheticException,
        ...hint,
        event_id: eventId,
      },
      this,
    );

    return eventId;
  }

  /**
   * Capture a message for this scope.
   *
   * @param message The message to capture.
   * @param level An optional severity level to report the message with.
   * @param hint Optional additional data to attach to the Sentry event.
   * @returns the id of the captured message.
   */
  public captureMessage(message: string, level?: SeverityLevel, hint?: EventHint): string {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();

    if (!this._client) {
      logger.warn('No client configured on scope - will not capture message!');
      return eventId;
    }

    const syntheticException = new Error(message);

    this._client.captureMessage(
      message,
      level,
      {
        originalException: message,
        syntheticException,
        ...hint,
        event_id: eventId,
      },
      this,
    );

    return eventId;
  }

  /**
   * Captures a manually created event for this scope and sends it to Sentry.
   *
   * @param exception The event to capture.
   * @param hint Optional additional data to attach to the Sentry event.
   * @returns the id of the captured event.
   */
  public captureEvent(event: Event, hint?: EventHint): string {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();

    if (!this._client) {
      logger.warn('No client configured on scope - will not capture event!');
      return eventId;
    }

    this._client.captureEvent(event, { ...hint, event_id: eventId }, this);

    return eventId;
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
}

/**
 * Get the global scope.
 * This scope is applied to _all_ events.
 */
export function getGlobalScope(): ScopeInterface {
  if (!globalScope) {
    globalScope = new Scope();
  }

  return globalScope;
}

/**
 * This is mainly needed for tests.
 * DO NOT USE this, as this is an internal API and subject to change.
 * @hidden
 */
export function setGlobalScope(scope: ScopeInterface | undefined): void {
  globalScope = scope;
}

function generatePropagationContext(): PropagationContext {
  return {
    traceId: uuid4(),
    spanId: uuid4().substring(16),
  };
}
