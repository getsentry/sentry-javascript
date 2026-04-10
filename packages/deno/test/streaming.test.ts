// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';

/**
 * Minimal reproduction of monitorStream to verify that reader.releaseLock()
 * after stream completion does not cause an unhandled promise rejection.
 *
 * Per the WHATWG Streams spec, releaseLock() rejects reader.closed.
 * Using .then(onDone, onDone) handles both the fulfilled and rejected cases
 * so the rejection is suppressed.
 */
function monitorStream(
  stream: ReadableStream<Uint8Array>,
  onDone: () => void,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  reader.closed.then(() => onDone(), () => onDone());
  return new ReadableStream({
    async start(controller) {
      let result: ReadableStreamReadResult<Uint8Array>;
      do {
        result = await reader.read();
        if (result.value) {
          try {
            controller.enqueue(result.value);
          } catch (er) {
            controller.error(er);
            reader.releaseLock();
            return;
          }
        }
      } while (!result.done);
      controller.close();
      reader.releaseLock();
    },
  });
}

Deno.test('monitorStream calls onDone and does not cause unhandled rejection after normal completion', async () => {
  let doneCalled = false;

  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('chunk1'));
      controller.enqueue(new TextEncoder().encode('chunk2'));
      controller.close();
    },
  });

  const monitored = monitorStream(source, () => {
    doneCalled = true;
  });

  // Listen for unhandled rejections — the bug caused one here.
  let unhandledRejection: PromiseRejectionEvent | undefined;
  const handler = (e: PromiseRejectionEvent): void => {
    e.preventDefault();
    unhandledRejection = e;
  };
  globalThis.addEventListener('unhandledrejection', handler);

  try {
    const reader = monitored.getReader();
    const chunks: string[] = [];
    const decoder = new TextDecoder();

    let result: ReadableStreamReadResult<Uint8Array>;
    do {
      result = await reader.read();
      if (result.value) {
        chunks.push(decoder.decode(result.value));
      }
    } while (!result.done);
    reader.releaseLock();

    assertEquals(chunks, ['chunk1', 'chunk2']);

    // Give microtasks a chance to settle so any unhandled rejection fires.
    await new Promise(resolve => setTimeout(resolve, 50));

    assertEquals(doneCalled, true, 'onDone callback should have been called');
    assertEquals(unhandledRejection, undefined, 'should not have caused an unhandled promise rejection');
  } finally {
    globalThis.removeEventListener('unhandledrejection', handler);
  }
});

