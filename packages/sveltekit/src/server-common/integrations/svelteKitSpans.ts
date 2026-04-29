import type { Integration, SpanJSON, SpanOrigin, StreamedSpanJSON } from '@sentry/core';
import {
  safeSetSpanJSONAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
} from '@sentry/core';

/**
 * A small integration that preprocesses spans so that SvelteKit-generated spans
 * (via Kit's tracing feature since 2.31.0) get the correct Sentry attributes
 * and data.
 */
export function svelteKitSpansIntegration(): Integration {
  return {
    name: 'SvelteKitSpansEnhancement',
    // Using preprocessEvent to ensure the processing happens before user-configured
    // event processors are executed
    preprocessEvent(event) {
      // only iterate over the spans if the root span was emitted by SvelteKit
      // TODO: Right now, we can't optimize this to only check traces with a kit-emitted root span
      // this is because in Cloudflare, the kit-emitted root span is missing but our cloudflare
      // SDK emits the http.server span.
      if (event.type === 'transaction') {
        event.spans?.forEach(_enhanceKitSpan);
      }
    },
    processSpan(span) {
      _enhanceKitSpanStreamed(span);
    },
  };
}

/**
 * Adds sentry-specific attributes and data to a span emitted by SvelteKit's native tracing (since 2.31.0)
 * @exported for testing
 */
export function _enhanceKitSpan(span: SpanJSON): void {
  const { op, origin } = _getKitSpanEnhancement(span.description);

  const previousOp = span.op || span.data[SEMANTIC_ATTRIBUTE_SENTRY_OP];
  const previousOrigin = span.origin || span.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN];

  if (!previousOp && op) {
    span.op = op;
    span.data[SEMANTIC_ATTRIBUTE_SENTRY_OP] = op;
  }

  if ((!previousOrigin || previousOrigin === 'manual') && origin) {
    span.origin = origin;
    span.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = origin;
  }
}

/**
 * Streaming-mode counterpart of {@link _enhanceKitSpan} operating on {@link StreamedSpanJSON}.
 * @exported for testing
 */
export function _enhanceKitSpanStreamed(span: StreamedSpanJSON): void {
  const { op, origin } = _getKitSpanEnhancement(span.name);
  const previousOrigin = span.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] as SpanOrigin | undefined;

  if (op) {
    safeSetSpanJSONAttributes(span, { [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op });
  }

  if (previousOrigin === 'manual' && origin) {
    // `safeSetSpanJSONAttributes` skips existing keys, so overwrite the 'manual' sentinel directly.
    span.attributes![SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = origin;
  } else {
    safeSetSpanJSONAttributes(span, { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin });
  }
}

function _getKitSpanEnhancement(spanName: string | undefined): {
  op?: string;
  origin?: SpanOrigin;
} {
  switch (spanName) {
    case 'sveltekit.resolve':
      return { op: 'function.sveltekit.resolve', origin: 'auto.http.sveltekit' };
    case 'sveltekit.load':
      return { op: 'function.sveltekit.load', origin: 'auto.function.sveltekit.load' };
    case 'sveltekit.form_action':
      return { op: 'function.sveltekit.form_action', origin: 'auto.function.sveltekit.action' };
    case 'sveltekit.remote.call':
      return { op: 'function.sveltekit.remote', origin: 'auto.rpc.sveltekit.remote' };
    case 'sveltekit.handle.root':
      // We don't want to overwrite the root handle span at this point since
      // we already enhance the root span in our `sentryHandle` hook.
      return {};
    default:
      if (spanName?.startsWith('sveltekit.handle.sequenced.')) {
        return { op: 'function.sveltekit.handle', origin: 'auto.function.sveltekit.handle' };
      }
      return {};
  }
}
