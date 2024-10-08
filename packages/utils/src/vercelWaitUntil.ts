import { GLOBAL_OBJ } from './worldwide';

interface VercelRequestContextGlobal {
  get?(): {
    waitUntil?: (task: Promise<unknown>) => void;
  };
}

/**
 * Function that delays closing of a Vercel lambda until the provided promise is resolved.
 *
 * Vendored from https://www.npmjs.com/package/@vercel/functions
 */
export function vercelWaitUntil(task: Promise<unknown>): void {
  const vercelRequestContextGlobal: VercelRequestContextGlobal | undefined =
    // @ts-expect-error This is not typed
    GLOBAL_OBJ[Symbol.for('@vercel/request-context')];

  const ctx =
    vercelRequestContextGlobal && vercelRequestContextGlobal.get && vercelRequestContextGlobal.get()
      ? vercelRequestContextGlobal.get()
      : {};

  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(task);
  }
}
