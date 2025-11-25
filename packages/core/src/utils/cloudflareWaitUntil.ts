import { GLOBAL_OBJ } from './worldwide';

export type MinimalCloudflareContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  waitUntil(promise: Promise<any>): void;
};

/**
 * Gets the Cloudflare context from the global object.
 */
function _getCloudflareContext(): MinimalCloudflareContext | undefined {
  const cfContextSymbol = Symbol.for('__cloudflare-context__');
  const globalWithCfContext = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
    [cfContextSymbol]?: {
      ctx: MinimalCloudflareContext;
    };
  };

  return globalWithCfContext[cfContextSymbol]?.ctx;
}

/**
 * Function that delays closing of a Cloudflare lambda until the provided promise is resolved.
 */
export function cloudflareWaitUntil(task: Promise<unknown>): void {
  _getCloudflareContext()?.waitUntil(task);
}

/**
 * Checks if the Cloudflare waitUntil function is available globally.
 */
export function isCloudflareWaitUntilAvailable(): boolean {
  return typeof _getCloudflareContext()?.waitUntil === 'function';
}
