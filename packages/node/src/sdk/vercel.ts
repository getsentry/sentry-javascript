import type { Client, Span } from '@sentry/core';
import { getActiveSpan, getRootSpan, GLOBAL_OBJ } from '@sentry/core';
import type { HttpServerResponse } from '@sentry/core/server';
import { _INTERNAL_safeUnref } from '@sentry/core/server';
import { subscribeDiagnosticsChannel } from '@sentry/server-utils';

// On Vercel, `http.server.request.start` fires without the request context, while this channel fires with it.
const HTTP_ON_SERVER_RESPONSE_FINISH = 'http.server.response.finish';

// Some frameworks end the request's root span shortly after the response closes.
const REQUEST_END_TIMEOUT_MS = 2000;

interface VercelRequestContextGlobal {
  get?(): { waitUntil?: (task: Promise<unknown>) => void } | undefined;
}

/**
 * Keeps Vercel Node.js functions alive until the SDK has sent the telemetry of each request.
 *
 * Vercel can suspend a function as soon as the response is sent, so buffered events, spans, logs and metrics
 * (and the timers that flush them) arrive late or never. When a response
 * finishes, we register one `waitUntil` that waits for the response to close and the request's root span to
 * end (2 seconds at most), and then flushes the client.
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
    const requestContextGlobal: VercelRequestContextGlobal | undefined =
      // @ts-expect-error Vercel sets this global, so `GLOBAL_OBJ` does not type it
      GLOBAL_OBJ[Symbol.for('@vercel/request-context')];
    const requestContext = requestContextGlobal?.get?.();
    if (!response || !requestContext?.waitUntil) {
      return;
    }

    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan && getRootSpan(activeSpan);

    requestContext.waitUntil(
      waitForRequestEnd(client, response, rootSpan, REQUEST_END_TIMEOUT_MS).then(() => client.flush(2000)),
    );
  });
}

function waitForRequestEnd(
  client: Client,
  response: HttpServerResponse,
  rootSpan: Span | undefined,
  timeout: number,
): Promise<void> {
  return new Promise(resolve => {
    let responseClosed = false;
    // Ended and unsampled spans are not recording.
    let rootSpanEnded = !rootSpan?.isRecording();

    const done = (): void => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const doneIfRequestEnded = (): void => {
      if (responseClosed && rootSpanEnded) {
        done();
      }
    };

    const timer = _INTERNAL_safeUnref(setTimeout(done, timeout));
    const unsubscribe = client.on('spanEnd', span => {
      if (span === rootSpan) {
        rootSpanEnded = true;
        doneIfRequestEnded();
      }
    });
    response.once('close', () => {
      responseClosed = true;
      doneIfRequestEnded();
    });
  });
}
