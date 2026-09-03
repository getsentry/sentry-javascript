import type { Nuxt } from '@nuxt/schema';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDevServerConfigFile, DEV_SERVER_CONFIG_PATH } from '../../src/vite/addServerConfig';

const addTemplateMock = vi.hoisted(() => vi.fn());

vi.mock('@nuxt/kit', () => ({
  addTemplate: addTemplateMock,
  // `@nuxt/kit` resolves rather than joins, which is what lets an absolute layer path win over the base.
  createResolver: (base: string) => ({ resolve: (input: string) => path.resolve(base, input) }),
}));

const APP_ROOT = '/my/monorepo/apps/web';
// `findDefaultSdkInitFile` always returns an absolute path, built from the layer's own `cwd`.
const APP_CONFIG = `${APP_ROOT}/sentry.server.config.ts`;
const LAYER_CONFIG = '/my/monorepo/layers/base/sentry.server.config.ts';

function generate(serverConfigFile: string): string {
  const nuxt = { options: { rootDir: APP_ROOT, buildDir: path.join(APP_ROOT, '.nuxt') } } as Nuxt;

  addDevServerConfigFile(nuxt, serverConfigFile);

  return addTemplateMock.mock.calls[0]?.[0].getContents();
}

describe('addDevServerConfigFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the file into the build directory so `--import` can resolve it', () => {
    generate(APP_CONFIG);

    expect(addTemplateMock).toHaveBeenCalledWith({
      filename: DEV_SERVER_CONFIG_PATH,
      write: true,
      getContents: expect.any(Function),
    });
  });

  it('imports the user config as a file URL so Node can load it directly', () => {
    expect(generate(APP_CONFIG)).toContain(`await import("file://${APP_CONFIG}")`);
  });

  it('sets the dev flag before importing the config', () => {
    const contents = generate(APP_CONFIG);

    // A static import would be hoisted above the assignment and `Sentry.init()` would then see no flag.
    expect(contents).not.toMatch(/^import /m);
    expect(contents.indexOf('__SENTRY_NUXT_DEV_MODE__')).toBeLessThan(contents.indexOf('await import('));
  });

  it('catches a config Node cannot load, so a broken config does not stop the dev server', () => {
    const contents = generate(APP_CONFIG);

    expect(contents).toMatch(/try \{[\s\S]*await import\([\s\S]*\} catch \(error\) \{[\s\S]*console\.warn\(/);
    expect(contents).toContain('Could not load `sentry.server.config.ts`');
  });

  it('documents the command that preloads the file', () => {
    expect(generate(APP_CONFIG)).toContain("NODE_OPTIONS='--import ./.nuxt/dev/sentry.server.config.mjs'");
  });

  describe('when the config comes from a layer outside the project root', () => {
    it('imports the config from the layer it belongs to', () => {
      expect(generate(LAYER_CONFIG)).toContain(`await import("file://${LAYER_CONFIG}")`);
    });

    it('keeps the preload path relative to the project root', () => {
      // The file we generate always lives in the app's own build directory, wherever the config came from.
      expect(generate(LAYER_CONFIG)).toContain("NODE_OPTIONS='--import ./.nuxt/dev/sentry.server.config.mjs'");
    });
  });
});
