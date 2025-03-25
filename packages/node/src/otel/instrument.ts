import { type Instrumentation, registerInstrumentations } from '@opentelemetry/instrumentation';

/** Exported only for tests. */
export const INSTRUMENTED: Record<string, Instrumentation> = {};

/**
 * Instrument an OpenTelemetry instrumentation once.
 * This will skip running instrumentation again if it was already instrumented.
 */
export function generateInstrumentOnce<
  Options = unknown,
  InstrumentationInstance extends Instrumentation = Instrumentation,
>(
  name: string,
  creator: (options?: Options) => InstrumentationInstance,
): ((options?: Options) => InstrumentationInstance) & { id: string } {
  return Object.assign(
    (options?: Options) => {
      const instrumented = INSTRUMENTED[name] as InstrumentationInstance | undefined;
      if (instrumented) {
        // If options are provided, ensure we update them
        if (options) {
          instrumented.setConfig(options);
        }
        return instrumented;
      }

      const instrumentation = creator(options);
      INSTRUMENTED[name] = instrumentation;

      registerInstrumentations({
        instrumentations: [instrumentation],
      });

      return instrumentation;
    },
    { id: name },
  );
}

/**
 * Ensure a given callback is called when the instrumentation is actually wrapping something.
 * This can be used to ensure some logic is only called when the instrumentation is actually active.
 *
 * This function returns a function that can be invoked with a callback.
 * This callback will either be invoked immediately
 * (e.g. if the instrumentation was already wrapped, or if _wrap could not be patched),
 * or once the instrumentation is actually wrapping something.
 *
 * Make sure to call this function right after adding the instrumentation, otherwise it may be too late!
 * The returned callback can be used any time, and also multiple times.
 */
export function instrumentWhenWrapped<T extends Instrumentation>(instrumentation: T): (callback: () => void) => void {
  let isWrapped = false;
  let callbacks: (() => void)[] = [];

  if (!hasWrap(instrumentation)) {
    isWrapped = true;
  } else {
    const originalWrap = instrumentation['_wrap'];

    instrumentation['_wrap'] = (...args: Parameters<typeof originalWrap>) => {
      isWrapped = true;
      callbacks.forEach(callback => callback());
      callbacks = [];
      return originalWrap(...args);
    };
  }

  const registerCallback = (callback: () => void): void => {
    if (isWrapped) {
      callback();
    } else {
      callbacks.push(callback);
    }
  };

  return registerCallback;
}

function hasWrap<T extends Instrumentation>(
  instrumentation: T,
): instrumentation is T & { _wrap: (...args: unknown[]) => unknown } {
  return typeof (instrumentation as T & { _wrap?: (...args: unknown[]) => unknown })['_wrap'] === 'function';
}
