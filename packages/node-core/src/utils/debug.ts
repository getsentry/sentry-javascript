let cachedDebuggerEnabled: boolean | undefined;

/**
 * Was the debugger enabled when this function was first called?
 */
export async function isDebuggerEnabled(): Promise<boolean> {
  if (cachedDebuggerEnabled === undefined) {
    try {
      // Node can be built without inspector support
      const inspector = await import('node:inspector');
      cachedDebuggerEnabled = !!inspector.url();
    } catch {
      cachedDebuggerEnabled = false;
    }
  }

  return cachedDebuggerEnabled;
}
