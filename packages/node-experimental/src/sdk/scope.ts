import { getGlobalData, mergeScopeData } from '@sentry/core';
import { OpenTelemetryScope } from '@sentry/opentelemetry';
import type { Breadcrumb, Client, Event, EventHint, Severity, SeverityLevel } from '@sentry/types';
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

/**
 * Get the global scope.
 * We overwrite this from the core implementation to make sure we get the correct Scope class.
 */
export function getGlobalScope(): Scope {
  const globalData = getGlobalData();

  if (!globalData.globalScope) {
    globalData.globalScope = new Scope();
  }

  // If we have a default Scope here by chance, make sure to "upgrade" it to our custom Scope
  if (!(globalData.globalScope instanceof Scope)) {
    const oldScope = globalData.globalScope;
    globalData.globalScope = new Scope();
    globalData.globalScope.update(oldScope);
  }

  return globalData.globalScope as Scope;
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
    newScope._user = { ...this['_user'] };
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

  /** Get scope data for this scope only. */
  public getOwnScopeData(): ScopeData {
    return super.getScopeData();
  }

  /** @inheritdoc */
  public getScopeData(): ScopeData {
    const globalScope = getGlobalScope();
    const isolationScope = this._getIsolationScope();

    // Special case: If this is the global/isolation scope, no need to merge other data in here
    if (this === globalScope || this === isolationScope) {
      return this.getOwnScopeData();
    }

    // Global scope is applied anyhow in prepareEvent,
    // but we need to merge the isolation scope in here
    const data = isolationScope.getOwnScopeData();
    const scopeData = this.getOwnScopeData();

    // Merge data together, in order
    mergeScopeData(data, scopeData);

    return data;
  }

  /** Get the isolation scope for this scope. */
  protected _getIsolationScope(): Scope {
    return this.isolationScope || getIsolationScope();
  }
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
