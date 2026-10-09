import type { Nuxt } from '@nuxt/schema';
import { describe, expect, it, vi } from 'vitest';
import type * as viteUtils from '../src/vite/utils';

vi.mock('@nuxt/kit', () => ({
  addPlugin: vi.fn(),
  addPluginTemplate: vi.fn(),
  addTemplate: vi.fn(),
  addVitePlugin: vi.fn(),
  createResolver: vi.fn(() => ({ resolve: (input: string) => input })),
  defineNuxtModule: (definition: unknown) => definition,
}));

vi.mock('../src/vite/utils', async importOriginal => ({
  ...(await importOriginal<typeof viteUtils>()),
  resolveServerApi: vi.fn(() => 'nitropack'),
  findDefaultSdkInitFile: vi.fn((type: string) => `/app/sentry.${type}.config.ts`),
}));

vi.mock('../src/vite/nitroServer', () => ({ setupNitroServer: vi.fn() }));
vi.mock('../src/vite/orchestrion', () => ({ setupOrchestrion: vi.fn() }));
vi.mock('../src/vite/sourceMaps', () => ({ setupSourceMaps: vi.fn() }));

describe('Sentry Nuxt module', () => {
  // Nuxt writes every alias into the `paths` of the generated `.nuxt/tsconfig.*.json` files,
  // where vue-tsc rejects bare specifiers (TS5090) (https://github.com/getsentry/sentry-javascript/issues/25188)
  it.each(['3.17.0', '4.5.2'])('does not add Nuxt aliases in dev mode (Nuxt %s)', async version => {
    const { default: sentryModule } = await import('../src/module');
    const nuxt = {
      _version: version,
      options: { dev: true, alias: {}, buildDir: '/app/.nuxt' },
      hook: vi.fn(),
      hooks: { hook: vi.fn() },
    } as unknown as Nuxt;

    await (sentryModule as unknown as { setup: (options: object, nuxt: Nuxt) => Promise<void> }).setup({}, nuxt);

    expect(nuxt.options.alias).toEqual({});
  });
});
