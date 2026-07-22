import * as Sentry from '@sentry/nextjs';
import memoizer from 'lru-memoizer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// lru-memoizer's only job (from the SDK's perspective) is to bind the active async context onto the
// memoized callback, so it runs in its originating span's context whenever the load resolves. The
// integration creates no spans — we assert the context restore instead.
//
// `load` captures its callback without resolving. We register the memoized call INSIDE the
// `lru-memoizer-check` span (so orchestrion captures that span as the context to restore), but fire
// the load AFTER `startSpan` returns — i.e. outside the span's active context. That's essential: if
// we fired it inside the span, the callback would see the span through normal async propagation and
// the assertion would pass even with orchestrion's context restore broken. Firing it outside means
// only the restore can make the callback observe the span. Mirrors the node lru-memoizer test.
export async function GET() {
  let memoizerLoadCallback: (() => void) | undefined;
  const memoizedFn = memoizer({
    load: (_param: unknown, callback: () => void) => {
      memoizerLoadCallback = callback;
    },
    hash: () => 'key',
  });

  // `startSpan` invokes its callback synchronously, so `memoizerLoadCallback` is captured by the time
  // it returns. We don't await here — the callback only fires once the load below runs.
  const spanFinished = Sentry.startSpan(
    { name: 'lru-memoizer-check', op: 'run' },
    span =>
      new Promise<void>(resolve => {
        memoizedFn({ foo: 'bar' }, () => {
          span.setAttribute(
            'memoized.context_preserved',
            Sentry.getActiveSpan()?.spanContext().spanId === span.spanContext().spanId,
          );
          resolve();
        });
      }),
  );

  // Fire the load outside the span's context, so the assertion above proves the context was restored.
  memoizerLoadCallback?.();

  await spanFinished;

  return NextResponse.json({ status: 'ok' });
}
