import type { Span } from '@opentelemetry/api';
import type { TimedEvent } from '@opentelemetry/sdk-trace-base';
import { Scope } from '@sentry/core';
import type { Breadcrumb, ScopeData, SeverityLevel, Span as SentrySpan } from '@sentry/types';
import { dateTimestampInSeconds, dropUndefinedKeys, logger, normalize } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { InternalSentrySemanticAttributes } from '../semanticAttributes';
import { convertOtelTimeToSeconds } from '../utils/convertOtelTimeToSeconds';
import { getActiveSpan, getRootSpan } from '../utils/getActiveSpan';
import { getSpanParent } from '../utils/spanData';
import { spanHasEvents } from '../utils/spanTypes';

/** A fork of the classic scope with some otel specific stuff. */
export class OpenTelemetryScope extends Scope {
  /**
   * This can be set to ensure the scope uses _this_ span as the active one,
   * instead of using getActiveSpan().
   */
  public activeSpan: Span | undefined;

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

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    const activeSpan = this.activeSpan || getActiveSpan();
    const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

    if (rootSpan) {
      const mergedBreadcrumb = {
        timestamp: dateTimestampInSeconds(),
        ...breadcrumb,
      };

      rootSpan.addEvent(...breadcrumbToOtelEvent(mergedBreadcrumb));
      return this;
    }

    return this._addBreadcrumb(breadcrumb, maxBreadcrumbs);
  }

  /** @inheritDoc */
  public getScopeData(): ScopeData {
    const data = super.getScopeData();

    data.breadcrumbs = this._getBreadcrumbs();

    return data;
  }

  /** Add a breadcrumb to this scope. */
  protected _addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    return super.addBreadcrumb(breadcrumb, maxBreadcrumbs);
  }

  /**
   * @inheritDoc
   */
  protected _getBreadcrumbs(): Breadcrumb[] {
    const span = this.activeSpan || getActiveSpan();

    const spanBreadcrumbs = span ? getBreadcrumbsForSpan(span) : [];

    return spanBreadcrumbs.length > 0 ? this._breadcrumbs.concat(spanBreadcrumbs) : this._breadcrumbs;
  }
}

/**
 * Get all breadcrumbs for the given span as well as it's parents.
 */
function getBreadcrumbsForSpan(span: Span): Breadcrumb[] {
  const events = span ? getOtelEvents(span) : [];

  return events.map(otelEventToBreadcrumb);
}

function breadcrumbToOtelEvent(breadcrumb: Breadcrumb): Parameters<Span['addEvent']> {
  const name = breadcrumb.message || '<no message>';

  const dataAttrs = serializeBreadcrumbData(breadcrumb.data);

  return [
    name,
    dropUndefinedKeys({
      [InternalSentrySemanticAttributes.BREADCRUMB_TYPE]: breadcrumb.type,
      [InternalSentrySemanticAttributes.BREADCRUMB_LEVEL]: breadcrumb.level,
      [InternalSentrySemanticAttributes.BREADCRUMB_EVENT_ID]: breadcrumb.event_id,
      [InternalSentrySemanticAttributes.BREADCRUMB_CATEGORY]: breadcrumb.category,
      ...dataAttrs,
    }),
    breadcrumb.timestamp ? new Date(breadcrumb.timestamp * 1000) : undefined,
  ];
}

function serializeBreadcrumbData(data: Breadcrumb['data']): undefined | Record<string, unknown> {
  if (!data || Object.keys(data).length === 0) {
    return undefined;
  }

  try {
    const normalizedData = normalize(data);
    return {
      [InternalSentrySemanticAttributes.BREADCRUMB_DATA]: JSON.stringify(normalizedData),
    };
  } catch (e) {
    return undefined;
  }
}

function otelEventToBreadcrumb(event: TimedEvent): Breadcrumb {
  const attributes = event.attributes || {};

  const type = attributes[InternalSentrySemanticAttributes.BREADCRUMB_TYPE] as string | undefined;
  const level = attributes[InternalSentrySemanticAttributes.BREADCRUMB_LEVEL] as SeverityLevel | undefined;
  const eventId = attributes[InternalSentrySemanticAttributes.BREADCRUMB_EVENT_ID] as string | undefined;
  const category = attributes[InternalSentrySemanticAttributes.BREADCRUMB_CATEGORY] as string | undefined;
  const dataStr = attributes[InternalSentrySemanticAttributes.BREADCRUMB_DATA] as string | undefined;

  const breadcrumb: Breadcrumb = dropUndefinedKeys({
    timestamp: convertOtelTimeToSeconds(event.time),
    message: event.name,
    type,
    level,
    event_id: eventId,
    category,
  });

  if (typeof dataStr === 'string') {
    try {
      const data = JSON.parse(dataStr);
      breadcrumb.data = data;
    } catch (e) {} // eslint-disable-line no-empty
  }

  return breadcrumb;
}

function getOtelEvents(span: Span, events: TimedEvent[] = []): TimedEvent[] {
  if (spanHasEvents(span)) {
    events.push(...span.events);
  }

  // Go up parent chain and collect events
  const parent = getSpanParent(span);
  if (parent) {
    return getOtelEvents(parent, events);
  }

  return events;
}
