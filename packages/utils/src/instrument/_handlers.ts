import { DEBUG_BUILD } from '../debug-build';
import { logger } from '../logger';
import { getFunctionName } from '../stacktrace';

export type InstrumentHandlerType = 'console' | 'dom' | 'fetch' | 'history' | 'xhr' | 'error' | 'unhandledrejection';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InstrumentHandlerCallback = (data: any) => void;

// We keep the handlers globally
const handlers: { [key in InstrumentHandlerType]?: InstrumentHandlerCallback[] } = {};
const instrumented: { [key in InstrumentHandlerType]?: boolean } = {};

/** Add a handler function. */
export function addHandler(type: InstrumentHandlerType, handler: InstrumentHandlerCallback): void {
  handlers[type] = handlers[type] || [];
  (handlers[type] as InstrumentHandlerCallback[]).push(handler);
}

/**
 * Reset all instrumentation handlers.
 * This can be used by tests to ensure we have a clean slate of instrumentation handlers.
 */
export function resetInstrumentationHandlers(): void {
  Object.keys(handlers).forEach(key => {
    handlers[key as InstrumentHandlerType] = undefined;
  });
}

/** Maybe run an instrumentation function, unless it was already called. */
export function maybeInstrument(type: InstrumentHandlerType, instrumentFn: () => void): void {
  if (!instrumented[type]) {
    instrumentFn();
    instrumented[type] = true;
  }
}

/** Trigger handlers for a given instrumentation type. */
export function triggerHandlers(type: InstrumentHandlerType, data: unknown): void {
  const typeHandlers = type && handlers[type];
  if (!typeHandlers) {
    return;
  }

  for (const handler of typeHandlers) {
    try {
      handler(data);
    } catch (e) {
      DEBUG_BUILD &&
        logger.error(
          `Error while triggering instrumentation handler.\nType: ${type}\nName: ${getFunctionName(handler)}\nError:`,
          e,
        );
    }
  }
}
