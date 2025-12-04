import type { Integration, SpanJSON, SpanOrigin } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';

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
  };
}

/**
 * Adds sentry-specific attributes and data to a span emitted by SvelteKit's native tracing (since 2.31.0)
 * @exported for testing
 */
export function _enhanceKitSpan(span: SpanJSON): void {
  let op: string | undefined = undefined;
  let origin: SpanOrigin | undefined = undefined;

  const spanName = span.description;

  const previousOp = span.op || span.data[SEMANTIC_ATTRIBUTE_SENTRY_OP];
  const previousOrigin = span.origin || span.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN];

  switch (spanName) {
    case 'sveltekit.resolve':
      op = 'function.sveltekit.resolve';
      origin = 'auto.http.sveltekit';
      break;
    case 'sveltekit.load':
      op = 'function.sveltekit.load';
      origin = 'auto.function.sveltekit.load';
      break;
    case 'sveltekit.form_action':
      op = 'function.sveltekit.form_action';
      origin = 'auto.function.sveltekit.action';
      break;
    case 'sveltekit.remote.call':
      op = 'function.sveltekit.remote';
      origin = 'auto.rpc.sveltekit.remote';
      break;
    case 'sveltekit.handle.root':
      // We don't want to overwrite the root handle span at this point since
      // we already enhance the root span in our `sentryHandle` hook.
      break;
    default: {
      if (spanName?.startsWith('sveltekit.handle.sequenced.')) {
        op = 'function.sveltekit.handle';
        origin = 'auto.function.sveltekit.handle';
      }
      break;
    }
  }

  if (!previousOp && op) {
    span.op = op;
    span.data[SEMANTIC_ATTRIBUTE_SENTRY_OP] = op;
  }

  if ((!previousOrigin || previousOrigin === 'manual') && origin) {
    span.origin = origin;
    span.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = origin;
  }
}
