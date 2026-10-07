/** Monitor the source without reading ahead or treating cancellation as a source failure. */
export function monitorStream(
  stream: ReadableStream<Uint8Array>,
  onDone: () => void,
  onError: (error: unknown) => void,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  // A cancelled reader closes normally; only a source failure should be captured as an error.
  void reader.closed.then(onDone, error => {
    onError(error);
    onDone();
  });

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            reader.releaseLock();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
          reader.releaseLock();
        }
      },
      async cancel(reason) {
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
