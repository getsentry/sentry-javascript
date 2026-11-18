import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeReleaseInjectionPlugin, VIRTUAL_RELEASE_FILE } from '../../src/vite/injectRelease';

type HookFn = (...args: unknown[]) => unknown;

function callHook(plugin: Plugin, hook: 'load' | 'transform', ...args: unknown[]): Promise<any> {
  return Promise.resolve((plugin[hook] as HookFn)(...args));
}

describe('makeReleaseInjectionPlugin', () => {
  let appDir: string;
  let clientHooks: string;

  // The kit config resolver hands out project-relative paths
  const kitConfig = { files: { hooks: { server: 'src/hooks.server', client: 'src/hooks.client' } } };

  function makePlugin(serverHooksCode?: string): Plugin {
    if (serverHooksCode !== undefined) {
      fs.writeFileSync(path.join(appDir, 'src', 'hooks.server.ts'), serverHooksCode);
    }
    return makeReleaseInjectionPlugin({ release: '1.2.3', getKitConfig: async () => kitConfig });
  }

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-sveltekit-release-'));
    fs.mkdirSync(path.join(appDir, 'src'));
    clientHooks = path.join(appDir, 'src', 'hooks.client');
    vi.spyOn(process, 'cwd').mockReturnValue(appDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  it('only applies to builds', () => {
    expect(makePlugin('').apply).toBe('build');
  });

  it.each(['src/hooks.server.ts', 'src/instrumentation.server.ts'])(
    'imports the release module first in %s',
    async file => {
      const plugin = makePlugin('export const handle = sentryHandle();');

      const result = await callHook(plugin, 'transform', 'import "./sentry";', path.join(appDir, file), { ssr: true });

      expect(result.code).toBe(`import "${VIRTUAL_RELEASE_FILE}";\nimport "./sentry";`);
    },
  );

  it('gives the server the release for its SDK and for `sentryHandle`', async () => {
    const plugin = makePlugin('');

    const code = await callHook(plugin, 'load', VIRTUAL_RELEASE_FILE, { ssr: true });

    expect(code).toBe(
      'globalThis["SENTRY_RELEASE"] = {"id":"1.2.3"};\nglobalThis["__sentry_sveltekit_release"] = "1.2.3";\n',
    );
  });

  it('keeps the release out of the client build if `sentryHandle` adds it to the pages', async () => {
    const plugin = makePlugin('export const handle = sequence(Sentry.sentryHandle(), myHandle);');

    const result = await callHook(plugin, 'transform', 'Sentry.init({});', `${clientHooks}.ts`, { ssr: false });

    expect(result).toBeNull();
  });

  it('injects the release into the client hooks file if the server hooks do not use `sentryHandle`', async () => {
    const plugin = makePlugin('export const handle = myHandle;');

    const result = await callHook(plugin, 'transform', 'Sentry.init({});', `${clientHooks}.ts`, { ssr: false });
    const code = await callHook(plugin, 'load', VIRTUAL_RELEASE_FILE, { ssr: false });

    expect(result.code).toBe(`import "${VIRTUAL_RELEASE_FILE}";\nSentry.init({});`);
    expect(code).toBe('globalThis["SENTRY_RELEASE"] = {"id":"1.2.3"};\n');
  });

  it('injects the release into the client hooks file if there are no server hooks', async () => {
    const plugin = makePlugin();

    const result = await callHook(plugin, 'transform', 'Sentry.init({});', `${clientHooks}.ts`, { ssr: false });

    expect(result.code).toContain(VIRTUAL_RELEASE_FILE);
  });

  it('leaves other modules alone', async () => {
    const plugin = makePlugin('export const handle = myHandle;');

    const serverResult = await callHook(plugin, 'transform', 'x', path.join(appDir, 'src/lib/a.ts'), { ssr: true });
    const clientResult = await callHook(plugin, 'transform', 'x', path.join(appDir, 'src/lib/a.ts'), { ssr: false });

    expect(serverResult).toBeNull();
    expect(clientResult).toBeNull();
  });
});
