import * as Sentry from '@sentry/nextjs';
import memoizer from 'lru-memoizer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// lru-memoizer's only job (from the SDK's perspective) is to bind the active async context onto the
// memoized callback, so it runs in its originating span's context whenever the load resolves. The
// integration creates no spans — we assert the context restore instead. `load` captures its callback
// without resolving; we fire it later from outside the span, and record on the enclosing span whether
// the callback ran in that span's context. We wrap the check in our own span so it lands in the
// transaction's `spans` list (the route handler's active span is nested under Next's `http.server`).
export async function GET() {
  let memoizerLoadCallback: (() => void) | undefined;
  const memoizedFn = memoizer({
    load: (_param: unknown, callback: () => void) => {
      memoizerLoadCallback = callback;
    },
    hash: () => 'key',
  });

  const contextPreserved = await Sentry.startSpan(
    { name: 'lru-memoizer-check', op: 'run' },
    span =>
      new Promise<boolean>(resolve => {
        memoizedFn({ foo: 'bar' }, () => {
          const preserved = Sentry.getActiveSpan()?.spanContext().spanId === span.spanContext().spanId;
          span.setAttribute('memoized.context_preserved', preserved);
          resolve(preserved);
        });

        // Fire the load outside the span, so the assertion above proves the context was restored.
        memoizerLoadCallback?.();
      }),
  );

  return NextResponse.json({ contextPreserved });
}
