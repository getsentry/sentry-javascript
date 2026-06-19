import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT, SpanKind, trace } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor as SpanProcessorInterface } from '@opentelemetry/sdk-trace-base';
import type { Client, SpanAttributes, StreamedSpanJSON } from '@sentry/core';
import {
  addChildSpanToSpan,
  getClient,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  hasSpanStreamingEnabled,
  logSpanEnd,
  logSpanStart,
  safeSetSpanJSONAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCapturedScopesOnSpan,
} from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE } from './semanticAttributes';
import { SentrySpanExporter } from './spanExporter';
import { getScopesFromContext } from './utils/contextData';
import { inferSpanData } from './utils/parseSpanDescription';
import { setIsSetup } from './utils/setupCheck';
/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor implements SpanProcessorInterface {
  private _exporter: SentrySpanExporter;
  private _client: Client | undefined;

  public constructor(options?: { timeout?: number; client?: Client }) {
    setIsSetup('SentrySpanProcessor');
    this._exporter = new SentrySpanExporter(options);
    this._client = options?.client ?? getClient();

    if (this._client && hasSpanStreamingEnabled(this._client)) {
      // Streamed spans skip the exporter, so they don't get op/source/name inferred from OTel
      // semantic conventions. We backfill them here, reusing the same inference as the exporter.
      this._client.on('processSpan', backfillStreamedSpanDataFromOtel);
    }
  }

  /**
   * @inheritDoc
   */
  public async forceFlush(): Promise<void> {
    this._exporter.flush();
  }

  /**
   * @inheritDoc
   */
  public async shutdown(): Promise<void> {
    this._exporter.clear();
  }

  /**
   * @inheritDoc
   */
  public onStart(span: Span, parentContext: Context): void {
    // This is a reliable way to get the parent span - because this is exactly how the parent is identified in the OTEL SDK
    const parentSpan = trace.getSpan(parentContext);

    let scopes = getScopesFromContext(parentContext);

    // We need access to the parent span in order to be able to move up the span tree for breadcrumbs
    if (parentSpan && !parentSpan.spanContext().isRemote) {
      addChildSpanToSpan(parentSpan, span);
    }

    // We need this in the span exporter
    if (parentSpan?.spanContext().isRemote) {
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
      setCapturedScopesOnSpan(span, scopes.scope, scopes.isolationScope);
    }

    logSpanStart(span);

    this._client?.emit('spanStart', span);
  }

  /** @inheritDoc */
  public onEnd(span: Span & ReadableSpan): void {
    logSpanEnd(span);

    this._client?.emit('spanEnd', span);

    if (this._client && hasSpanStreamingEnabled(this._client)) {
      this._client.emit('afterSpanEnd', span);
    } else {
      this._exporter.export(span);
    }
  }
}

/**
 * Backfill op, source, name and data on a streamed span JSON from OTel semantic conventions.
 * Mirrors the inference the {@link SentrySpanExporter} applies to non-streamed spans via `getSpanData`.
 * Explicitly set attributes are preserved via `safeSetSpanJSONAttributes`.
 */
function backfillStreamedSpanDataFromOtel(spanJSON: StreamedSpanJSON, hint?: { spanKind?: number }): void {
  const attributes = spanJSON.attributes;
  if (!attributes) {
    return;
  }

  const kind = hint?.spanKind ?? SpanKind.INTERNAL;
  const { op, description, source, data } = inferSpanData(spanJSON.name, attributes as unknown as SpanAttributes, kind);

  spanJSON.name = description;

  safeSetSpanJSONAttributes(spanJSON, {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
    ...data,
  });

  if (kind !== SpanKind.INTERNAL) {
    safeSetSpanJSONAttributes(spanJSON, {
      'otel.kind': SpanKind[kind],
    });
  }
}
