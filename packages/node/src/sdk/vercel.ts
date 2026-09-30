import type { Client, Span } from '@sentry/core';
import { getActiveSpan, getRootSpan, GLOBAL_OBJ } from '@sentry/core';
import type { HttpServerResponse } from '@sentry/core/server';
import { subscribeDiagnosticsChannel } from '@sentry/server-utils';

// On Vercel, `http.server.request.start` fires without the request context, while this channel fires with it.
const HTTP_ON_SERVER_RESPONSE_FINISH = 'http.server.response.finish';

// Some frameworks end the request's root span shortly after the response closes.
const ROOT_SPAN_END_TIMEOUT_MS = 2000;

interface VercelRequestContext {
  waitUntil?: (task: Promise<unknown>) => void;
}

/**
 * Keeps Vercel Node.js functions alive until the SDK has sent the telemetry of each request.
 *
 * Vercel can suspend a function as soon as the response is sent, so buffered events, spans, logs and metrics
 * (and the timers that flush them) arrive late or never. When a response
 * finishes, we register one `waitUntil` that waits for the response to close and the request's root span to
 * end, and then flushes the client.
 */
export function setupVercelKeepAlive(client: Client): void {
  // Ensure we flush events when vercel functions are ended
  // See: https://vercel.com/docs/functions/functions-api-reference#sigterm-signal
  process.on('SIGTERM', async () => {
    // We have 500ms for processing here, so we try to make sure to have enough time to send the events
    await client.flush(200);
  });

  subscribeDiagnosticsChannel(HTTP_ON_SERVER_RESPONSE_FINISH, message => {
    const { response } = message as { response?: HttpServerResponse };
    const requestContext = (
      GLOBAL_OBJ as unknown as Record<symbol, { get?(): VercelRequestContext | undefined } | undefined>
    )[Symbol.for('@vercel/request-context')]?.get?.();
    if (!response || !requestContext?.waitUntil) {
      return;
    }

    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan && getRootSpan(activeSpan);

    requestContext.waitUntil(
      new Promise<void>(resolve => response.once('close', resolve))
        .then(() => rootSpan && waitForSpanEnd(client, rootSpan, ROOT_SPAN_END_TIMEOUT_MS))
        .then(() => client.flush(2000)),
    );
  });
}

function waitForSpanEnd(client: Client, span: Span, timeout: number): Promise<void> {
  // Ended and unsampled spans are not recording.
  if (!span.isRecording()) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const done = (): void => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, timeout);
    const unsubscribe = client.on('spanEnd', endedSpan => {
      if (endedSpan === span) {
        done();
      }
    });
  });
}
