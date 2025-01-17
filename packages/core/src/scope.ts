/* eslint-disable max-lines */
import type { Client } from './client';
import { updateSession } from './session';
import type {
  Attachment,
  Breadcrumb,
  Context,
  Contexts,
  DynamicSamplingContext,
  Event,
  EventHint,
  EventProcessor,
  Extra,
  Extras,
  Primitive,
  PropagationContext,
  RequestEventData,
  Session,
  SeverityLevel,
  Span,
  User,
} from './types-hoist';
import { isPlainObject } from './utils-hoist/is';
import { logger } from './utils-hoist/logger';
import { uuid4 } from './utils-hoist/misc';
import { generateTraceId } from './utils-hoist/propagationContext';
import { dateTimestampInSeconds } from './utils-hoist/time';
import { merge } from './utils/merge';
import { _getSpanForScope, _setSpanForScope } from './utils/spanOnScope';

/**
 * Default value for maximum number of breadcrumbs added to an event.
 */
const DEFAULT_MAX_BREADCRUMBS = 100;

/**
 * A context to be used for capturing an event.
 * This can either be a Scope, or a partial ScopeContext,
 * or a callback that receives the current scope and returns a new scope to use.
 */
export type CaptureContext = Scope | Partial<ScopeContext> | ((scope: Scope) => Scope);

/**
 * Data that can be converted to a Scope.
 */
export interface ScopeContext {
  user: User;
  level: SeverityLevel;
  extra: Extras;
  contexts: Contexts;
  tags: { [key: string]: Primitive };
  fingerprint: string[];
  propagationContext: PropagationContext;
}

// TODO(v9): Add `normalizedRequest`
export interface SdkProcessingMetadata {
  [key: string]: unknown;
  requestSession?: {
    status: 'ok' | 'errored' | 'crashed';
  };
  normalizedRequest?: RequestEventData;
  dynamicSamplingContext?: Partial<DynamicSamplingContext>;
  capturedSpanScope?: Scope;
  capturedSpanIsolationScope?: Scope;
  spanCountBeforeProcessing?: number;
  ipAddress?: string;
}

/**
 * Normalized data of the Scope, ready to be used.
 */
export interface ScopeData {
  eventProcessors: EventProcessor[];
  breadcrumbs: Breadcrumb[];
  user: User;
  tags: { [key: string]: Primitive };
  extra: Extras;
  contexts: Contexts;
  attachments: Attachment[];
  propagationContext: PropagationContext;
  sdkProcessingMetadata: SdkProcessingMetadata;
  fingerprint: string[];
  level?: SeverityLevel;
  transactionName?: string;
  span?: Span;
}

/**
 * Holds additional event information.
 */
export class Scope {
  /** Flag if notifying is happening. */
  protected _notifyingListeners: boolean;

  /** Callback for client to receive scope changes. */
  protected _scopeListeners: Array<(scope: Scope) => void>;

  /** Callback list that will be called during event processing. */
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
  protected _sdkProcessingMetadata: SdkProcessingMetadata;

  /** Fingerprint */
  protected _fingerprint?: string[];

  /** Severity */
  protected _level?: SeverityLevel;

  /**
   * Transaction Name
   *
   * IMPORTANT: The transaction name on the scope has nothing to do with root spans/transaction objects.
   * It's purpose is to assign a transaction to the scope that's added to non-transaction events.
   */
  protected _transactionName?: string;

  /** Session */
  protected _session?: Session;

  /** The client on this scope */
  protected _client?: Client;

