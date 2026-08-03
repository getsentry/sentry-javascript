import { sentryVitePlugin } from '@sentry/vite-plugin';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCustomSentryVitePlugins } from '../../src/vite/makeCustomSentryVitePlugins';

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: vi.fn().mockReturnValue([{ name: 'sentry-vite-plugin' }]),
}));

describe('makeCustomSentryVitePlugins', () => {
  beforeEach(() => {
    // Without this, `toHaveBeenCalledWith` can match a call made by an earlier test,
    // so assertions pass against stale arguments instead of their own.
    vi.clearAllMocks();
  });

  it('should pass release configuration to sentryVitePlugin', async () => {
    const options = {
      release: {
        name: 'test-release',
      },
    };

    await makeCustomSentryVitePlugins(options);

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        release: {
          name: 'test-release',
        },
      }),
    );
  });

  it('should merge release configuration with unstable_sentryVitePluginOptions', async () => {
    const options = {
      release: {
        name: 'test-release',
      },
      unstable_sentryVitePluginOptions: {
        release: {
          name: 'unstable-release',
          setCommits: { auto: true as const },
        },
      },
    };

    await makeCustomSentryVitePlugins(options);

    // Top-level `release` wins field-wise, but unstable-only fields are preserved
    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        release: {
          name: 'test-release',
          setCommits: { auto: true },
        },
      }),
    );
  });

  it('should pass applicationKey to sentryVitePlugin', async () => {
    await makeCustomSentryVitePlugins({
      applicationKey: 'my-app-key',
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationKey: 'my-app-key',
      }),
    );
  });

  it('should return all plugins from sentryVitePlugin', async () => {
    const plugins = await makeCustomSentryVitePlugins({});
    expect(plugins).toHaveLength(1);
    expect(plugins?.[0]?.name).toBe('sentry-vite-plugin');
  });

  it('should disable sourcemap upload by default', async () => {
    await makeCustomSentryVitePlugins({});

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({
          disable: true,
        }),
      }),
    );
  });

  it('should merge sourcemaps options from unstable_sentryVitePluginOptions while keeping disable', async () => {
    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: {
        sourcemaps: {
          assets: ['dist/**'],
        },
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: {
          assets: ['dist/**'],
          disable: true,
        },
      }),
    );
  });

  // Regression test for https://github.com/getsentry/sentry-javascript/issues/22929:
  // any `sourcemaps` key used to drop `disable: true`, re-enabling debug ID injection
  // in the Vite plugin on top of the one done by `sentryOnBuildEnd`.
  it('should keep sourcemaps disabled when unstable_sentryVitePluginOptions sets an unrelated sourcemaps key', async () => {
    await makeCustomSentryVitePlugins({
      authToken: 'token',
      org: 'org',
      project: 'project',
      unstable_sentryVitePluginOptions: {
        release: { name: 'commit-sha', setCommits: { auto: true } },
        sourcemaps: {
          filesToDeleteAfterUpload: ['./build/**/*.map'],
        },
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: {
          filesToDeleteAfterUpload: undefined,
          disable: true,
        },
      }),
    );
  });

  // The plugin's `writeBundle` deletes these in a `finally` block that runs even when
  // `sourcemaps.disable` is set, which would remove the maps before `sentryOnBuildEnd`
  // uploads them. `sentryOnBuildEnd` performs the deletion instead.
  it('should not forward filesToDeleteAfterUpload to the Vite plugin', async () => {
    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: {
        sourcemaps: {
          assets: ['dist/**'],
          filesToDeleteAfterUpload: ['./build/**/*.map'],
        },
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: {
          assets: ['dist/**'],
          disable: true,
          filesToDeleteAfterUpload: undefined,
        },
      }),
    );
  });

  it('should not let unstable_sentryVitePluginOptions re-enable sourcemaps via disable: false', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: {
        sourcemaps: {
          disable: false,
        },
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({ disable: true }),
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('sourcemaps.disable: false'));

    warnSpy.mockRestore();
  });

  it('should not let unstable_sentryVitePluginOptions re-enable sourcemaps via disable: "disable-upload"', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: {
        sourcemaps: {
          disable: 'disable-upload',
        },
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({ disable: true }),
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('disable-upload'));

    warnSpy.mockRestore();
  });

  it('should not warn when unstable_sentryVitePluginOptions sets sourcemaps.disable: true', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: { sourcemaps: { disable: true } },
    });

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should not warn when unstable_sentryVitePluginOptions does not set sourcemaps.disable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: { sourcemaps: { assets: ['dist/**'] } },
    });

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // metaFramework identifies the SDK to Sentry telemetry, so it stays pinned even
  // though unstable_sentryVitePluginOptions can override other options.
  it('should keep metaFramework when unstable_sentryVitePluginOptions sets _metaOptions.telemetry', async () => {
    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: {
        _metaOptions: {
          telemetry: {
            metaFramework: 'something-else',
          },
        },
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        _metaOptions: {
          telemetry: {
            metaFramework: 'react-router',
          },
        },
      }),
    );
  });

  it('should keep reactComponentAnnotation from unstable_sentryVitePluginOptions when top-level is unset', async () => {
    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: {
        reactComponentAnnotation: {
          enabled: true,
          ignoredComponents: ['Foo'],
        },
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        reactComponentAnnotation: {
          enabled: true,
          ignoredComponents: ['Foo'],
        },
      }),
    );
  });

  it('should merge reactComponentAnnotation field-wise with unstable_sentryVitePluginOptions', async () => {
    await makeCustomSentryVitePlugins({
      reactComponentAnnotation: { enabled: true },
      unstable_sentryVitePluginOptions: {
        reactComponentAnnotation: { ignoredComponents: ['Foo'] },
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        reactComponentAnnotation: {
          enabled: true,
          ignoredComponents: ['Foo'],
        },
      }),
    );
  });

  // `unstable_sentryVitePluginOptions` is documented as being able to override any
  // option the SDK passes to the Vite plugin, so plain top-level keys stay overridable.
  it('should let unstable_sentryVitePluginOptions override plain top-level options', async () => {
    await makeCustomSentryVitePlugins({
      org: 'top-level-org',
      project: 'top-level-project',
      telemetry: false,
      unstable_sentryVitePluginOptions: {
        org: 'unstable-org',
        project: 'unstable-project',
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'unstable-org',
        project: 'unstable-project',
        telemetry: false,
      }),
    );
  });

  it('should pass through unstable_sentryVitePluginOptions keys that have no top-level equivalent', async () => {
    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: {
        silent: true,
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(expect.objectContaining({ silent: true }));
  });
});
