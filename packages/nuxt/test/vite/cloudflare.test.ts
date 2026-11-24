import type { Nuxt } from '@nuxt/schema';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollup, type RollupLog } from 'rollup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupCloudflareEntry, wrapCloudflareEntryWithSentry } from '../../src/vite/cloudflare';

vi.mock('@nuxt/kit', () => ({
  createResolver: () => ({ resolve: (input: string) => input }),
}));

type HookCallback = (arg: unknown) => void;

describe('wrapCloudflareEntryWithSentry', () => {
  let dir: string;
  let entry: string;
  let optionsFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sentry-nuxt-cloudflare-'));
    // Like the entry of Nitro, without a file extension.
    entry = join(dir, 'entry');
    optionsFile = join(dir, 'instrument.server.mjs');
    writeFileSync(optionsFile, "export default () => ({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });\n");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('wraps the default export and `$DurableObject` with the runtime wrappers and keeps the other exports', async () => {
    writeFileSync(
      `${entry}.mjs`,
      "export default { fetch: () => 'response' };\nexport class $DurableObject {}\nexport const other = 'value';\n",
    );

    const bundle = await rollup({
      input: entry,
      plugins: [
        wrapCloudflareEntryWithSentry(entry, optionsFile),
        {
          name: 'wrapper-stub',
          resolveId: source => (source === './runtime/utils/wrapCloudflareEntry' ? '\0wrapper-stub' : null),
          load: id =>
            id === '\0wrapper-stub'
              ? [
                  'export function wrapNitroCloudflareEntryWithSentry(optionsCallback, handler) {',
                  '  return { optionsCallback, handler };',
                  '}',
                  'export function wrapNitroDurableObjectWithSentry(optionsCallback, DurableObjectClass) {',
                  '  return { optionsCallback, DurableObjectClass };',
                  '}',
                ].join('\n')
              : null,
        },
      ],
    });
    const { output } = await bundle.generate({ format: 'cjs', exports: 'named' });
    const exports: Record<string, any> = {};
    // oxlint-disable-next-line typescript/no-implied-eval -- runs the generated bundle
    new Function('exports', output[0].code)(exports);

    expect(output[0].exports).toEqual(['$DurableObject', 'default', 'other']);
    expect(exports.default.handler.fetch()).toBe('response');
    expect(exports.default.optionsCallback()).toEqual({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
    expect(exports.$DurableObject.DurableObjectClass.name).toBe('$DurableObject');
    expect(exports.$DurableObject.optionsCallback).toBe(exports.default.optionsCallback);
    expect(exports.other).toBe('value');
  });

  it('does not import `wrapNitroDurableObjectWithSentry` for an entry without `$DurableObject`', async () => {
    writeFileSync(`${entry}.mjs`, 'export default {};\n');

    const bundle = await rollup({
      input: entry,
      plugins: [
        wrapCloudflareEntryWithSentry(entry, optionsFile),
        {
          name: 'wrapper-external',
          resolveId: source =>
            source === './runtime/utils/wrapCloudflareEntry' ? { id: source, external: true } : null,
        },
      ],
    });
    const { output } = await bundle.generate({ format: 'es' });

    expect(output[0].code).toContain('wrapNitroCloudflareEntryWithSentry(');
    expect(output[0].code).not.toContain('wrapNitroDurableObjectWithSentry');
  });

  it('wraps an entry that another plugin resolves first, as the Vite builder of Nitro 3 does', async () => {
    // The export list of the `cloudflare-module` entry of Nitro 3.
    writeFileSync(
      `${entry}.mjs`,
      [
        'class $DurableObject {}',
        "const cloudflare_module_default = { fetch: () => 'response' };",
        'export { $DurableObject, cloudflare_module_default as default };',
      ].join('\n'),
    );

    const bundle = await rollup({
      input: entry,
      plugins: [
        {
          name: 'resolve-like-vite',
          // Vite resolves a file with a query, and loads it from the path without the query.
          resolveId: (source, importer) =>
            source === entry && !importer
              ? `${entry}.mjs`
              : source.endsWith('?sentry-cloudflare-original')
                ? source
                : null,
          load: id =>
            id.endsWith('?sentry-cloudflare-original') ? readFileSync(id.slice(0, id.indexOf('?')), 'utf8') : null,
        },
        wrapCloudflareEntryWithSentry(entry, optionsFile),
        {
          name: 'wrapper-stub',
          resolveId: source => (source === './runtime/utils/wrapCloudflareEntry' ? '\0wrapper-stub' : null),
          load: id =>
            id === '\0wrapper-stub'
              ? [
                  'export function wrapNitroCloudflareEntryWithSentry(optionsCallback, handler) {',
                  '  return { optionsCallback, handler };',
                  '}',
                  'export function wrapNitroDurableObjectWithSentry(optionsCallback, DurableObjectClass) {',
                  '  return { optionsCallback, DurableObjectClass };',
                  '}',
                ].join('\n')
              : null,
        },
      ],
    });
    const { output } = await bundle.generate({ format: 'cjs', exports: 'named' });
    const exports: Record<string, any> = {};
    // oxlint-disable-next-line typescript/no-implied-eval -- runs the generated bundle
    new Function('exports', output[0].code)(exports);

    expect(output[0].exports).toEqual(['$DurableObject', 'default']);
    expect(exports.default.handler.fetch()).toBe('response');
    expect(exports.default.optionsCallback()).toEqual({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
    expect(exports.$DurableObject.DurableObjectClass.name).toBe('$DurableObject');
  });

  it('leaves an entry without a default export unwrapped and warns', async () => {
    writeFileSync(`${entry}.mjs`, "addEventListener('fetch', () => {});\n");
    const warnings: RollupLog[] = [];

    const bundle = await rollup({
      input: entry,
      plugins: [wrapCloudflareEntryWithSentry(entry, optionsFile)],
      onwarn: warning => warnings.push(warning),
    });
    const { output } = await bundle.generate({ format: 'es' });

    expect(output[0].code).not.toContain('wrapNitroCloudflareEntryWithSentry');
    expect(warnings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('The Nitro entry has no default export') }),
    ]);
  });

  it('leaves an entry without a default export unwrapped and warns when another plugin resolves it first', async () => {
    writeFileSync(`${entry}.mjs`, "addEventListener('fetch', () => {});\n");
    const warnings: RollupLog[] = [];

    const bundle = await rollup({
      input: entry,
      plugins: [
        {
          name: 'resolve-like-vite',
          resolveId: (source, importer) => (source === entry && !importer ? `${entry}.mjs` : null),
        },
        wrapCloudflareEntryWithSentry(entry, optionsFile),
      ],
      onwarn: warning => warnings.push(warning),
    });
    const { output } = await bundle.generate({ format: 'es' });

    expect(output[0].code).not.toContain('wrapNitroCloudflareEntryWithSentry');
    expect(warnings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('The Nitro entry has no default export') }),
    ]);
  });

  it('leaves other entries unwrapped', async () => {
    const otherEntry = join(dir, 'other.mjs');
    writeFileSync(otherEntry, 'export default {};\n');

    const bundle = await rollup({ input: otherEntry, plugins: [wrapCloudflareEntryWithSentry(entry, optionsFile)] });
    const { output } = await bundle.generate({ format: 'es' });

    expect(output[0].code).not.toContain('wrapNitroCloudflareEntryWithSentry');
  });
});