  /** Contains the last event id of a captured event.  */
  protected _lastEventId?: string;

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
    this._propagationContext = {
      traceId: generateTraceId(),
      sampleRand: Math.random(),
    };
  }

  /**
   * Clone all data from this scope into a new scope.
   */
  public clone(): Scope {
    const newScope = new Scope();
    newScope._breadcrumbs = [...this._breadcrumbs];
    newScope._tags = { ...this._tags };
    newScope._extra = { ...this._extra };
    newScope._contexts = { ...this._contexts };
    if (this._contexts.flags) {
      // We need to copy the `values` array so insertions on a cloned scope
      // won't affect the original array.
      newScope._contexts.flags = {
        values: [...this._contexts.flags.values],
      };
    }

    newScope._user = this._user;
    newScope._level = this._level;
    newScope._session = this._session;
    newScope._transactionName = this._transactionName;
    newScope._fingerprint = this._fingerprint;
    newScope._eventProcessors = [...this._eventProcessors];
    newScope._attachments = [...this._attachments];
    newScope._sdkProcessingMetadata = { ...this._sdkProcessingMetadata };
    newScope._propagationContext = { ...this._propagationContext };
    newScope._client = this._client;
    newScope._lastEventId = this._lastEventId;

    _setSpanForScope(newScope, _getSpanForScope(this));

    return newScope;
  }

  /**
   * Update the client assigned to this scope.
   * Note that not every scope will have a client assigned - isolation scopes & the global scope will generally not have a client,
   * as well as manually created scopes.
   */
  public setClient(client: Client | undefined): void {
    this._client = client;
  }

  /**
   * Set the ID of the last captured error event.
   * This is generally only captured on the isolation scope.
   */
  public setLastEventId(lastEventId: string | undefined): void {
    this._lastEventId = lastEventId;
  }

  /**
   * Get the client assigned to this scope.
   */
  public getClient<C extends Client>(): C | undefined {
    return this._client as C | undefined;
  }

  /**
   * Get the ID of the last captured error event.
   * This is generally only available on the isolation scope.
   */
  public lastEventId(): string | undefined {
    return this._lastEventId;
  }

  /**
   * @inheritDoc
   */
  public addScopeListener(callback: (scope: Scope) => void): void {
    this._scopeListeners.push(callback);
  }

  /**
   * Add an event processor that will be called before an event is sent.
   */
  public addEventProcessor(callback: EventProcessor): this {
    this._eventProcessors.push(callback);
    return this;
  }

  /**
   * Set the user for this scope.
   * Set to `null` to unset the user.
   */
  public setUser(user: User | null): this {
    // If null is passed we want to unset everything, but still define keys,
    // so that later down in the pipeline any existing values are cleared.
    this._user = user || {
      email: undefined,
      id: undefined,
      ip_address: undefined,
      username: undefined,
    };

    if (this._session) {
      updateSession(this._session, { user });
    }

    this._notifyScopeListeners();
    return this;
  }

  /**
   * Get the user from this scope.
   */
  public getUser(): User | undefined {
    return this._user;
  }

  /**
   * Set an object that will be merged into existing tags on the scope,
   * and will be sent as tags data with the event.
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
   * Set a single tag that will be sent as tags data with the event.
   */
  public setTag(key: string, value: Primitive): this {
    this._tags = { ...this._tags, [key]: value };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Set an object that will be merged into existing extra on the scope,
   * and will be sent as extra data with the event.
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
   * Set a single key:value extra entry that will be sent as extra data with the event.
   */
  public setExtra(key: string, extra: Extra): this {
    this._extra = { ...this._extra, [key]: extra };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param {string[]} fingerprint Fingerprint to group events in Sentry.
   */
  public setFingerprint(fingerprint: string[]): this {
    this._fingerprint = fingerprint;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Sets the level on the scope for future events.
   */
  public setLevel(level: SeverityLevel): this {
    this._level = level;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Sets the transaction name on the scope so that the name of e.g. taken server route or
   * the page location is attached to future events.
   *
   * IMPORTANT: Calling this function does NOT change the name of the currently active
   * root span. If you want to change the name of the active root span, use
   * `Sentry.updateSpanName(rootSpan, 'new name')` instead.
   *
   * By default, the SDK updates the scope's transaction name automatically on sensible
   * occasions, such as a page navigation or when handling a new request on the server.
   */
  public setTransactionName(name?: string): this {
    this._transactionName = name;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Sets context data with the given name.
   * Data passed as context will be normalized. You can also pass `null` to unset the context.
   * Note that context data will not be merged - calling `setContext` will overwrite an existing context with the same key.
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
   * Set the session for the scope.
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
   * Get the session from the scope.
   */
  public getSession(): Session | undefined {
    return this._session;
  }

  /**
   * Updates the scope with provided data. Can work in three variations:
   * - plain object containing updatable attributes
   * - Scope instance that'll extract the attributes from
   * - callback function that'll receive the current scope as an argument and allow for modifications
   */
  public update(captureContext?: CaptureContext): this {
    if (!captureContext) {
      return this;
    }

    const scopeToMerge = typeof captureContext === 'function' ? captureContext(this) : captureContext;

    const scopeInstance =
      scopeToMerge instanceof Scope
        ? scopeToMerge.getScopeData()
        : isPlainObject(scopeToMerge)
          ? (captureContext as ScopeContext)
          : undefined;

    const { tags, extra, user, contexts, level, fingerprint = [], propagationContext } = scopeInstance || {};

    this._tags = { ...this._tags, ...tags };
    this._extra = { ...this._extra, ...extra };
    this._contexts = { ...this._contexts, ...contexts };

    if (user && Object.keys(user).length) {
      this._user = user;
    }

    if (level) {
      this._level = level;
    }

    if (fingerprint.length) {
      this._fingerprint = fingerprint;
    }

    if (propagationContext) {
      this._propagationContext = propagationContext;
    }

    return this;
  }

  /**
   * Clears the current scope and resets its properties.
   * Note: The client will not be cleared.
   */
  public clear(): this {
    // client is not cleared here on purpose!
    this._breadcrumbs = [];
    this._tags = {};
    this._extra = {};
    this._user = {};
    this._contexts = {};
    this._level = undefined;
    this._transactionName = undefined;
    this._fingerprint = undefined;
    this._session = undefined;
    _setSpanForScope(this, undefined);
    this._attachments = [];
    this.setPropagationContext({ traceId: generateTraceId(), sampleRand: Math.random() });

    this._notifyScopeListeners();
    return this;
  }

  /**
   * Adds a breadcrumb to the scope.
   * By default, the last 100 breadcrumbs are kept.
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
   * Get the last breadcrumb of the scope.
   */
  public getLastBreadcrumb(): Breadcrumb | undefined {
    return this._breadcrumbs[this._breadcrumbs.length - 1];
  }

  /**
   * Clear all breadcrumbs from the scope.
   */
  public clearBreadcrumbs(): this {
    this._breadcrumbs = [];
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Add an attachment to the scope.
   */
  public addAttachment(attachment: Attachment): this {
    this._attachments.push(attachment);
    return this;
  }

  /**
   * Clear all attachments from the scope.
   */
  public clearAttachments(): this {
    this._attachments = [];
    return this;
  }

  /**
   * Get the data of this scope, which should be applied to an event during processing.
   */
  public getScopeData(): ScopeData {
    return {
      breadcrumbs: this._breadcrumbs,
      attachments: this._attachments,
      contexts: this._contexts,
      tags: this._tags,
      extra: this._extra,
      user: this._user,
      level: this._level,
      fingerprint: this._fingerprint || [],
      eventProcessors: this._eventProcessors,
      propagationContext: this._propagationContext,
      sdkProcessingMetadata: this._sdkProcessingMetadata,
      transactionName: this._transactionName,
      span: _getSpanForScope(this),
    };
  }

  /**
   * Add data which will be accessible during event processing but won't get sent to Sentry.
   */
  public setSDKProcessingMetadata(newData: SdkProcessingMetadata): this {
    this._sdkProcessingMetadata = merge(this._sdkProcessingMetadata, newData, 2);
    return this;
  }

  /**
   * Add propagation context to the scope, used for distributed tracing
   */
  public setPropagationContext(context: PropagationContext): this {
    this._propagationContext = context;
    return this;
  }

  /**
   * Get propagation context from the scope, used for distributed tracing
   */
  public getPropagationContext(): PropagationContext {
    return this._propagationContext;
  }

  /**
   * Capture an exception for this scope.
   *
   * @returns {string} The id of the captured Sentry event.
   */
  public captureException(exception: unknown, hint?: EventHint): string {
    const eventId = hint?.event_id || uuid4();

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
   * @returns {string} The id of the captured message.
   */
  public captureMessage(message: string, level?: SeverityLevel, hint?: EventHint): string {
    const eventId = hint?.event_id || uuid4();

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
   * Capture a Sentry event for this scope.
   *
   * @returns {string} The id of the captured event.
   */
  public captureEvent(event: Event, hint?: EventHint): string {
    const eventId = hint?.event_id || uuid4();

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
