import { startSpan } from '@sentry/node';
// We need to import `* as` due to Rollup cjs interop issues
import * as iitm from 'import-in-the-middle';
import type { HookFn } from 'import-in-the-middle';

type CacheHandlerClass = {
  new (options: unknown): CacheHandlerClass;
  get(key: string): Promise<unknown | null>;
  set(key: string, data: unknown, ctx: unknown): Promise<void>;
  revalidateTag(tag: string): Promise<void>;
};

/**
 * Hooks the loading of the cache handler module at the `cacheHandlerPath` and wraps the class to add cache spans around
 * the get and set methods.
 */
export function enableCacheInstrumentation(cacheHandlerPath: string): void {
  // We only hook the specific path of the cache handler module
  new iitm.Hook([cacheHandlerPath], ((exports: { default: CacheHandlerClass }) => {
    // Grab the existing default export which should be the user defined cache handler
    const UserCache = exports.default;

    // Define a new class that extends the user defined cache handler
    class CacheHandler extends UserCache {
      public constructor(options: unknown) {
        super(options);
      }

      public async get(key: string): Promise<unknown | null> {
        return startSpan(
          {
            name: key,
            attributes: { 'cache.key': [key] },
            op: 'cache.get',
          },
          async span => {
            const value = await super.get(key);
            span.setAttribute('cache.hit', value !== null);
            return value;
          },
        );
      }

      public async set(key: string, data: unknown, ctx: unknown): Promise<void> {
        await startSpan(
          {
            name: key,
            attributes: { 'cache.key': [key] },
            op: 'cache.put',
          },
          async _ => {
            await super.set(key, data, ctx);
          },
        );
      }
    }

    // Overwrite the default export with the new CacheHandler class
    exports.default = CacheHandler;
  }) as unknown as HookFn);
}
