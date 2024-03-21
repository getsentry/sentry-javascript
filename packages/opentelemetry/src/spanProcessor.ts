import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT, trace } from '@opentelemetry/api';
import type { Span, SpanProcessor as SpanProcessorInterface } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { addChildSpanToSpan, getClient, getDefaultCurrentScope, getDefaultIsolationScope } from '@sentry/core';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE } from './semanticAttributes';
import { SentrySpanExporter } from './spanExporter';
import { getScopesFromContext } from './utils/contextData';
import { setIsSetup } from './utils/setupCheck';
import { setSpanScopes } from './utils/spanData';

function onSpanStart(span: Span, parentContext: Context): void {
  // This is a reliable way to get the parent span - because this is exactly how the parent is identified in the OTEL SDK
  const parentSpan = trace.getSpan(parentContext);

  let scopes = getScopesFromContext(parentContext);

  // We need access to the parent span in order to be able to move up the span tree for breadcrumbs
  if (parentSpan && !parentSpan.spanContext().isRemote) {
    addChildSpanToSpan(parentSpan, span);
  }

  // We need this in the span exporter
  if (parentSpan && parentSpan.spanContext().isRemote) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE, true);
  }

  // The root context does not have scopes stored, so we check for this specifically
  // As fallback we attach the global scopes
  if (parentContext === ROOT_CONTEXT) {
    scopes = {
      scope: getDefaultCurrentScope(),
      isolationScope: getDefaultIsolationScope(),
    };
  }

  // We need the scope at time of span creation in order to apply it to the event when the span is finished
  if (scopes) {
    setSpanScopes(span, scopes);
  }

  const client = getClient();
  client?.emit('spanStart', span);
}

function onSpanEnd(span: Span): void {
  const client = getClient();
  client?.emit('spanEnd', span);
}

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor extends BatchSpanProcessor implements SpanProcessorInterface {
  public constructor() {
    super(new SentrySpanExporter());

    setIsSetup('SentrySpanProcessor');
  }

  /**
   * @inheritDoc
   */
  public onStart(span: Span, parentContext: Context): void {
    onSpanStart(span, parentContext);

    // TODO (v8): Trigger client `spanStart` & `spanEnd` in here,
    // once we decoupled opentelemetry from SentrySpan

    DEBUG_BUILD && logger.log(`[Tracing] Starting span "${span.name}" (${span.spanContext().spanId})`);

    return super.onStart(span, parentContext);
  }

  /** @inheritDoc */
  public onEnd(span: Span): void {
    DEBUG_BUILD && logger.log(`[Tracing] Finishing span "${span.name}" (${span.spanContext().spanId})`);

    if (!this._shouldSendSpanToSentry(span)) {
      // Prevent this being called to super.onEnd(), which would pass this to the span exporter
      return;
    }

    onSpanEnd(span);

    return super.onEnd(span);
  }

  /**
   * You can overwrite this in a sub class to implement custom behavior for dropping spans.
   * If you return `false` here, the span will not be passed to the exporter and thus not be sent.
   */
  protected _shouldSendSpanToSentry(_span: Span): boolean {
    return true;
  }
}
