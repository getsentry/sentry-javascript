import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfigInjectorPlugin } from '../../src/vite/makeConfigInjectorPlugin';
import { makeCustomSentryVitePlugins } from '../../src/vite/makeCustomSentryVitePlugins';
import { makeEnableSourceMapsPlugin } from '../../src/vite/makeEnableSourceMapsPlugin';
import { makeServerBuildCapturePlugin } from '../../src/vite/makeServerBuildCapturePlugin';
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
vi.mock('../../src/vite/makeServerBuildCapturePlugin');

// Stub the orchestrion plugin so these stay pure wiring tests (no apm code transformer pulled in).
// Mirror the real plugin's contract: `buildTimeInstrumentation: false` yields the inert variant.
const orchestrionVite = vi.fn((options?: { buildTimeInstrumentation?: boolean }) => ({
  name: options?.buildTimeInstrumentation === false ? 'sentry-orchestrion-disabled' : 'sentry-orchestrion-vite',
}));
vi.mock('@sentry/server-utils/orchestrion/vite', () => ({
  sentryOrchestrionPlugin: (options?: { buildTimeInstrumentation?: boolean }) => orchestrionVite(options),
}));

describe('sentryReactRouter', () => {
  const mockPlugins = [{ name: 'test-plugin' }];
  const mockSourceMapsPlugin = { name: 'source-maps-plugin' };
  const mockConfigInjectorPlugin = { name: 'sentry-config-injector' };
  const mockServerBuildCapturePlugin = { name: 'sentry-react-router-server-build-capture' };
  const mockOrchestrionPlugin = { name: 'sentry-orchestrion-vite' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(makeCustomSentryVitePlugins).mockResolvedValue(mockPlugins);
    vi.mocked(makeEnableSourceMapsPlugin).mockReturnValue(mockSourceMapsPlugin);
    vi.mocked(makeConfigInjectorPlugin).mockReturnValue(mockConfigInjectorPlugin);
    vi.mocked(makeServerBuildCapturePlugin).mockReturnValue(mockServerBuildCapturePlugin);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should return sentry config injector plugin in development mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const result = await sentryReactRouter({}, { command: 'build', mode: 'production' });

    expect(result).toEqual([mockConfigInjectorPlugin, mockServerBuildCapturePlugin, mockOrchestrionPlugin]);
    expect(makeCustomSentryVitePlugins).not.toHaveBeenCalled();
    expect(makeEnableSourceMapsPlugin).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should return config injector plugin when not in build mode', async () => {
    const result = await sentryReactRouter({}, { command: 'serve', mode: 'production' });

    expect(result).toEqual([mockConfigInjectorPlugin, mockServerBuildCapturePlugin, mockOrchestrionPlugin]);
    expect(makeCustomSentryVitePlugins).not.toHaveBeenCalled();
    expect(makeEnableSourceMapsPlugin).not.toHaveBeenCalled();
  });

  it('should return config injector plugin in development build mode', async () => {
    const result = await sentryReactRouter({}, { command: 'build', mode: 'development' });

    expect(result).toEqual([mockConfigInjectorPlugin, mockServerBuildCapturePlugin, mockOrchestrionPlugin]);
    expect(makeCustomSentryVitePlugins).not.toHaveBeenCalled();
    expect(makeEnableSourceMapsPlugin).not.toHaveBeenCalled();
  });

  it('should return all plugins in production build mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const result = await sentryReactRouter({}, { command: 'build', mode: 'production' });

    expect(result).toEqual([
      mockConfigInjectorPlugin,
      mockServerBuildCapturePlugin,
      mockOrchestrionPlugin,
      mockSourceMapsPlugin,
      ...mockPlugins,
    ]);
    expect(makeConfigInjectorPlugin).toHaveBeenCalledWith({});
    expect(makeServerBuildCapturePlugin).toHaveBeenCalled();
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

  it('adds the orchestrion plugin by default', async () => {
    const result = await sentryReactRouter({}, { command: 'serve', mode: 'production' });
    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: undefined });
    expect(result.map(plugin => plugin?.name)).toContain('sentry-orchestrion-vite');
  });

  it('adds an inert orchestrion plugin when `buildTimeInstrumentation` is `false`', async () => {
    const result = await sentryReactRouter(
      { buildTimeInstrumentation: false },
      { command: 'serve', mode: 'production' },
    );
    const pluginNames = result.map(plugin => plugin?.name);
    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: false });
    expect(pluginNames).toContain('sentry-orchestrion-disabled');
    expect(pluginNames).not.toContain('sentry-orchestrion-vite');
  });
});
