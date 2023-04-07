import type fs from 'fs';
import type { Plugin, UserConfig } from 'vite';
import { vi } from 'vitest';

import { withSentryViteConfig } from '../../src/vite/withSentryViteConfig';

let existsFile = true;
vi.mock('fs', async () => {
  const original = await vi.importActual<typeof fs>('fs');
  return {
    ...original,
    existsSync: vi.fn().mockImplementation(() => existsFile),
  };
});
describe('withSentryViteConfig', () => {
  const originalConfig = {
    plugins: [{ name: 'foo' }],
    server: {
      fs: {
        allow: ['./bar'],
      },
    },
    test: {
      include: ['src/**/*.{test,spec}.{js,ts}'],
    },
  };

  it('takes a POJO Vite config and returns the sentrified version', () => {
    const sentrifiedConfig = withSentryViteConfig(originalConfig);

    expect(typeof sentrifiedConfig).toBe('object');

    const plugins = (sentrifiedConfig as UserConfig).plugins as Plugin[];

    expect(plugins).toHaveLength(2);
    expect(plugins[0].name).toBe('sentry-init-injection-plugin');
    expect(plugins[1].name).toBe('foo');

    expect((sentrifiedConfig as UserConfig).server?.fs?.allow).toStrictEqual(['./bar', '.']);

    expect((sentrifiedConfig as any).test).toEqual(originalConfig.test);
  });

  it('takes a Vite config Promise and returns the sentrified version', async () => {
    const sentrifiedConfig = await withSentryViteConfig(Promise.resolve(originalConfig));

    expect(typeof sentrifiedConfig).toBe('object');

    const plugins = (sentrifiedConfig as UserConfig).plugins as Plugin[];

    expect(plugins).toHaveLength(2);
    expect(plugins[0].name).toBe('sentry-init-injection-plugin');
    expect(plugins[1].name).toBe('foo');

    expect((sentrifiedConfig as UserConfig).server?.fs?.allow).toStrictEqual(['./bar', '.']);

    expect((sentrifiedConfig as any).test).toEqual(originalConfig.test);
  });

  it('takes a function returning a Vite config and returns the sentrified version', () => {
    const sentrifiedConfigFunction = withSentryViteConfig(_env => {
      return originalConfig;
    });
    const sentrifiedConfig =
      typeof sentrifiedConfigFunction === 'function' && sentrifiedConfigFunction({ command: 'build', mode: 'test' });

    expect(typeof sentrifiedConfig).toBe('object');

    const plugins = (sentrifiedConfig as UserConfig).plugins as Plugin[];

    expect(plugins).toHaveLength(2);
    expect(plugins[0].name).toBe('sentry-init-injection-plugin');
    expect(plugins[1].name).toBe('foo');

    expect((sentrifiedConfig as UserConfig).server?.fs?.allow).toStrictEqual(['./bar', '.']);

    expect((sentrifiedConfig as any).test).toEqual(originalConfig.test);
  });

  it('takes a function returning a Vite config promise and returns the sentrified version', async () => {
    const sentrifiedConfigFunction = withSentryViteConfig(_env => {
      return Promise.resolve(originalConfig);
    });
    const sentrifiedConfig =
      typeof sentrifiedConfigFunction === 'function' &&
      (await sentrifiedConfigFunction({ command: 'build', mode: 'test' }));

    expect(typeof sentrifiedConfig).toBe('object');

    const plugins = (sentrifiedConfig as UserConfig).plugins as Plugin[];

    expect(plugins).toHaveLength(2);
    expect(plugins[0].name).toBe('sentry-init-injection-plugin');
    expect(plugins[1].name).toBe('foo');

    expect((sentrifiedConfig as UserConfig).server?.fs?.allow).toStrictEqual(['./bar', '.']);

    expect((sentrifiedConfig as any).test).toEqual(originalConfig.test);
  });

  it('adds the vite plugin if no plugins are present', () => {
    const sentrifiedConfig = withSentryViteConfig({
      test: {
        include: ['src/**/*.{test,spec}.{js,ts}'],
      },
    } as UserConfig);

    expect(typeof sentrifiedConfig).toBe('object');

    const plugins = (sentrifiedConfig as UserConfig).plugins as Plugin[];

    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('sentry-init-injection-plugin');
  });

  it('adds the vite plugin and server config to an empty vite config', () => {
    const sentrifiedConfig = withSentryViteConfig({});

    expect(typeof sentrifiedConfig).toBe('object');

    const plugins = (sentrifiedConfig as UserConfig).plugins as Plugin[];

    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('sentry-init-injection-plugin');

    expect((sentrifiedConfig as UserConfig).server?.fs?.allow).toStrictEqual(['.']);
  });

  it("doesn't add the inject init plugin or the server config if sentry config files don't exist", () => {
    existsFile = false;

    const sentrifiedConfig = withSentryViteConfig({
      plugins: [{ name: 'some plugin' }],
      test: {
        include: ['src/**/*.{test,spec}.{js,ts}'],
      },
      server: {
        fs: {
          allow: ['./bar'],
        },
      },
    } as UserConfig);

    expect(typeof sentrifiedConfig).toBe('object');
    const plugins = (sentrifiedConfig as UserConfig).plugins as Plugin[];
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('some plugin');
    expect((sentrifiedConfig as UserConfig).server?.fs?.allow).toStrictEqual(['./bar']);

    existsFile = true;
  });
});
