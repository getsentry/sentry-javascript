import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentryNuxtModuleOptions } from '../../src/common/types';
import { getPluginOptions } from '../../src/vite/sourceMaps';

describe('getPluginOptions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {};
  });

  it('uses environment variables when no moduleOptions are provided', () => {
    const defaultEnv = {
      SENTRY_ORG: 'default-org',
      SENTRY_PROJECT: 'default-project',
      SENTRY_AUTH_TOKEN: 'default-token',
    };

    process.env = { ...defaultEnv };

    const options = getPluginOptions({} as SentryNuxtModuleOptions);

    expect(options).toEqual(
      expect.objectContaining({
        org: 'default-org',
        project: 'default-project',
        authToken: 'default-token',
        telemetry: true,
        sourcemaps: expect.objectContaining({
          rewriteSources: expect.any(Function),
        }),
        _metaOptions: expect.objectContaining({
          telemetry: expect.objectContaining({
            metaFramework: 'nuxt',
          }),
        }),
        debug: false,
      }),
    );
  });

  it('returns default options when no moduleOptions are provided', () => {
    const options = getPluginOptions({} as SentryNuxtModuleOptions);

    expect(options.org).toBeUndefined();
    expect(options.project).toBeUndefined();
    expect(options.authToken).toBeUndefined();
    expect(options).toEqual(
      expect.objectContaining({
        telemetry: true,
        sourcemaps: expect.objectContaining({
          rewriteSources: expect.any(Function),
        }),
        _metaOptions: expect.objectContaining({
          telemetry: expect.objectContaining({
            metaFramework: 'nuxt',
          }),
        }),
        debug: false,
      }),
    );
  });

  it('merges custom moduleOptions with default options', () => {
    const customOptions: SentryNuxtModuleOptions = {
      sourceMapsUploadOptions: {
        org: 'custom-org',
        project: 'custom-project',
        authToken: 'custom-token',
        telemetry: false,
        sourcemaps: {
          assets: ['custom-assets/**/*'],
          ignore: ['ignore-this.js'],
          filesToDeleteAfterUpload: ['delete-this.js'],
        },
      },
      debug: true,
    };
    const options = getPluginOptions(customOptions);
    expect(options).toEqual(
      expect.objectContaining({
        org: 'custom-org',
        project: 'custom-project',
        authToken: 'custom-token',
        telemetry: false,
        sourcemaps: expect.objectContaining({
          assets: ['custom-assets/**/*'],
          ignore: ['ignore-this.js'],
          filesToDeleteAfterUpload: ['delete-this.js'],
          rewriteSources: expect.any(Function),
        }),
        _metaOptions: expect.objectContaining({
          telemetry: expect.objectContaining({
            metaFramework: 'nuxt',
          }),
        }),
        debug: true,
      }),
    );
  });

  it('overrides options that were undefined with options from unstable_sentryRollupPluginOptions', () => {
    const customOptions: SentryNuxtModuleOptions = {
      sourceMapsUploadOptions: {
        org: 'custom-org',
        project: 'custom-project',
        sourcemaps: {
          assets: ['custom-assets/**/*'],
          filesToDeleteAfterUpload: ['delete-this.js'],
        },
      },
      debug: true,
      unstable_sentryBundlerPluginOptions: {
        org: 'unstable-org',
        sourcemaps: {
          assets: ['unstable-assets/**/*'],
        },
        release: {
          name: 'test-release',
        },
      },
    };
    const options = getPluginOptions(customOptions);
    expect(options).toEqual(
      expect.objectContaining({
        debug: true,
        org: 'unstable-org',
        project: 'custom-project',
        sourcemaps: expect.objectContaining({
          assets: ['unstable-assets/**/*'],
          filesToDeleteAfterUpload: ['delete-this.js'],
          rewriteSources: expect.any(Function),
        }),
        release: expect.objectContaining({
          name: 'test-release',
        }),
      }),
    );
  });
});
