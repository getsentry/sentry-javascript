import { startSpan } from '@sentry/node';
// We need to import `* as` due to Rollup cjs interop issues
import * as iitm from 'import-in-the-middle';

type CacheHandlerClass = {
  new (options: unknown): CacheHandlerClass;
  get(key: string): Promise<unknown | null>;
  set(key: string, data: unknown, ctx: unknown): Promise<void>;
};

function looksLikeCacheHandlerClass(obj: unknown): obj is CacheHandlerClass {
  return (
    typeof obj === 'function' && typeof obj.prototype === 'object' && 'get' in obj.prototype && 'set' in obj.prototype
  );
}

/**
 * Hooks the loading of the cache handler module at the `cacheHandlerPath` and wraps the class to add cache spans around
 * the get and set methods.
 */
export function enableCacheInstrumentation(cacheHandlerPath: string): void {
  // We only hook the specific path of the cache handler module
  new iitm.Hook([cacheHandlerPath], exports => {
    if (!looksLikeCacheHandlerClass(exports.default)) {
      return;
    }

    // Grab the existing default export which should be the user defined cache handler
    const UserCache = exports.default;

    // Define a new class that extends the user defined cache handler
    class SentryCacheHandlerWrapper extends UserCache {
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
            // The nextjs docs say that null is a cache miss, but we'll also consider undefined since their example
            // simple cache handler returns undefined for a cache miss.
            // https://nextjs.org/docs/app/building-your-application/deploying#configuring-caching
            const cacheHit = value !== null && value !== undefined;
            span.setAttribute('cache.hit', cacheHit);
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
    exports.default = SentryCacheHandlerWrapper;
  });
}
