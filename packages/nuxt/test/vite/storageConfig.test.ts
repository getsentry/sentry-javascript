import type { Nitro } from 'nitropack/types';
import { describe, expect, it, vi } from 'vitest';
import { addCacheStorageInstrumentation } from '../../src/vite/storageConfig';

vi.mock('@nuxt/kit', () => ({
  addNitroPlugin: vi.fn(),
  createResolver: () => ({ resolve: (path: string) => `/module/${path.replace('./', '')}` }),
}));

vi.mock('../../src/vendor/server-template', () => ({
  addServerTemplate: vi.fn(),
}));

type TransformHook = (code: string, id: string) => { code: string } | null;

function getCacheStorageTransform(cacheDriver?: string): TransformHook {
  let rollupBeforeHook: ((nitro: Nitro, config: { plugins?: unknown }) => void) | undefined;
  const nitro = {
    options: { cache: cacheDriver ? { driver: cacheDriver } : undefined },
    hooks: { hook: (_name: string, callback: typeof rollupBeforeHook) => (rollupBeforeHook = callback) },
  } as unknown as Nitro;

  addCacheStorageInstrumentation(nitro);

  const rollupConfig: { plugins?: unknown } = {};
  rollupBeforeHook?.(nitro, rollupConfig);

  return (rollupConfig.plugins as Array<{ transform: TransformHook }>)[0]!.transform;
}

const MEMORY_CACHE_MODULE = `import { createMemoryStorage } from "ocache";
export const createCacheStorage = () => createMemoryStorage({});

export const cacheFunctionDefaults = {};
`;

describe('addCacheStorageInstrumentation', () => {
  it('wraps the storage created by the cache virtual module', () => {
    const transform = getCacheStorageTransform('fs');

    expect(transform(MEMORY_CACHE_MODULE, '#nitro/virtual/cache')?.code).toBe(
      `import { instrumentCacheStorage } from "/module/runtime/utils/instrumentStorage";
import { createMemoryStorage } from "ocache";
const createUninstrumentedCacheStorage = () => createMemoryStorage({});

export const cacheFunctionDefaults = {};

export const createCacheStorage = () => instrumentCacheStorage(createUninstrumentedCacheStorage(), "fs");
`,
    );
  });

  it('defaults the driver name to the default memory driver', () => {
    const transform = getCacheStorageTransform();

    expect(transform(MEMORY_CACHE_MODULE, '#nitro/virtual/cache')?.code).toContain(
      'instrumentCacheStorage(createUninstrumentedCacheStorage(), "memory")',
    );
  });

  it('leaves the kv driver to the storage driver instrumentation', () => {
    const transform = getCacheStorageTransform('kv');

    expect(
      transform(
        'export { createKVCacheStorage as createCacheStorage } from "#nitro/runtime/cache-kv";',
        '#nitro/virtual/cache',
      ),
    ).toBeNull();
  });

  it('ignores other modules', () => {
    const transform = getCacheStorageTransform();

    expect(transform(MEMORY_CACHE_MODULE, '/app/server/api/cache.ts')).toBeNull();
  });
});
