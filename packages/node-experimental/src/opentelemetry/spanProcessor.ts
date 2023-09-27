import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT, SpanKind, trace } from '@opentelemetry/api';
import type { SpanProcessor as OtelSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import {
  _INTERNAL_SENTRY_TRACE_PARENT_CONTEXT_KEY,
  maybeCaptureExceptionForTimedEvent,
} from '@sentry/opentelemetry-node';
import type { Hub, TraceparentData } from '@sentry/types';

import { OTEL_ATTR_PARENT_SAMPLED, OTEL_CONTEXT_HUB_KEY } from '../constants';
import { Http } from '../integrations';
import type { NodeExperimentalClient } from '../sdk/client';
import { getCurrentHub } from '../sdk/hub';
import type { OtelSpan } from '../types';
import { getOtelSpanHub, setOtelSpanHub, setOtelSpanParent, setOtelSpanScope } from './spanData';
import { SentrySpanExporter } from './spanExporter';

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor extends BatchSpanProcessor implements OtelSpanProcessor {
  public constructor() {
    super(new SentrySpanExporter());
  }

  /**
   * @inheritDoc
   */
  public onStart(span: OtelSpan, parentContext: Context): void {
    // This is a reliable way to get the parent span - because this is exactly how the parent is identified in the OTEL SDK
    const parentSpan = trace.getSpan(parentContext) as OtelSpan | undefined;
    const hub = parentContext.getValue(OTEL_CONTEXT_HUB_KEY) as Hub | undefined;

    // We need access to the parent span in order to be able to move up the span tree for breadcrumbs
    if (parentSpan) {
      setOtelSpanParent(span, parentSpan);
    }

    // The root context does not have a hub stored, so we check for this specifically
    // We do this instead of just falling back to `getCurrentHub` to avoid attaching the wrong hub
    let actualHub = hub;
    if (parentContext === ROOT_CONTEXT) {
      actualHub = getCurrentHub();
    }

    // We need the scope at time of span creation in order to apply it to the event when the span is finished
    if (actualHub) {
      setOtelSpanScope(span, actualHub.getScope());
      setOtelSpanHub(span, actualHub);
    }

    // We need to set this here based on the parent context
    const parentSampled = getParentSampled(span, parentContext);
    if (typeof parentSampled === 'boolean') {
      span.setAttribute(OTEL_ATTR_PARENT_SAMPLED, parentSampled);
    }

    return super.onStart(span, parentContext);
  }

  /** @inheritDoc */
  public onEnd(span: OtelSpan): void {
    if (!shouldCaptureSentrySpan(span)) {
      // Prevent this being called to super.onEnd(), which would pass this to the span exporter
      return;
    }

    // Capture exceptions as events
    const hub = getOtelSpanHub(span) || getCurrentHub();
    span.events.forEach(event => {
      maybeCaptureExceptionForTimedEvent(hub, event, span);
    });

    return super.onEnd(span);
  }
}

function getTraceParentData(parentContext: Context): TraceparentData | undefined {
  return parentContext.getValue(_INTERNAL_SENTRY_TRACE_PARENT_CONTEXT_KEY) as TraceparentData | undefined;
}

function getParentSampled(span: OtelSpan, parentContext: Context): boolean | undefined {
  const spanContext = span.spanContext();
  const traceId = spanContext.traceId;
  const traceparentData = getTraceParentData(parentContext);

  // Only inherit sample rate if `traceId` is the same
  return traceparentData && traceId === traceparentData.traceId ? traceparentData.parentSampled : undefined;
}

function shouldCaptureSentrySpan(span: OtelSpan): boolean {
  const client = getCurrentHub().getClient<NodeExperimentalClient>();
  const httpIntegration = client ? client.getIntegration(Http) : undefined;

  // If we encounter a client or server span with url & method, we assume this comes from the http instrumentation
  // In this case, if `shouldCreateSpansForRequests` is false, we want to _record_ the span but not _sample_ it,
  // So we can generate a breadcrumb for it but no span will be sent
  if (
    httpIntegration &&
    (span.kind === SpanKind.CLIENT || span.kind === SpanKind.SERVER) &&
    span.attributes[SemanticAttributes.HTTP_URL] &&
    span.attributes[SemanticAttributes.HTTP_METHOD] &&
    !httpIntegration.shouldCreateSpansForRequests
  ) {
    return false;
  }

  return true;
}
