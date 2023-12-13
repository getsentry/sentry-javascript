import { notifyEventProcessors } from '@sentry/core';
import { OpenTelemetryScope } from '@sentry/opentelemetry';
import type {
  Attachment,
  Breadcrumb,
  Client,
  Event,
  EventHint,
  EventProcessor,
  Severity,
  SeverityLevel,
} from '@sentry/types';
import { uuid4 } from '@sentry/utils';

import { getGlobalCarrier } from './globals';
import type { CurrentScopes, Scope as ScopeInterface, ScopeData, SentryCarrier } from './types';

/** Get the current scope. */
export function getCurrentScope(): Scope {
  return getScopes().scope as Scope;
}

/**
 * Set the current scope on the execution context.
 * This should mostly only be called in Sentry.init()
 */
export function setCurrentScope(scope: Scope): void {
  getScopes().scope = scope;
}

/** Get the global scope. */
export function getGlobalScope(): Scope {
  const carrier = getGlobalCarrier();

  if (!carrier.globalScope) {
    carrier.globalScope = new Scope();
  }

  return carrier.globalScope as Scope;
}

/** Get the currently active isolation scope. */
export function getIsolationScope(): Scope {
  return getScopes().isolationScope as Scope;
}

/**
 * Set the currently active isolation scope.
 * Use this with caution! As it updates the isolation scope for the current execution context.
 */
export function setIsolationScope(isolationScope: Scope): void {
  getScopes().isolationScope = isolationScope;
}

/** Get the currently active client. */
export function getClient<C extends Client>(): C {
  const currentScope = getCurrentScope();
  const isolationScope = getIsolationScope();
  const globalScope = getGlobalScope();

  const client = currentScope.getClient() || isolationScope.getClient() || globalScope.getClient();
  if (client) {
    return client as C;
  }

  // TODO otherwise ensure we use a noop client
  return {} as C;
}

/** A fork of the classic scope with some otel specific stuff. */
export class Scope extends OpenTelemetryScope implements ScopeInterface {
  // Overwrite this if you want to use a specific isolation scope here
  public isolationScope: Scope | undefined;

  protected _client: Client | undefined;

  protected _lastEventId: string | undefined;

  /**
   * @inheritDoc
   */
  public clone(): Scope {
    const newScope = new Scope();
    newScope._breadcrumbs = [...this['_breadcrumbs']];
    newScope._tags = { ...this['_tags'] };
    newScope._extra = { ...this['_extra'] };
    newScope._contexts = { ...this['_contexts'] };
    newScope._user = this['_user'];
    newScope._level = this['_level'];
    newScope._span = this['_span'];
    newScope._session = this['_session'];
    newScope._transactionName = this['_transactionName'];
    newScope._fingerprint = this['_fingerprint'];
    newScope._eventProcessors = [...this['_eventProcessors']];
    newScope._requestSession = this['_requestSession'];
    newScope._attachments = [...this['_attachments']];
    newScope._sdkProcessingMetadata = { ...this['_sdkProcessingMetadata'] };
    newScope._propagationContext = { ...this['_propagationContext'] };

    return newScope;
  }

  /** Update the client on the scope. */
  public setClient(client: Client): void {
    this._client = client;
  }

  /**
   * Get the client assigned to this scope.
   * Should generally not be used by users - use top-level `Sentry.getClient()` instead!
   * @internal
   */
  public getClient(): Client | undefined {
    return this._client;
  }

  /** @inheritdoc */
  public getAttachments(): Attachment[] {
    const data = getGlobalScope().getScopeData();
    const isolationScopeData = this._getIsolationScope().getScopeData();
    const scopeData = this.getScopeData();

    // Merge data together, in order
    mergeData(data, isolationScopeData);
    mergeData(data, scopeData);

    return data.attachments;
  }

  /** Capture an exception for this scope. */
  public captureException(exception: unknown, hint?: EventHint): string {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
    const syntheticException = new Error('Sentry syntheticException');

    getClient().captureException(
      exception,
      {
        originalException: exception,
        syntheticException,
        ...hint,
        event_id: eventId,
      },
      this,
    );

    this._lastEventId = eventId;

    return eventId;
  }

