import { startInactiveSpan } from '@sentry/core';
import { makeSentryTracer } from '../tracer';

/**
 * Effect `Tracer` that records Effect spans as Sentry spans on the server.
 *
 * Deliberately the plain `@sentry/core` variant, not `@sentry/core/browser`: the browser one guards
 * every span start with a `getClient()` lookup to lazily install `spanStreamingIntegration`, which on
 * the server is pure overhead — `ServerRuntimeClient` already installs it eagerly.
 *
 * See `./client/tracer.ts` for why the call is wrapped in an arrow.
 */
export const SentryEffectTracer = makeSentryTracer(options => startInactiveSpan(options));
