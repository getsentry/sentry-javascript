// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';

Deno.test('reader.closed.then(f, f) suppresses rejection when releaseLock is called on an open stream', async () => {
  // Reproduces the bug from GitHub issue #20177:
  // In monitorStream, reader.releaseLock() is called while the source stream
  // is still open (e.g. the error path when controller.enqueue() throws).
  // Per WHATWG Streams spec, this rejects reader.closed with a TypeError.
  // Using .then(onDone, onDone) handles both cases; .finally() would propagate
  // the rejection as unhandled.

  let onDoneCalled = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data'));
      // intentionally not closing — stream stays open
    },
  });

  const reader = stream.getReader();

  // This is the exact pattern from monitorStream (line 84 in streaming.ts).
  // With .finally(() => onDone()), this would propagate the rejection.
  reader.closed.then(
    () => {
      onDoneCalled = true;
    },
    () => {
      onDoneCalled = true;
    },
  );

  await reader.read();

  // This is what monitorStream does on the error path (line 98) when
  // controller.enqueue() throws — releaseLock while the source is still open.
  reader.releaseLock();

  let unhandledRejection: PromiseRejectionEvent | undefined;
  const handler = (e: PromiseRejectionEvent): void => {
    e.preventDefault();
    unhandledRejection = e;
  };
  globalThis.addEventListener('unhandledrejection', handler);

  try {
    await new Promise(resolve => setTimeout(resolve, 50));

    assertEquals(onDoneCalled, true, 'onDone should have been called via the rejection handler');
    assertEquals(unhandledRejection, undefined, 'should not have caused an unhandled promise rejection');
  } finally {
    globalThis.removeEventListener('unhandledrejection', handler);
  }
});
