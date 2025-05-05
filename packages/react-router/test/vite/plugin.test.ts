import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('sentryReactRouter', () => {
  const mockPlugins = [{ name: 'test-plugin' }];
  const mockSourceMapsPlugin = { name: 'source-maps-plugin' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(makeCustomSentryVitePlugins).mockResolvedValue(mockPlugins);
    vi.mocked(makeEnableSourceMapsPlugin).mockReturnValue(mockSourceMapsPlugin);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should return an empty array in development mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const result = await sentryReactRouter({}, { command: 'build', mode: 'production' });

    expect(result).toEqual([]);
    expect(makeCustomSentryVitePlugins).not.toHaveBeenCalled();
    expect(makeEnableSourceMapsPlugin).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should return an empty array when not in build mode', async () => {
    const result = await sentryReactRouter({}, { command: 'serve', mode: 'production' });

    expect(result).toEqual([]);
    expect(makeCustomSentryVitePlugins).not.toHaveBeenCalled();
    expect(makeEnableSourceMapsPlugin).not.toHaveBeenCalled();
  });

  it('should return an empty array when in development mode', async () => {
    const result = await sentryReactRouter({}, { command: 'build', mode: 'development' });

    expect(result).toEqual([]);
    expect(makeCustomSentryVitePlugins).not.toHaveBeenCalled();
    expect(makeEnableSourceMapsPlugin).not.toHaveBeenCalled();
  });

  it('should return plugins in production build mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const result = await sentryReactRouter({}, { command: 'build', mode: 'production' });

    expect(result).toEqual([mockSourceMapsPlugin, ...mockPlugins]);
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

    expect(makeCustomSentryVitePlugins).toHaveBeenCalledWith(options);
    expect(makeEnableSourceMapsPlugin).toHaveBeenCalledWith(options);

    process.env.NODE_ENV = originalNodeEnv;
  });
});
