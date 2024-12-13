import { type Instrumentation, registerInstrumentations } from '@opentelemetry/instrumentation';

/** Exported only for tests. */
export const INSTRUMENTED: Record<string, Instrumentation> = {};

/**
 * Instrument an OpenTelemetry instrumentation once.
 * This will skip running instrumentation again if it was already instrumented.
 */
export function generateInstrumentOnce<Options = unknown>(
  name: string,
  creator: (options?: Options) => Instrumentation,
): ((options?: Options) => void) & { id: string } {
  return Object.assign(
    (options?: Options) => {
      const instrumented = INSTRUMENTED[name];
      if (instrumented) {
        // If options are provided, ensure we update them
        if (options) {
          instrumented.setConfig(options);
        }
        return;
      }

      const instrumentation = creator(options);
      INSTRUMENTED[name] = instrumentation;

      registerInstrumentations({
        instrumentations: [instrumentation],
      });
    },
    { id: name },
  );
}
