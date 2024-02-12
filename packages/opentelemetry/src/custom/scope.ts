import { Scope } from '@sentry/core';
import type { Span as SentrySpan } from '@sentry/types';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';

/** A fork of the classic scope with some otel specific stuff. */
export class OpenTelemetryScope extends Scope {
  /**
   * @inheritDoc
   */
  public static clone(scope?: Scope): Scope {
    return scope ? scope.clone() : new OpenTelemetryScope();
  }

  /**
   * Clone this scope instance.
   */
  public clone(): OpenTelemetryScope {
    const newScope = new OpenTelemetryScope();
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
    newScope._client = this._client;

    return newScope;
  }

  /**
   * In node-experimental, scope.getSpan() always returns undefined.
   * Instead, use the global `getActiveSpan()`.
   */
  public getSpan(): undefined {
    DEBUG_BUILD && logger.warn('Calling getSpan() is a noop in @sentry/opentelemetry. Use `getActiveSpan()` instead.');

    return undefined;
  }

  /**
   * In node-experimental, scope.setSpan() is a noop.
   * Instead, use the global `startSpan()` to define the active span.
   */
  public setSpan(_span: SentrySpan): this {
    DEBUG_BUILD && logger.warn('Calling setSpan() is a noop in @sentry/opentelemetry. Use `startSpan()` instead.');

    return this;
  }
}
