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
 * This depends on wrapping `_wrap` (inception!). If this is not possible (e.g. the property name is mangled, ...)
 * the callback will be called immediately.
 */
export function callWhenWrapped<T extends Instrumentation>(instrumentation: T, callback: () => void): void {
  if (!hasWrap(instrumentation)) {
    callback();
    return;
  }

  const originalWrap = instrumentation['_wrap'];

  instrumentation['_wrap'] = (...args: Parameters<typeof originalWrap>) => {
    callback();
    return originalWrap(...args);
  };
}

function hasWrap<T extends Instrumentation>(
  instrumentation: T,
): instrumentation is T & { _wrap: (...args: unknown[]) => unknown } {
  return typeof (instrumentation as T & { _wrap?: (...args: unknown[]) => unknown })['_wrap'] === 'function';
}
