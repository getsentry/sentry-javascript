import { GLOBAL_OBJ } from './worldwide';

export type MinimalCloudflareContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  waitUntil(promise: Promise<any>): void;
};

export const CloudflareContextKey = '__cloudflare-context__';

/**
 * Function that delays closing of a Cloudflare lambda until the provided promise is resolved.
 */
export function cloudflareWaitUntil(task: Promise<unknown>): void {
  try {
    const cfContextSymbol = Symbol.for(CloudflareContextKey);
    const globalWithCfContext = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
      [cfContextSymbol]: {
        ctx: MinimalCloudflareContext;
      };
    };

    const context = globalWithCfContext[cfContextSymbol].ctx;

    if (typeof context.waitUntil === 'function') {
      context.waitUntil(task);
    }
  } catch {
    // Ignore errors
  }
}
