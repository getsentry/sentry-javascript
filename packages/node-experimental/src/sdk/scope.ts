import { notifyEventProcessors } from '@sentry/core';
import { OpenTelemetryScope } from '@sentry/opentelemetry';
import type {
  Attachment,
  Breadcrumb,
  Client,
  Contexts,
  Event,
  EventHint,
  EventProcessor,
  Extras,
  Primitive,
  PropagationContext,
  Severity,
  SeverityLevel,
  User,
} from '@sentry/types';
import { uuid4 } from '@sentry/utils';

import { getClient, getGlobalScope, getIsolationScope } from './api';

interface ScopeData {
  eventProcessors: EventProcessor[];
  breadcrumbs: Breadcrumb[];
  user: User;
  tags: { [key: string]: Primitive };
  extra: Extras;
  contexts: Contexts;
  attachments: Attachment[];
  propagationContext: PropagationContext;
  sdkProcessingMetadata: { [key: string]: unknown };
  fingerprint: string[];
  // eslint-disable-next-line deprecation/deprecation
  level?: Severity | SeverityLevel;
}

/** A fork of the classic scope with some otel specific stuff. */
export class Scope extends OpenTelemetryScope {
  // Overwrite this if you want to use a specific isolation scope here
  public isolationScope: Scope | undefined;

  protected _client: Client | undefined;

  protected _lastEventId: string | undefined;

  /**
   * @inheritDoc
   */
  public static clone(scope?: Scope): Scope {
    const newScope = new Scope();
    if (scope) {
      newScope._breadcrumbs = [...scope['_breadcrumbs']];
      newScope._tags = { ...scope['_tags'] };
      newScope._extra = { ...scope['_extra'] };
      newScope._contexts = { ...scope['_contexts'] };
      newScope._user = scope['_user'];
      newScope._level = scope['_level'];
      newScope._span = scope['_span'];
      newScope._session = scope['_session'];
      newScope._transactionName = scope['_transactionName'];
      newScope._fingerprint = scope['_fingerprint'];
      newScope._eventProcessors = [...scope['_eventProcessors']];
      newScope._requestSession = scope['_requestSession'];
      newScope._attachments = [...scope['_attachments']];
      newScope._sdkProcessingMetadata = { ...scope['_sdkProcessingMetadata'] };
      newScope._propagationContext = { ...scope['_propagationContext'] };
      newScope._client = scope['_client'];
      newScope._lastEventId = scope['_lastEventId'];
    }
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

    mergeProp(event, 'extra', extra);
    mergeProp(event, 'tags', tags);
    mergeProp(event, 'user', user);
    mergeProp(event, 'contexts', contexts);
    mergeProp(event, 'sdkProcessingMetadata', sdkProcessingMetadata);
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

  /**
   * @inheritDoc
   */
  protected _getBreadcrumbs(): Breadcrumb[] {
    // breadcrumbs added directly to this scope, or to the active span
    const breadcrumbs = super._getBreadcrumbs();

    // add breadcrumbs from global scope and isolation scope
    const globalBreadcrumbs = getGlobalScope().getBreadcrumbs();
    const isolationBreadcrumbs = this._getIsolationScope().getBreadcrumbs();

    return breadcrumbs.concat(globalBreadcrumbs, isolationBreadcrumbs);
  }

  /** Get the isolation scope for this scope. */
  protected _getIsolationScope(): Scope {
    return this.isolationScope || getIsolationScope();
  }
}

function mergeData(data: ScopeData, mergeData: ScopeData): void {
  const { extra, tags, user, contexts, level, sdkProcessingMetadata, breadcrumbs, fingerprint, eventProcessors } =
    mergeData;

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
}

function mergePropOverwrite<
  Prop extends 'extra' | 'tags' | 'user' | 'contexts' | 'sdkProcessingMetadata',
  Data extends ScopeData | Event,
>(data: Data, prop: Prop, mergeVal: Data[Prop]): void {
  if (mergeVal && Object.keys(mergeVal).length) {
    data[prop] = { ...data[prop], ...mergeVal };
  }
}

function mergeProp<
  Prop extends 'extra' | 'tags' | 'user' | 'contexts' | 'sdkProcessingMetadata',
  Data extends ScopeData | Event,
>(data: Data, prop: Prop, mergeVal: Data[Prop]): void {
  if (mergeVal && Object.keys(mergeVal).length) {
    data[prop] = { ...mergeVal, ...data[prop] };
  }
}

function mergeArray<Prop extends 'breadcrumbs' | 'fingerprint'>(
  event: Event,
  prop: Prop,
  mergeVal: ScopeData[Prop],
): void {
  const prevVal = event[prop];
  if (!prevVal && !mergeVal.length) {
    return;
  }

  const merged = [...(prevVal || []), ...mergeVal] as ScopeData[Prop];
  event[prop] = merged.length ? merged : undefined;
}
