import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfigInjectorPlugin } from '../../src/vite/makeConfigInjectorPlugin';
import { makeCustomSentryVitePlugins } from '../../src/vite/makeCustomSentryVitePlugins';
import { makeEnableSourceMapsPlugin } from '../../src/vite/makeEnableSourceMapsPlugin';
import { sentryReactRouter } from '../../src/vite/plugin';

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

vi.mock('../../src/vite/makeCustomSentryVitePlugins');
vi.mock('../../src/vite/makeEnableSourceMapsPlugin');
vi.mock('../../src/vite/makeConfigInjectorPlugin');

describe('sentryReactRouter', () => {
  const mockPlugins = [{ name: 'test-plugin' }];
  const mockSourceMapsPlugin = { name: 'source-maps-plugin' };
  const mockConfigInjectorPlugin = { name: 'sentry-config-injector' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(makeCustomSentryVitePlugins).mockResolvedValue(mockPlugins);
    vi.mocked(makeEnableSourceMapsPlugin).mockReturnValue(mockSourceMapsPlugin);
    vi.mocked(makeConfigInjectorPlugin).mockReturnValue(mockConfigInjectorPlugin);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should return sentry config injector plugin in development mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const result = await sentryReactRouter({}, { command: 'build', mode: 'production' });

    expect(result).toEqual([mockConfigInjectorPlugin]);
    expect(makeCustomSentryVitePlugins).not.toHaveBeenCalled();
    expect(makeEnableSourceMapsPlugin).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should return config injector plugin when not in build mode', async () => {
    const result = await sentryReactRouter({}, { command: 'serve', mode: 'production' });

    expect(result).toEqual([mockConfigInjectorPlugin]);
    expect(makeCustomSentryVitePlugins).not.toHaveBeenCalled();
    expect(makeEnableSourceMapsPlugin).not.toHaveBeenCalled();
  });

  it('should return config injector plugin in development build mode', async () => {
    const result = await sentryReactRouter({}, { command: 'build', mode: 'development' });

    expect(result).toEqual([mockConfigInjectorPlugin]);
    expect(makeCustomSentryVitePlugins).not.toHaveBeenCalled();
    expect(makeEnableSourceMapsPlugin).not.toHaveBeenCalled();
  });

  it('should return all plugins in production build mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const result = await sentryReactRouter({}, { command: 'build', mode: 'production' });

    expect(result).toEqual([mockConfigInjectorPlugin, mockSourceMapsPlugin, ...mockPlugins]);
    expect(makeConfigInjectorPlugin).toHaveBeenCalledWith({});
    expect(makeCustomSentryVitePlugins).toHaveBeenCalledWith({});
    expect(makeEnableSourceMapsPlugin).toHaveBeenCalledWith({});

    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should pass release configuration to plugins', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const options = {
      release: {
        name: 'v1.0.0',
      },
    };

    await sentryReactRouter(options, { command: 'build', mode: 'production' });

    expect(makeConfigInjectorPlugin).toHaveBeenCalledWith(options);
    expect(makeCustomSentryVitePlugins).toHaveBeenCalledWith(options);
    expect(makeEnableSourceMapsPlugin).toHaveBeenCalledWith(options);

    process.env.NODE_ENV = originalNodeEnv;
  });
});
