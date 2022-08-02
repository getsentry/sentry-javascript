// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
(global as any).__rewriteFramesDistDir__ = '__DIST_DIR__';

// We need this to make this file an ESM module, which TS requires when using `isolatedModules`.
export {};