  /** Capture a message for this scope. */
  public captureMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level?: Severity | SeverityLevel,
    hint?: EventHint,
  ): string {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
    const syntheticException = new Error(message);

    getClient().captureMessage(
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

    this._lastEventId = eventId;

    return eventId;
  }

  /** Capture a message for this scope. */
  public captureEvent(event: Event, hint?: EventHint): string {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
    if (!event.type) {
      this._lastEventId = eventId;
    }

    getClient().captureEvent(event, { ...hint, event_id: eventId }, this);

    return eventId;
  }

  /** Get the ID of the last sent error event. */
  public lastEventId(): string | undefined {
    return this._lastEventId;
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    return this._addBreadcrumb(breadcrumb, maxBreadcrumbs);
  }

  /** Get all relevant data for this scope. */
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
    };
  }

  /**
   * Applies data from the scope to the event and runs all event processors on it.
   *
   * @param event Event
   * @param hint Object containing additional information about the original exception, for use by the event processors.
   * @hidden
   */
  public applyToEvent(
    event: Event,
    hint: EventHint = {},
    additionalEventProcessors: EventProcessor[] = [],
  ): PromiseLike<Event | null> {
    const data = getGlobalScope().getScopeData();
    const isolationScopeData = this._getIsolationScope().getScopeData();
    const scopeData = this.getScopeData();

    // Merge data together, in order
    mergeData(data, isolationScopeData);
    mergeData(data, scopeData);

    // Apply the data
    const { extra, tags, user, contexts, level, sdkProcessingMetadata, breadcrumbs, fingerprint, eventProcessors } =
      data;

    mergePropKeep(event, 'extra', extra);
    mergePropKeep(event, 'tags', tags);
    mergePropKeep(event, 'user', user);
    mergePropKeep(event, 'contexts', contexts);
    mergePropKeep(event, 'sdkProcessingMetadata', sdkProcessingMetadata);
    event.sdkProcessingMetadata = {
      ...event.sdkProcessingMetadata,
      propagationContext: this._propagationContext,
    };

    mergeArray(event, 'breadcrumbs', breadcrumbs);
    mergeArray(event, 'fingerprint', fingerprint);

    if (level) {
      event.level = level;
    }

    const allEventProcessors = [...additionalEventProcessors, ...eventProcessors];

    // Apply additional things to the event
    if (this._transactionName) {
      event.transaction = this._transactionName;
    }

    return notifyEventProcessors(allEventProcessors, event, hint);
  }

  /**
   * Get all breadcrumbs attached to this scope.
   * @internal
   */
  public getBreadcrumbs(): Breadcrumb[] {
    return this._breadcrumbs;
  }

  /** Get the isolation scope for this scope. */
  protected _getIsolationScope(): Scope {
    return this.isolationScope || getIsolationScope();
  }
}

/** Exported only for tests */
export function mergeData(data: ScopeData, mergeData: ScopeData): void {
  const {
    extra,
    tags,
    user,
    contexts,
    level,
    sdkProcessingMetadata,
    breadcrumbs,
    fingerprint,
    eventProcessors,
    attachments,
  } = mergeData;

  mergePropOverwrite(data, 'extra', extra);
  mergePropOverwrite(data, 'tags', tags);
  mergePropOverwrite(data, 'user', user);
  mergePropOverwrite(data, 'contexts', contexts);
  mergePropOverwrite(data, 'sdkProcessingMetadata', sdkProcessingMetadata);

  if (level) {
    data.level = level;
  }

  if (breadcrumbs.length) {
    data.breadcrumbs = [...data.breadcrumbs, ...breadcrumbs];
  }

  if (fingerprint.length) {
    data.fingerprint = [...data.fingerprint, ...fingerprint];
  }

  if (eventProcessors.length) {
    data.eventProcessors = [...data.eventProcessors, ...eventProcessors];
  }

  if (attachments.length) {
    data.attachments = [...data.attachments, ...attachments];
  }
}

/**
 * Merge properties, overwriting existing keys.
 * Exported only for tests.
 */
export function mergePropOverwrite<
  Prop extends 'extra' | 'tags' | 'user' | 'contexts' | 'sdkProcessingMetadata',
  Data extends ScopeData | Event,
>(data: Data, prop: Prop, mergeVal: Data[Prop]): void {
  if (mergeVal && Object.keys(mergeVal).length) {
    data[prop] = { ...data[prop], ...mergeVal };
  }
}

/**
 * Merge properties, keeping existing keys.
 * Exported only for tests.
 */
export function mergePropKeep<
  Prop extends 'extra' | 'tags' | 'user' | 'contexts' | 'sdkProcessingMetadata',
  Data extends ScopeData | Event,
>(data: Data, prop: Prop, mergeVal: Data[Prop]): void {
  if (mergeVal && Object.keys(mergeVal).length) {
    data[prop] = { ...mergeVal, ...data[prop] };
  }
}

/** Exported only for tests */
export function mergeArray<Prop extends 'breadcrumbs' | 'fingerprint'>(
  event: Event,
  prop: Prop,
  mergeVal: ScopeData[Prop],
): void {
  const prevVal = event[prop];
  // If we are not merging any new values,
  // we only need to proceed if there was an empty array before (as we want to replace it with undefined)
  if (!mergeVal.length && (!prevVal || prevVal.length)) {
    return;
  }

  const merged = [...(prevVal || []), ...mergeVal] as ScopeData[Prop];
  event[prop] = merged.length ? merged : undefined;
}

function getScopes(): CurrentScopes {
  const carrier = getGlobalCarrier();

  if (carrier.acs && carrier.acs.getScopes) {
    const scopes = carrier.acs.getScopes();

    if (scopes) {
      return scopes;
    }
  }

  return getGlobalCurrentScopes(carrier);
}

function getGlobalCurrentScopes(carrier: SentryCarrier): CurrentScopes {
  if (!carrier.scopes) {
    carrier.scopes = {
      scope: new Scope(),
      isolationScope: new Scope(),
    };
  }

  return carrier.scopes;
}
