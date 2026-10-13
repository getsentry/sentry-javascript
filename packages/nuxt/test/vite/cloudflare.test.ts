import type { Nuxt } from '@nuxt/schema';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  it('wraps the default export with `withSentry` and `$DurableObject` with `instrumentDurableObjectWithSentry`', async () => {
    writeFileSync(
      `${entry}.mjs`,
      "export default { fetch: () => 'response' };\nexport class $DurableObject {}\nexport const other = 'value';\n",
    );
    const sentryCloudflareImporters: Array<string | undefined> = [];

    const bundle = await rollup({
      input: entry,
      plugins: [
        wrapCloudflareEntryWithSentry(entry, optionsFile),
        {
          name: 'sentry-cloudflare-stub',
          resolveId(source, importer) {
            if (source !== '@sentry/cloudflare') {
              return null;
            }
            sentryCloudflareImporters.push(importer);
            return '\0sentry-cloudflare-stub';
          },
          load(id) {
            return id === '\0sentry-cloudflare-stub'
              ? [
                  'export function withSentry(optionsCallback, handler) { return { optionsCallback, handler }; }',
                  'export function instrumentDurableObjectWithSentry(optionsCallback, DurableObjectClass) {',
                  '  return { optionsCallback, DurableObjectClass };',
                  '}',
                ].join('\n')
              : null;
          },
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
    expect(sentryCloudflareImporters).toEqual([expect.stringMatching(/src[\\/]vite[\\/]cloudflare\.ts$/)]);
  });

  it('does not import `instrumentDurableObjectWithSentry` for an entry without `$DurableObject`', async () => {
    writeFileSync(`${entry}.mjs`, 'export default {};\n');

    const bundle = await rollup({
      input: entry,
      plugins: [wrapCloudflareEntryWithSentry(entry, optionsFile)],
      external: ['@sentry/cloudflare'],
    });
    const { output } = await bundle.generate({ format: 'es' });

    expect(output[0].code).toContain('withSentry(');
    expect(output[0].code).not.toContain('instrumentDurableObjectWithSentry');
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

    expect(output[0].code).not.toContain('withSentry');
    expect(warnings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('The Nitro entry has no default export') }),
    ]);
  });

  it('leaves other entries unwrapped', async () => {
    const otherEntry = join(dir, 'other.mjs');
    writeFileSync(otherEntry, 'export default {};\n');

    const bundle = await rollup({ input: otherEntry, plugins: [wrapCloudflareEntryWithSentry(entry, optionsFile)] });
    const { output } = await bundle.generate({ format: 'es' });

    expect(output[0].code).not.toContain('withSentry');
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

  it('wraps the entry and names the transaction of each request on a Cloudflare preset', () => {
    const callbacks: HookCallback[] = [];
    const nuxt = { options: {}, hook: (_name: string, callback: HookCallback) => callbacks.push(callback) };
    const nitro = {
      options: {
        preset: 'cloudflare-module',
        entry: '/app/entry.mjs',
        plugins: [] as string[],
        virtual: {},
        database: {},
      },
    };

    setupCloudflareEntry(nuxt as unknown as Nuxt, 'nitro2', '/app/instrument.server.ts');
    callbacks.forEach(callback => callback(nitro));

    expect(nitro.options).toEqual({
      preset: 'cloudflare-module',
      entry: '/app/entry.mjs',
      plugins: ['./runtime/plugins/transaction-name-cloudflare.server'],
      rollupConfig: { output: {}, plugins: [expect.objectContaining({ name: 'sentry-nuxt-cloudflare-entry' })] },
      virtual: {},
      database: {},
    });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('leaves the `cloudflare-d1` databases out of the database instrumentation on a Cloudflare preset', () => {
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
    };

    setupCloudflareEntry(nuxt as unknown as Nuxt, 'nitro2', '/app/instrument.server.ts');
    callbacks.forEach(callback => callback(nitro));

    expect(nitro.options.virtual['#sentry/database-config.mjs']()).toBe(
      'export const databaseConfig = {"hyperdrive":{"connector":"postgresql","options":{"url":"postgresql://localhost"}}};',
    );
  });

  it('does nothing on a non-Cloudflare preset', () => {
    const callbacks: HookCallback[] = [];
    const nuxt = { options: {}, hook: (_name: string, callback: HookCallback) => callbacks.push(callback) };
    const nitro = { options: { preset: 'node-server', entry: '/app/entry.mjs', plugins: [] as string[] } };

    setupCloudflareEntry(nuxt as unknown as Nuxt, 'nitro2', '/app/instrument.server.ts');
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

    setupCloudflareEntry(nuxt as unknown as Nuxt, 'nitro2', '/app/instrument.server.ts');
    callbacks.forEach(callback => callback(nitro));

    expect(nitro.options).toEqual({ preset: 'cloudflare-module', entry: '/app/entry.mjs', plugins: [] });
  });

  it('warns and does nothing on Nitro 3', () => {
    const callbacks: HookCallback[] = [];
    const nuxt = { options: {}, hook: (_name: string, callback: HookCallback) => callbacks.push(callback) };
    const nitro = { options: { preset: 'cloudflare-module', entry: '/app/entry.mjs', plugins: [] as string[] } };

    setupCloudflareEntry(nuxt as unknown as Nuxt, 'nitro3', '/app/instrument.server.ts');
    callbacks.forEach(callback => callback(nitro));

    expect(nitro.options).toEqual({ preset: 'cloudflare-module', entry: '/app/entry.mjs', plugins: [] });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Sentry] Found `instrument.server.ts`, but Sentry can set up Cloudflare from this file only with Nitro 2.',
    );
  });
});
