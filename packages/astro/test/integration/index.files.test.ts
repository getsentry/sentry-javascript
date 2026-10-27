import { afterEach, describe, expect, it, vi } from 'vitest';
import { sentryAstro } from '../../src/integration';

vi.mock('fs', async requireActual => {
  return {
    ...(await requireActual<any>()),
    existsSync: vi.fn(p => p.endsWith('js')),
  };
});

const updateConfig = vi.fn();
const injectScript = vi.fn();
const config = {
  root: new URL('file://path/to/project'),
  outDir: new URL('file://path/to/project/out'),
};

describe('sentryAstro integration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('injects client and server init scripts from default paths if they exist', () => {
    const integration = sentryAstro({});

    expect(integration.hooks['astro:config:setup']).toBeDefined();

    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    integration.hooks['astro:config:setup']({ updateConfig, injectScript, config });

    expect(injectScript).toHaveBeenCalledTimes(2);
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringMatching(/^import ".*\/sentry.client.config.js"/));
    expect(injectScript).toHaveBeenCalledWith(
      'page-ssr',
      expect.stringMatching(/^import ".*\/sentry.server.config.js"/),
    );
  });

  it('imports the default server init file from the middleware entrypoint', async () => {
    const addMiddleware = vi.fn();
    const updateConfig = vi.fn();
    const setup = sentryAstro({}).hooks['astro:config:setup'] as (params: unknown) => Promise<void>;

    await setup({ updateConfig, injectScript, addMiddleware, config: { output: 'server' } });

    expect(addMiddleware).toHaveBeenCalledWith({
      order: 'pre',
      entrypoint: 'virtual:sentry-astro/server-init-middleware',
    });

    const plugin = updateConfig.mock.calls
      .flatMap(([updatedConfig]) => updatedConfig.vite?.plugins ?? [])
      .find((vitePlugin: { name?: string }) => vitePlugin?.name === 'sentry-astro-server-init');
    expect(plugin.load('\0virtual:sentry-astro/server-init')).toMatch(/^import ".*\/sentry.server.config.js";$/);
  });
});
