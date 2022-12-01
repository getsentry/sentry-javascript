// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
(global as any).__rewriteFramesDistDir__ = '__DIST_DIR__';

// We need this to make this file an ESM module, which TS requires when using `isolatedModules`, but it doesn't affect
// the end result - Rollup recognizes that it's a no-op and doesn't include it when building our code.
export {};
