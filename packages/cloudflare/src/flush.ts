import type { ExecutionContext } from '@cloudflare/workers-types';

type FlushLock = {
  readonly ready: Promise<void>;
  readonly finalize: () => Promise<void>;
};

const kFlushLock = Symbol.for('kFlushLock');

function getInstrumentedLock<T extends object>(o: T): FlushLock | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(o, kFlushLock);
  if (descriptor?.value) return descriptor.value as FlushLock;
  return undefined;
}

function storeInstrumentedLock<T extends object>(o: T, lock: FlushLock): void {
  Object.defineProperty(o, kFlushLock, {
    value: lock,
    enumerable: false,
    configurable: true,
    writable: false,
  });
}

/**
 * Enhances the given execution context by wrapping its `waitUntil` method with a proxy
 * to monitor pending tasks, and provides a flusher function to ensure all tasks
 * have been completed before executing any subsequent logic.
 *
 * @param {ExecutionContext} context - The execution context to be enhanced. If no context is provided, the function returns undefined.
 * @return {FlushLock} Returns a flusher function if a valid context is provided, otherwise undefined.
 */
export function makeFlushLock(context: ExecutionContext): FlushLock {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  let lock = getInstrumentedLock(context.waitUntil);
  if (lock) {
    return lock;
  }
  let pending = 0;
  const originalWaitUntil = context.waitUntil.bind(context) as typeof context.waitUntil;
  const { promise, resolve } = Promise.withResolvers();
  const hijackedWaitUntil: typeof originalWaitUntil = promise => {
    pending++;
    return originalWaitUntil(
      promise.finally(() => {
        if (--pending === 0) resolve();
      }),
    );
  };
  lock = Object.freeze({
    ready: promise,
    finalize: () => {
      if (pending === 0) resolve();
      return promise;
    },
  }) as FlushLock;
  storeInstrumentedLock(hijackedWaitUntil, lock);
  context.waitUntil = hijackedWaitUntil;

  return lock;
}
