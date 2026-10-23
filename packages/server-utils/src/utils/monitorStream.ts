import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

/**
 * Monitor the source without reading ahead or treating cancellation as a source failure.
 *
 * `onDone` runs once, while the returned stream is still open: before it closes, before it errors,
 * or when the consumer cancels it. A runtime can end the request when the response body closes
 * (Cloudflare Workers then reject `waitUntil`), so work that `onDone` starts must begin first.
 */
export function monitorStream(
  stream: ReadableStream<Uint8Array>,
  onDone: () => void,
  onError: (error: unknown) => void,
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  let finished = false;
  const finish = (error?: { error: unknown }): void => {
    if (finished) {
      return;
    }
    finished = true;
    // A callback that throws must not fail the response body.
    try {
      if (error) {
        onError(error.error);
      }
      onDone();
    } catch (e) {
      DEBUG_BUILD && debug.error('Error when a monitored stream finished:', e);
    }
  };

  return new ReadableStream<Uint8Array>(
    {
      // Locks the source only once the stream exists, so a constructor that throws leaves it usable.
      start() {
        reader = stream.getReader();
        // A source can fail while no one reads from it. A cancelled reader closes normally; only a
        // source failure should be captured as an error.
        void reader.closed.then(
          () => finish(),
          error => finish({ error }),
        );
      },
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            finish();
            controller.close();
            reader.releaseLock();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          finish({ error });
          controller.error(error);
          reader.releaseLock();
        }
      },
      async cancel(reason) {
        finish();
        try {
          await reader.cancel(reason);
        } finally {
          reader.releaseLock();
        }
      },
    },
    { highWaterMark: 0 },
  );
}
