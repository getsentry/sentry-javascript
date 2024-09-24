import type { UserConfig } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { makeBuildInstrumentationFilePlugin } from '../../src/vite/buildInstrumentationFile';

const fsAccessMock = vi.fn();

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      // @ts-expect-error this exists
      ...actual.promises,
      access: () => fsAccessMock(),
    },
  };
});

const consoleWarnSpy = vi.spyOn(console, 'warn');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('makeBuildInstrumentationFilePlugin()', () => {
  const viteConfig: UserConfig & { router: { target: string; name: string; root: string } } = {
    router: {
      target: 'server',
      name: 'ssr',
      root: '/some/project/path',
    },
    build: {
      rollupOptions: {
        input: ['/path/to/entry1.js', '/path/to/entry2.js'],
      },
    },
  };

  it('returns a plugin to set `sourcemaps` to `true`', () => {
    const buildInstrumentationFilePlugin = makeBuildInstrumentationFilePlugin();

    expect(buildInstrumentationFilePlugin.name).toEqual('sentry-solidstart-build-instrumentation-file');
    expect(buildInstrumentationFilePlugin.apply).toEqual('build');
    expect(buildInstrumentationFilePlugin.enforce).toEqual('post');
    expect(buildInstrumentationFilePlugin.config).toEqual(expect.any(Function));
  });

  it('adds the instrumentation file for server builds', async () => {
    const buildInstrumentationFilePlugin = makeBuildInstrumentationFilePlugin();
    const config = await buildInstrumentationFilePlugin.config(viteConfig, { command: 'build' });
    expect(config.build.rollupOptions.input).toContain('/some/project/path/src/instrument.server.ts');
  });

  it('adds the correct instrumentation file', async () => {
    const buildInstrumentationFilePlugin = makeBuildInstrumentationFilePlugin('./src/myapp/instrument.server.ts');
    const config = await buildInstrumentationFilePlugin.config(viteConfig, { command: 'build' });
    expect(config.build.rollupOptions.input).toContain('/some/project/path/src/myapp/instrument.server.ts');
  });

  it("doesn't add the instrumentation file for server function builds", async () => {
    const buildInstrumentationFilePlugin = makeBuildInstrumentationFilePlugin();
    const config = await buildInstrumentationFilePlugin.config(
      {
        ...viteConfig,
        router: {
          ...viteConfig.router,
          name: 'server-fns',
        },
      },
      { command: 'build' },
    );
    expect(config.build.rollupOptions.input).not.toContain('/some/project/path/src/instrument.server.ts');
  });

  it("doesn't add the instrumentation file for client builds", async () => {
    const buildInstrumentationFilePlugin = makeBuildInstrumentationFilePlugin();
    const config = await buildInstrumentationFilePlugin.config(
      {
        ...viteConfig,
        router: {
          ...viteConfig.router,
          target: 'client',
        },
      },
      { command: 'build' },
    );
    expect(config.build.rollupOptions.input).not.toContain('/some/project/path/src/instrument.server.ts');
  });

  it("doesn't add the instrumentation file when serving", async () => {
    const buildInstrumentationFilePlugin = makeBuildInstrumentationFilePlugin();
    const config = await buildInstrumentationFilePlugin.config(viteConfig, { command: 'serve' });
    expect(config.build.rollupOptions.input).not.toContain('/some/project/path/src/instrument.server.ts');
  });

  it("doesn't modify the config if the instrumentation file doesn't exist", async () => {
    fsAccessMock.mockRejectedValueOnce(undefined);
    const buildInstrumentationFilePlugin = makeBuildInstrumentationFilePlugin();
    const config = await buildInstrumentationFilePlugin.config(viteConfig, { command: 'build' });
    expect(config).toEqual(viteConfig);
  });

  it("logs a warning if the instrumentation file doesn't exist", async () => {
    const error = new Error("File doesn't exist.");
    fsAccessMock.mockRejectedValueOnce(error);
    const buildInstrumentationFilePlugin = makeBuildInstrumentationFilePlugin();
    const config = await buildInstrumentationFilePlugin.config(viteConfig, { command: 'build' });
    expect(config).toEqual(viteConfig);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart Plugin] Could not access `./src/instrument.server.ts`, please make sure it exists.',
      error,
    );
  });
});
