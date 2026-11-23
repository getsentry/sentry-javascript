import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ResolvedConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getReleaseModuleCode, makeReleasePlugin } from '../../src/vite/releasePlugin';

const SERVER_BUILD_ID = '\0virtual:remix/server-build';

// The shape `@remix-run/dev` generates for `virtual:remix/server-build`.
const SERVER_BUILD_CODE = `
    import * as entryServer from "/app/entry.server.tsx";
import * as route0 from "/app/root.tsx";
      export const mode = "production";
      export const entry = { module: entryServer };
      export const routes = {
        "root": { id: "root", parentId: undefined, path: "", index: undefined, caseSensitive: undefined, module: route0 }
      };`;

type WrapHandleRequest = (handleRequest: unknown) => (...args: unknown[]) => unknown;

/** Calls a hook declared in either the bare-function or the `{ handler }` form. */
function callHook(hook: unknown, context: unknown, ...args: unknown[]): unknown {
  const handler = typeof hook === 'function' ? hook : (hook as { handler: (...a: unknown[]) => unknown }).handler;
  return (handler as (...a: unknown[]) => unknown).call(context, ...args);
}

function makeResolvedPlugin(
  options: Parameters<typeof makeReleasePlugin>[0] = { release: { name: 'my-release' } },
  ssr = true,
): ReturnType<typeof makeReleasePlugin> {
  const plugin = makeReleasePlugin(options);
  callHook(plugin.configResolved, undefined, { build: { ssr } } as ResolvedConfig);
  return plugin;
}

let tmpDir: string;

async function importReleaseModule(release: string): Promise<{ wrapHandleRequest: WrapHandleRequest }> {
  const file = path.join(tmpDir, `release-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(file, getReleaseModuleCode(release));
  return import(/* @vite-ignore */ file);
}

describe('makeReleasePlugin', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('only applies to builds', () => {
    expect(makeReleasePlugin({}).apply).toBe('build');
  });

  it('wraps the server entry and imports the release module first, keeping line numbers', () => {
    const plugin = makeResolvedPlugin();

    const result = callHook(plugin.transform, undefined, SERVER_BUILD_CODE, SERVER_BUILD_ID) as { code: string };

    expect(result.code).toBe(
      `import { wrapHandleRequest as __sentryWrapHandleRequest } from "virtual:sentry-remix-release";${SERVER_BUILD_CODE}
entry.module = { ...entry.module, default: __sentryWrapHandleRequest(entry.module.default) };
`,
    );
  });

  it('leaves other modules alone', () => {
    const plugin = makeResolvedPlugin();

    expect(callHook(plugin.transform, undefined, SERVER_BUILD_CODE, '/app/root.tsx')).toBeNull();
  });

  it('falls back to the `SENTRY_RELEASE` environment variable', () => {
    vi.stubEnv('SENTRY_RELEASE', 'env-release');
    const plugin = makeResolvedPlugin({});

    expect(callHook(plugin.load, undefined, '\0virtual:sentry-remix-release')).toContain('"env-release"');
  });

  it('resolves and loads the release module', () => {
    const plugin = makeResolvedPlugin();

    expect(callHook(plugin.resolveId, undefined, 'virtual:sentry-remix-release')).toBe(
      '\0virtual:sentry-remix-release',
    );
    expect(callHook(plugin.load, undefined, '\0virtual:sentry-remix-release')).toBe(getReleaseModuleCode('my-release'));
  });

  it('warns when an SSR build never loaded the Remix server build', () => {
    const plugin = makeResolvedPlugin();
    const warn = vi.fn();

    callHook(plugin.buildEnd, { warn });

    expect(warn).toHaveBeenCalledWith(
      'Could not find the Remix server build, so the release "my-release" does not reach the browser SDK. Pass `release` to `Sentry.init` in your client entry.',
    );
  });

  it('warns when the server build has no `entry` export to wrap', () => {
    const plugin = makeResolvedPlugin();
    const warn = vi.fn();

    const result = callHook(plugin.transform, undefined, 'export const routes = {};', SERVER_BUILD_ID);
    callHook(plugin.buildEnd, { warn });

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn once the server build was wrapped', () => {
    const plugin = makeResolvedPlugin();
    const warn = vi.fn();

    callHook(plugin.transform, undefined, SERVER_BUILD_CODE, SERVER_BUILD_ID);
    callHook(plugin.buildEnd, { warn });

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn in the client build, which never loads the server build', () => {
    const plugin = makeResolvedPlugin(undefined, false);
    const warn = vi.fn();

    callHook(plugin.buildEnd, { warn });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('getReleaseModuleCode', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-remix-release-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete (globalThis as { SENTRY_RELEASE?: unknown }).SENTRY_RELEASE;
  });

  it('sets `SENTRY_RELEASE` for the server SDK', async () => {
    await importReleaseModule('server-release');

    expect((globalThis as { SENTRY_RELEASE?: unknown }).SENTRY_RELEASE).toEqual({ id: 'server-release' });
  });

  it('adds the release to the server handoff and calls the original handler with the same arguments', async () => {
    const { wrapHandleRequest } = await importReleaseModule('my-release');
    const handleRequest = vi.fn(() => 'response');
    const request = {};
    const headers = {};
    const loadContext = {};
    const context = { serverHandoffString: '{"basename":"/","future":{}}' };

    const result = wrapHandleRequest(handleRequest)(request, 200, headers, context, loadContext);

    expect(result).toBe('response');
    expect(handleRequest).toHaveBeenCalledWith(request, 200, headers, context, loadContext);
    expect(JSON.parse(context.serverHandoffString)).toEqual({ sentryRelease: 'my-release', basename: '/', future: {} });
  });

  it('adds the release to an empty handoff', async () => {
    const { wrapHandleRequest } = await importReleaseModule('my-release');
    const context = { serverHandoffString: '{}' };

    wrapHandleRequest(vi.fn())({}, 200, {}, context);

    expect(JSON.parse(context.serverHandoffString)).toEqual({ sentryRelease: 'my-release' });
  });

  // The handoff is rendered verbatim into an inline `<script>`.
  it('escapes a release that would close the script element', async () => {
    const { wrapHandleRequest } = await importReleaseModule('</script><script>alert(1)</script>');
    const context = { serverHandoffString: '{}' };

    wrapHandleRequest(vi.fn())({}, 200, {}, context);

    expect(context.serverHandoffString).not.toContain('<');
    expect(JSON.parse(context.serverHandoffString)).toEqual({ sentryRelease: '</script><script>alert(1)</script>' });
  });

  it('leaves a context without a handoff string alone', async () => {
    const { wrapHandleRequest } = await importReleaseModule('my-release');
    const context = {};

    wrapHandleRequest(vi.fn())({}, 200, {}, context);

    expect(context).toEqual({});
  });

  it('returns a missing handler unchanged', async () => {
    const { wrapHandleRequest } = await importReleaseModule('my-release');

    expect(wrapHandleRequest(undefined)).toBeUndefined();
  });
});
