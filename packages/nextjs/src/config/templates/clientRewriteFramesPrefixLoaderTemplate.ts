/* eslint-disable no-restricted-globals */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

(window as any).__rewriteFramesAssetPrefixPath__ = '__ASSET_PREFIX_PATH__';

// We need this to make this file an ESM module, which TS requires when using `isolatedModules`, but it doesn't affect
// the end result - Rollup recognizes that it's a no-op and doesn't include it when building our code.
export {};
