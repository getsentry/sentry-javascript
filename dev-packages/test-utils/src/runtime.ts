export type Runtime = 'node' | 'bun' | 'deno' | 'cloudflare';

const RUNTIMES: readonly Runtime[] = ['node', 'bun', 'deno', 'cloudflare'];

/**
 * Returns the server runtime a test app runs on, read from the `RUNTIME` env var that runtime variants
 * set in their assert script. Defaults to `node`.
 */
export function getRuntime(): Runtime {
  const runtime = process.env.RUNTIME || 'node';

  if (!RUNTIMES.includes(runtime as Runtime)) {
    throw new Error(`Unknown RUNTIME "${runtime}", expected one of: ${RUNTIMES.join(', ')}`);
  }

  return runtime as Runtime;
}
