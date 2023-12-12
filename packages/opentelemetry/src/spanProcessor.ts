import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT, trace } from '@opentelemetry/api';
import type { Span, SpanProcessor as SpanProcessorInterface } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { logger } from '@sentry/utils';

import { getCurrentHub } from './custom/hub';
import { OpenTelemetryScope } from './custom/scope';
import { DEBUG_BUILD } from './debug-build';
import { SentrySpanExporter } from './spanExporter';
import { maybeCaptureExceptionForTimedEvent } from './utils/captureExceptionForTimedEvent';
import { getHubFromContext } from './utils/contextData';
import { getSpanHub, setSpanFinishScope, setSpanHub, setSpanParent, setSpanScope } from './utils/spanData';

function onSpanStart(span: Span, parentContext: Context, ScopeClass: typeof OpenTelemetryScope): void {
  // This is a reliable way to get the parent span - because this is exactly how the parent is identified in the OTEL SDK
  const parentSpan = trace.getSpan(parentContext);
  const hub = getHubFromContext(parentContext);

  // We need access to the parent span in order to be able to move up the span tree for breadcrumbs
  if (parentSpan) {
    setSpanParent(span, parentSpan);
  }

  // The root context does not have a hub stored, so we check for this specifically
  // We do this instead of just falling back to `getCurrentHub` to avoid attaching the wrong hub
  let actualHub = hub;
  if (parentContext === ROOT_CONTEXT) {
    actualHub = getCurrentHub();
  }

  // We need the scope at time of span creation in order to apply it to the event when the span is finished
  if (actualHub) {
    const scope = actualHub.getScope();
    setSpanScope(span, actualHub.getScope());
    setSpanHub(span, actualHub);

    // Use this scope for finishing the span
    const finishScope = ScopeClass.clone(scope as OpenTelemetryScope) as OpenTelemetryScope;
    finishScope.activeSpan = span;
    setSpanFinishScope(span, finishScope);
  }
}

function onSpanEnd(span: Span): void {
  // Capture exceptions as events
  const hub = getSpanHub(span) || getCurrentHub();
  span.events.forEach(event => {
    maybeCaptureExceptionForTimedEvent(hub, event, span);
  });
}

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor extends BatchSpanProcessor implements SpanProcessorInterface {
  private _scopeClass: typeof OpenTelemetryScope;

  public constructor(options: { scopeClass?: typeof OpenTelemetryScope } = {}) {
    super(new SentrySpanExporter());

    this._scopeClass = options.scopeClass || OpenTelemetryScope;
  }

  /**
   * @inheritDoc
   */
  public onStart(span: Span, parentContext: Context): void {
    onSpanStart(span, parentContext, this._scopeClass);

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
