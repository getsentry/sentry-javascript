import type { Nuxt } from '@nuxt/schema';
import { SDK_VERSION } from '@sentry/core';
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
            if (source === 'cloudflare:workers') {
              return '\0cloudflare-workers-stub';
            }
            if (source !== '@sentry/cloudflare') {
              return null;
            }
            sentryCloudflareImporters.push(importer);
            return '\0sentry-cloudflare-stub';
          },
          load(id) {
            if (id === '\0cloudflare-workers-stub') {
              return 'export const env = {};';
            }
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
    expect(exports.default.optionsCallback()).toEqual({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      _metadata: {
        sdk: {
          name: 'sentry.javascript.nuxt',
          version: SDK_VERSION,
          packages: [
            { name: 'npm:@sentry/nuxt', version: SDK_VERSION },
            { name: 'npm:@sentry/cloudflare', version: SDK_VERSION },
          ],
        },
      },
    });
    expect(exports.$DurableObject.DurableObjectClass.name).toBe('$DurableObject');
    expect(exports.$DurableObject.optionsCallback).toBe(exports.default.optionsCallback);
    expect(exports.other).toBe('value');
    expect(sentryCloudflareImporters).toEqual([expect.stringMatching(/src[\\/]vite[\\/]cloudflare\.ts$/)]);
  });

  it('runs the handlers and the Durable Object methods with the `env` they get as the `env` of `cloudflare:workers`', async () => {
    writeFileSync(
      `${entry}.mjs`,
      [
        "import { getEnv } from 'cloudflare:workers';",
        'export default { fetch: () => getEnv(), queue: () => getEnv() };',
        'export class $DurableObject {',
        '  constructor(ctx, env) { this.env = env; }',
        '  fetch() { return getEnv(); }',
        '}',
      ].join('\n'),
    );

    const bundle = await rollup({
      input: entry,
      plugins: [
        wrapCloudflareEntryWithSentry(entry, optionsFile),
        {
          name: 'stubs',
          resolveId: source =>
            source === 'cloudflare:workers'
              ? '\0cloudflare-workers-stub'
              : source === '@sentry/cloudflare'
                ? '\0sentry-cloudflare-stub'
                : null,
          load: id =>
            id === '\0cloudflare-workers-stub'
              ? [
                  'let currentEnv;',
                  'export function withEnv(env, callback) {',
                  '  const previousEnv = currentEnv;',
                  '  currentEnv = env;',
                  '  try { return callback(); } finally { currentEnv = previousEnv; }',
                  '}',
                  'export function getEnv() { return currentEnv; }',
                ].join('\n')
              : id === '\0sentry-cloudflare-stub'
                ? [
                    'export function withSentry(optionsCallback, handler) { return handler; }',
                    'export function instrumentDurableObjectWithSentry(optionsCallback, DurableObjectClass) {',
                    '  return DurableObjectClass;',
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
    const env = { DB: 'instrumented D1 binding' };
    const durableObject = new exports.$DurableObject({}, env);

    expect(exports.default.fetch(new Request('https://example.com'), env, {})).toBe(env);
    expect(exports.default.queue({ messages: [] }, env, {})).toBe(env);
    expect(durableObject.fetch(new Request('https://example.com'))).toBe(env);
    expect(durableObject.fetch.name).toBe('fetch');
    expect(exports.$DurableObject.name).toBe('$DurableObject');
  });

  it('calls the handlers directly when `cloudflare:workers` has no `withEnv`, like the dev shim of Nitro 2', async () => {
    writeFileSync(`${entry}.mjs`, 'export default { fetch: (request, env) => env };\n');

    const bundle = await rollup({
      input: entry,
      plugins: [
        wrapCloudflareEntryWithSentry(entry, optionsFile),
        {
          name: 'stubs',
          resolveId: source =>
            source === 'cloudflare:workers'
              ? '\0cloudflare-workers-stub'
              : source === '@sentry/cloudflare'
                ? '\0sentry-cloudflare-stub'
                : null,
          load: id =>
            id === '\0cloudflare-workers-stub'
              ? 'export const env = {};'
              : id === '\0sentry-cloudflare-stub'
                ? 'export function withSentry(optionsCallback, handler) { return handler; }'
                : null,
        },
      ],
    });
    const { output } = await bundle.generate({ format: 'cjs', exports: 'named' });
    const exports: Record<string, any> = {};
    // oxlint-disable-next-line typescript/no-implied-eval -- runs the generated bundle
    new Function('exports', output[0].code)(exports);
    const env = { DB: 'D1 binding' };

    expect(exports.default.fetch(new Request('https://example.com'), env, {})).toBe(env);
  });

  it('does not import `instrumentDurableObjectWithSentry` for an entry without `$DurableObject`', async () => {
    writeFileSync(`${entry}.mjs`, 'export default {};\n');

    const bundle = await rollup({
      input: entry,
      plugins: [wrapCloudflareEntryWithSentry(entry, optionsFile)],
      external: ['@sentry/cloudflare', 'cloudflare:workers'],
    });
    const { output } = await bundle.generate({ format: 'es' });

    expect(output[0].code).toContain('withSentry(');
    expect(output[0].code).not.toContain('instrumentDurableObjectWithSentry');
  });

  it('wraps an entry that another plugin resolves first, as the Vite builder of Nitro 3 does', async () => {
    writeFileSync(`${entry}.mjs`, "export default { fetch: () => 'response' };\nexport class $DurableObject {}\n");

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
          name: 'sentry-cloudflare-stub',
          resolveId: source =>
            source === 'cloudflare:workers'
              ? '\0cloudflare-workers-stub'
              : source === '@sentry/cloudflare'
                ? '\0sentry-cloudflare-stub'
                : null,
          load: id =>
            id === '\0cloudflare-workers-stub'
              ? 'export const env = {};'
              : id === '\0sentry-cloudflare-stub'
                ? [
                    'export function withSentry(optionsCallback, handler) { return { optionsCallback, handler }; }',
                    'export function instrumentDurableObjectWithSentry(optionsCallback, DurableObjectClass) {',
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
    expect(exports.default.optionsCallback()).toEqual(
      expect.objectContaining({ dsn: 'https://public@dsn.ingest.sentry.io/1337' }),
    );
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
