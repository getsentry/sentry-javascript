/**
 * Has the debugger been enabled via the command line?
 */
export function isDebuggerEnabled(): boolean {
  return process.execArgv.some(arg => arg.startsWith('--inspect'));
}
