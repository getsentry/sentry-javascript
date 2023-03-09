import type { Plugin, UserConfig } from 'vite';

import { withSentryViteConfig } from '../../src/config/withSentryViteConfig';

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
      return originalConfig;
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
});
