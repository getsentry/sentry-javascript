import { GLOBAL_OBJ } from './worldwide';

declare const EdgeRuntime: string | undefined;

interface VercelRequestContextGlobal {
  get?():
    | {
        waitUntil?: (task: Promise<unknown>) => void;
      }
    | undefined;
}

/**
 * Function that delays closing of a Vercel lambda until the provided promise is resolved.
 *
 * Vendored from https://www.npmjs.com/package/@vercel/functions
 */
export function vercelWaitUntil(task: Promise<unknown>): void {
  // We only flush manually in Vercel Edge runtime
  // In Node runtime, we use process.on('SIGTERM') instead
  if (typeof EdgeRuntime !== 'string') {
    return;
  }
  const vercelRequestContextGlobal: VercelRequestContextGlobal | undefined =
    // @ts-expect-error This is not typed
    GLOBAL_OBJ[Symbol.for('@vercel/request-context')];

  const ctx = vercelRequestContextGlobal?.get?.();

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
  }
}
