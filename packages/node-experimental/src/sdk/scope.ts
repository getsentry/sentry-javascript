import type { TimedEvent } from '@opentelemetry/sdk-trace-base';
import { Scope } from '@sentry/core';
import type { Breadcrumb, SeverityLevel, Span } from '@sentry/types';
import { dateTimestampInSeconds, dropUndefinedKeys, logger, normalize } from '@sentry/utils';

import {
  OTEL_ATTR_BREADCRUMB_CATEGORY,
  OTEL_ATTR_BREADCRUMB_DATA,
  OTEL_ATTR_BREADCRUMB_EVENT_ID,
  OTEL_ATTR_BREADCRUMB_LEVEL,
  OTEL_ATTR_BREADCRUMB_TYPE,
} from '../constants';
import { getOtelSpanParent } from '../opentelemetry/spanData';
import type { OtelSpan } from '../types';
import { convertOtelTimeToSeconds } from '../utils/convertOtelTimeToSeconds';
import { getActiveSpan, getRootSpan } from '../utils/getActiveSpan';

/** A fork of the classic scope with some otel specific stuff. */
export class NodeExperimentalScope extends Scope {
  /**
   * This can be set to ensure the scope uses _this_ span as the active one,
   * instead of using getActiveSpan().
   */
  public activeSpan: OtelSpan | undefined;

  /**
   * @inheritDoc
   */
  public static clone(scope?: Scope): Scope {
    const newScope = new NodeExperimentalScope();
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
    }
    return newScope;
  }

  /**
   * In node-experimental, scope.getSpan() always returns undefined.
   * Instead, use the global `getActiveSpan()`.
   */
  public getSpan(): undefined {
    __DEBUG_BUILD__ &&
      logger.warn('Calling getSpan() is a noop in @sentry/node-experimental. Use `getActiveSpan()` instead.');

    return undefined;
  }

  /**
   * In node-experimental, scope.setSpan() is a noop.
   * Instead, use the global `startSpan()` to define the active span.
   */
  public setSpan(_span: Span): this {
    __DEBUG_BUILD__ &&
      logger.warn('Calling setSpan() is a noop in @sentry/node-experimental. Use `startSpan()` instead.');

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
function getBreadcrumbsForSpan(span: OtelSpan): Breadcrumb[] {
  const events = span ? getOtelEvents(span) : [];

  return events.map(otelEventToBreadcrumb);
}

function breadcrumbToOtelEvent(breadcrumb: Breadcrumb): Parameters<OtelSpan['addEvent']> {
  const name = breadcrumb.message || '<no message>';

  const dataAttrs = serializeBreadcrumbData(breadcrumb.data);

  return [
    name,
    dropUndefinedKeys({
      [OTEL_ATTR_BREADCRUMB_TYPE]: breadcrumb.type,
      [OTEL_ATTR_BREADCRUMB_LEVEL]: breadcrumb.level,
      [OTEL_ATTR_BREADCRUMB_EVENT_ID]: breadcrumb.event_id,
      [OTEL_ATTR_BREADCRUMB_CATEGORY]: breadcrumb.category,
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
      [OTEL_ATTR_BREADCRUMB_DATA]: JSON.stringify(normalizedData),
    };
  } catch (e) {
    return undefined;
  }
}

function otelEventToBreadcrumb(event: TimedEvent): Breadcrumb {
  const attributes = event.attributes || {};

  const type = attributes[OTEL_ATTR_BREADCRUMB_TYPE] as string | undefined;
  const level = attributes[OTEL_ATTR_BREADCRUMB_LEVEL] as SeverityLevel | undefined;
  const eventId = attributes[OTEL_ATTR_BREADCRUMB_EVENT_ID] as string | undefined;
  const category = attributes[OTEL_ATTR_BREADCRUMB_CATEGORY] as string | undefined;
  const dataStr = attributes[OTEL_ATTR_BREADCRUMB_DATA] as string | undefined;

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

function getOtelEvents(span: OtelSpan, events: TimedEvent[] = []): TimedEvent[] {
  if (span.events) {
    events.push(...span.events);
  }

  // Go up parent chain and collect events
  const parent = getOtelSpanParent(span) as OtelSpan | undefined;
  if (parent) {
    return getOtelEvents(parent, events);
  }

  return events;
}
