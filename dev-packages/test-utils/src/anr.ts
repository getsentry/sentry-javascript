import * as inspector from 'inspector';

/**
 * Waits for the ANR worker's debugger to be fully ready before executing callback.
 *
 * The ANR worker creates an InspectorSession and connects to the main thread's debugger.
 * We poll inspector.url() to detect when the debugger is active, then wait 200ms for the
 * async session setup to complete.
 */
export function waitForDebuggerReady(cb: () => void): void {
  const check = (): void => {
    if (inspector.url()) {
      setTimeout(cb, 200);
    } else {
      setImmediate(check);
    }
  };
  setImmediate(check);
}
