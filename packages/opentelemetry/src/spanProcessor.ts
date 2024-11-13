import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT, trace } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor as SpanProcessorInterface } from '@opentelemetry/sdk-trace-base';
import {
  addChildSpanToSpan,
  getClient,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  logSpanEnd,
  logSpanStart,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCapturedScopesOnSpan,
} from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE } from './semanticAttributes';
import { SentrySpanExporter } from './spanExporter';
import { getScopesFromContext } from './utils/contextData';
import { setIsSetup } from './utils/setupCheck';

function onSpanStart(span: Span, parentContext: Context): void {
  // Ugly hack to set the source to custom when updating the span name
  // We want to add this functionality so that users don't have to care
  // about setting the source attribute themselves
  // This is in-line with other SDKs as well as the `SentrySpan` class.
  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalSpanUpdateName = span.updateName;
    span.updateName = (name: string) => {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');
      return originalSpanUpdateName.call(span, name);
    };
  } catch {
    // Safe-guarding this in case bundlers add freezing logic that breaks the assignment
  }

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
    setCapturedScopesOnSpan(span, scopes.scope, scopes.isolationScope);
  }

  logSpanStart(span);

  const client = getClient();
  client?.emit('spanStart', span);
}

function onSpanEnd(span: Span): void {
  logSpanEnd(span);

  const client = getClient();
  client?.emit('spanEnd', span);
}

/**
 * Converts OpenTelemetry Spans to Sentry Spans and sends them to Sentry via
 * the Sentry SDK.
 */
export class SentrySpanProcessor implements SpanProcessorInterface {
  private _exporter: SentrySpanExporter;

  public constructor(options?: { timeout?: number }) {
    setIsSetup('SentrySpanProcessor');
    this._exporter = new SentrySpanExporter(options);
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
    onSpanStart(span, parentContext);
  }

  /** @inheritDoc */
  public onEnd(span: Span & ReadableSpan): void {
    onSpanEnd(span);

    this._exporter.export(span);
  }
}
