import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NormalizedInputOptions, PluginContext } from 'rollup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NitroLike } from '../../src/orchestrion/bundler/nitro';
import {
  loadSentryServerConfigPlugin,
  registerSentryServerConfig,
  resolveSentryServerConfigPlugin,
} from '../../src/orchestrion/bundler/nitro';
import { sentryOrchestrionPlugin as sentryOrchestrionRollupPlugin } from '../../src/orchestrion/bundler/rollup';
import { sentryOrchestrionPlugin as sentryOrchestrionVitePlugin } from '../../src/orchestrion/bundler/vite';

type BuildStartHook = (this: Pick<PluginContext, 'warn'>, rollupOptions: NormalizedInputOptions) => void;
type ResolveIdHook = (this: unknown, source: string, importer: string | undefined, options: object) => unknown;
type LoadHook = (this: unknown, id: string) => unknown;

const USER_PLUGIN = './server/plugins/user.ts';

let rootDir: string;

function createNitro(options: NitroLike['options'] = {}): NitroLike {
  return { options: { rootDir, plugins: [USER_PLUGIN], tracingChannel: false, ...options } };
}

function writeFile(relativePath: string): string {
  const file = join(rootDir, relativePath);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, "Sentry.init({ dsn: 'https://public@dsn.ingest.sentry.io/1' });\n");
  return file;
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'sentry-nitro-server-config-'));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('registerSentryServerConfig', () => {
  it('registers `sentry.server.config` from the root directory as the first Nitro plugin', () => {
    const file = writeFile('sentry.server.config.mjs');
    const nitro = createNitro();

    registerSentryServerConfig(nitro);

    expect(nitro.options.plugins).toEqual([`virtual:sentry-nitro-server-config:${file}`, USER_PLUGIN]);
  });

  it('registers nothing when there is no `sentry.server.config`', () => {
    const nitro = createNitro();

    registerSentryServerConfig(nitro);

    expect(nitro.options.plugins).toEqual([USER_PLUGIN]);
  });

  it('registers the file from the `serverConfigFile` option, relative to the root directory', () => {
    writeFile('sentry.server.config.ts');
    const file = writeFile('config/instrument.server.ts');
    const nitro = createNitro();

    registerSentryServerConfig(nitro, './config/instrument.server.ts');

    expect(nitro.options.plugins).toEqual([`virtual:sentry-nitro-server-config:${file}`, USER_PLUGIN]);
  });

  it('warns and registers nothing when the `serverConfigFile` option points to a missing file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const nitro = createNitro();

    registerSentryServerConfig(nitro, './missing.ts');

    expect(nitro.options.plugins).toEqual([USER_PLUGIN]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('`./missing.ts`'));
  });

  it('registers nothing when the `serverConfigFile` option is `false`', () => {
    writeFile('sentry.server.config.ts');
    const nitro = createNitro();

    registerSentryServerConfig(nitro, false);

    expect(nitro.options.plugins).toEqual([USER_PLUGIN]);
  });

  it('leaves a file alone that Nitro already loads from a plugins directory it scans', () => {
    writeFile('server/plugins/sentry.ts');
    const nitro = createNitro({ scanDirs: [join(rootDir, 'server')] });

    registerSentryServerConfig(nitro, './server/plugins/sentry.ts');

    expect(nitro.options.plugins).toEqual([USER_PLUGIN]);
  });

  it('registers the file once when it runs more than once', () => {
    writeFile('sentry.server.config.ts');
    const nitro = createNitro();

    registerSentryServerConfig(nitro);
    registerSentryServerConfig(nitro);

    expect(nitro.options.plugins).toHaveLength(2);
  });
});

describe('the virtual server config plugin', () => {
  it('imports the server config and exports an empty Nitro plugin', () => {
    const file = writeFile('sentry.server.config.ts');

    const id = resolveSentryServerConfigPlugin(`virtual:sentry-nitro-server-config:${file}`);

    expect(id).toBe(`\0virtual:sentry-nitro-server-config:${file}`);
    expect(loadSentryServerConfigPlugin(id!)).toBe(
      `import ${JSON.stringify(file)};\nexport default function sentryServerConfig() {}\n`,
    );
  });

  it('leaves other modules alone', () => {
    expect(resolveSentryServerConfigPlugin('#nitro/virtual/tracing')).toBeUndefined();
    expect(loadSentryServerConfigPlugin('/app/server/plugins/user.ts')).toBeUndefined();
  });
});

describe('the bundler plugins in a Nitro build', () => {
  const globalWithNitro = globalThis as { __nitro_instances__?: NitroLike[] };

  afterEach(() => {
    delete globalWithNitro.__nitro_instances__;
  });

  it('registers the server config from the Vite plugin, and resolves and loads its virtual plugin', async () => {
    const file = writeFile('instrument.server.mjs');
    const plugin = sentryOrchestrionVitePlugin({ serverConfigFile: 'instrument.server.mjs' }) as ReturnType<
      typeof sentryOrchestrionVitePlugin
    > & { nitro: { setup: (nitro: NitroLike) => void } };
    const nitro = createNitro();

    plugin.nitro.setup(nitro);
    const id = await (plugin.resolveId as ResolveIdHook).call({}, nitro.options.plugins![0]!, undefined, {});

    expect(nitro.options.plugins).toEqual([`virtual:sentry-nitro-server-config:${file}`, USER_PLUGIN]);
    expect((plugin.load as LoadHook).call({}, id as string)).toContain(`import ${JSON.stringify(file)};`);
  });

  it('registers the server config from the Rollup plugin, and resolves and loads its virtual plugin', async () => {
    const file = writeFile('sentry.server.config.ts');
    const nitro = createNitro();
    globalWithNitro.__nitro_instances__ = [nitro];
    const plugin = sentryOrchestrionRollupPlugin();

    (plugin.buildStart as BuildStartHook).call({ warn: vi.fn() }, {} as NormalizedInputOptions);
    const id = await (plugin.resolveId as ResolveIdHook).call({}, nitro.options.plugins![0]!, undefined, {});

    expect(nitro.options.plugins).toEqual([`virtual:sentry-nitro-server-config:${file}`, USER_PLUGIN]);
    expect((plugin.load as LoadHook).call({}, id as string)).toContain(`import ${JSON.stringify(file)};`);
  });
});
