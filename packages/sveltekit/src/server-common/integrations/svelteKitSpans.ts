import type { Integration, SpanOrigin, StreamedSpanJSON } from '@sentry/core';
import { safeSetSpanJSONAttributes, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { WEB_SERVER_FUNCTION_SPAN_OP } from '@sentry/conventions/op';

/**
 * A small integration that preprocesses spans so that SvelteKit-generated spans
 * (via Kit's tracing feature since 2.31.0) get the correct Sentry attributes
 * and data.
 */
export function svelteKitSpansIntegration(): Integration {
  return {
    name: 'SvelteKitSpansEnhancement' as const,
    processSpan(span) {
      _enhanceKitSpanStreamed(span);
    },
  };
}

/**
 * Adds sentry-specific attributes and data to a span emitted by SvelteKit's native tracing (since 2.31.0)
 * @exported for testing
 */
export function _enhanceKitSpanStreamed(span: StreamedSpanJSON): void {
  const origin = _getKitSpanOrigin(span.name);
  if (!origin) {
    return;
  }

  const previousOrigin = span.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] as SpanOrigin | undefined;

  safeSetSpanJSONAttributes(span, { [SENTRY_OP]: WEB_SERVER_FUNCTION_SPAN_OP });

  if (previousOrigin === 'manual') {
    // `safeSetSpanJSONAttributes` skips existing keys, so overwrite the 'manual' sentinel directly.
    span.attributes![SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = origin;
  } else {
    safeSetSpanJSONAttributes(span, { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin });
  }
}

function _getKitSpanOrigin(spanName: string | undefined): SpanOrigin | undefined {
  switch (spanName) {
    case 'sveltekit.resolve':
      return 'auto.http.sveltekit';
    case 'sveltekit.load':
      return 'auto.function.sveltekit.load';
    case 'sveltekit.form_action':
      return 'auto.function.sveltekit.action';
    case 'sveltekit.remote.call':
      return 'auto.rpc.sveltekit.remote';
    case 'sveltekit.handle.root':
      // We don't want to overwrite the root handle span at this point since
      // we already enhance the root span in our `sentryHandle` hook.
      return undefined;
    default:
      if (spanName?.startsWith('sveltekit.handle.sequenced.')) {
        return 'auto.function.sveltekit.handle';
      }
      return undefined;
  }
}
