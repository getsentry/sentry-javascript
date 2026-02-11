import { type Instrumentation, registerInstrumentations } from '@opentelemetry/instrumentation';

/** Exported only for tests. */
export const INSTRUMENTED: Record<string, Instrumentation> = {};

export function generateInstrumentOnce<
  Options,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  InstrumentationClass extends new (...args: any[]) => Instrumentation,
>(
  name: string,
  instrumentationClass: InstrumentationClass,
  optionsCallback: (options: Options) => ConstructorParameters<InstrumentationClass>[0],
): ((options: Options) => InstanceType<InstrumentationClass>) & { id: string };
export function generateInstrumentOnce<
  Options = unknown,
  InstrumentationInstance extends Instrumentation = Instrumentation,
>(
  name: string,
  creator: (options?: Options) => InstrumentationInstance,
): ((options?: Options) => InstrumentationInstance) & { id: string };
/**
 * Instrument an OpenTelemetry instrumentation once.
 * This will skip running instrumentation again if it was already instrumented.
 */
export function generateInstrumentOnce<Options>(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creatorOrClass: (new (...args: any[]) => Instrumentation) | ((options?: Options) => Instrumentation),
  optionsCallback?: (options: Options) => unknown,
): ((options: Options) => Instrumentation) & { id: string } {
  if (optionsCallback) {
    return _generateInstrumentOnceWithOptions(
      name,
      creatorOrClass as new (...args: unknown[]) => Instrumentation,
      optionsCallback,
    );
  }

  return _generateInstrumentOnce(name, creatorOrClass as (options?: Options) => Instrumentation);
}

// The plain version without handling of options
// Should not be used with custom options that are mutated in the creator!
function _generateInstrumentOnce<Options = unknown, InstrumentationInstance extends Instrumentation = Instrumentation>(
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

// This version handles options properly
function _generateInstrumentOnceWithOptions<
  Options,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  InstrumentationClass extends new (...args: any[]) => Instrumentation,
>(
  name: string,
  instrumentationClass: InstrumentationClass,
  optionsCallback: (options: Options) => ConstructorParameters<InstrumentationClass>[0],
): ((options: Options) => InstanceType<InstrumentationClass>) & { id: string } {
  return Object.assign(
    (_options: Options) => {
      const options = optionsCallback(_options);

      const instrumented = INSTRUMENTED[name] as InstanceType<InstrumentationClass> | undefined;
      if (instrumented) {
        // Ensure we update options
        instrumented.setConfig(options);
        return instrumented;
      }

      const instrumentation = new instrumentationClass(options) as InstanceType<InstrumentationClass>;
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