describe('setupCloudflareEntry', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('wraps the entry and adds its Nitro plugin before the plugins of the app on a Cloudflare preset', () => {
    const callbacks: HookCallback[] = [];
    const nuxt = { options: {}, hook: (_name: string, callback: HookCallback) => callbacks.push(callback) };
    const nitro = {
      options: {
        preset: 'cloudflare-module',
        entry: '/app/entry.mjs',
        plugins: ['/app/server/plugins/sentry.ts'],
        virtual: {},
        database: {},
      },
      hooks: { hook: vi.fn() },
    };

    setupCloudflareEntry(nuxt as unknown as Nuxt, '/app/instrument.server.ts');
    callbacks.forEach(callback => callback(nitro));

    expect(nitro.options).toEqual({
      preset: 'cloudflare-module',
      entry: '/app/entry.mjs',
      plugins: ['./runtime/plugins/cloudflare-entry.server', '/app/server/plugins/sentry.ts'],
      rollupConfig: { output: {}, plugins: [expect.objectContaining({ name: 'sentry-nuxt-cloudflare-entry' })] },
      virtual: {},
      database: {},
    });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('adds its Nitro plugin before the plugins of the app in the prerenderer', () => {
    const callbacks: HookCallback[] = [];
    const nuxt = { options: {}, hook: (_name: string, callback: HookCallback) => callbacks.push(callback) };
    const nitroHooks: Record<string, HookCallback> = {};
    const nitro = {
      options: {
        preset: 'cloudflare-module',
        entry: '/app/entry.mjs',
        plugins: [] as string[],
        virtual: {},
        database: {},
      },
      hooks: { hook: (name: string, callback: HookCallback) => (nitroHooks[name] = callback) },
    };
    const prerenderConfig = { plugins: ['/app/server/plugins/sentry.ts'] };

    setupCloudflareEntry(nuxt as unknown as Nuxt, '/app/instrument.server.ts');
    callbacks.forEach(callback => callback(nitro));
    nitroHooks['prerender:config']?.(prerenderConfig);

    expect(prerenderConfig.plugins).toEqual([
      './runtime/plugins/cloudflare-entry.server',
      '/app/server/plugins/sentry.ts',
    ]);
  });

  it('leaves the `cloudflare-d1` databases out of the database instrumentation', () => {
    const callbacks: HookCallback[] = [];
    const nuxt = { options: {}, hook: (_name: string, callback: HookCallback) => callbacks.push(callback) };
    const nitro = {
      options: {
        preset: 'cloudflare-module',
        entry: '/app/entry.mjs',
        plugins: [] as string[],
        virtual: { '#sentry/database-config.mjs': () => 'export const databaseConfig = {};' },
        database: {
          default: { connector: 'cloudflare-d1', options: { bindingName: 'DB' } },
          hyperdrive: { connector: 'postgresql', options: { url: 'postgresql://localhost' } },
        },
      },
      hooks: { hook: vi.fn() },
    };

    setupCloudflareEntry(nuxt as unknown as Nuxt, '/app/instrument.server.ts');
    callbacks.forEach(callback => callback(nitro));

    expect(nitro.options.virtual['#sentry/database-config.mjs']()).toBe(
      'export const databaseConfig = {"hyperdrive":{"connector":"postgresql","options":{"url":"postgresql://localhost"}}};',
    );
  });

  it('does nothing on a non-Cloudflare preset', () => {
    const callbacks: HookCallback[] = [];
    const nuxt = { options: {}, hook: (_name: string, callback: HookCallback) => callbacks.push(callback) };
    const nitro = { options: { preset: 'node-server', entry: '/app/entry.mjs', plugins: [] as string[] } };

    setupCloudflareEntry(nuxt as unknown as Nuxt, '/app/instrument.server.ts');
    callbacks.forEach(callback => callback(nitro));

    expect(nitro.options).toEqual({ preset: 'node-server', entry: '/app/entry.mjs', plugins: [] });
  });

  it('does nothing when Nuxt prepares the types', () => {
    const callbacks: HookCallback[] = [];
    const nuxt = {
      options: { _prepare: true },
      hook: (_name: string, callback: HookCallback) => callbacks.push(callback),
    };
    const nitro = { options: { preset: 'cloudflare-module', entry: '/app/entry.mjs', plugins: [] as string[] } };

    setupCloudflareEntry(nuxt as unknown as Nuxt, '/app/instrument.server.ts');
    callbacks.forEach(callback => callback(nitro));

    expect(nitro.options).toEqual({ preset: 'cloudflare-module', entry: '/app/entry.mjs', plugins: [] });
  });
});
