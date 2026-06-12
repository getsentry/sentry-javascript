import type { Options } from '../../src/core';
import type { NormalizedOptions } from '../../src/core/options-mapping';
import { normalizeUserOptions, validateOptions } from '../../src/core/options-mapping';
import { describe, it, test, expect, afterEach, vi, beforeEach } from 'vitest';

describe('normalizeUserOptions()', () => {
  test('should return correct value for default input', () => {
    const userOptions: Options = {
      org: 'my-org',
      project: 'my-project',
      authToken: 'my-auth-token',
      release: { name: 'my-release', uploadLegacySourcemaps: './out' }, // we have to define this even though it is an optional value because of auto discovery
    };

    expect(normalizeUserOptions(userOptions)).toEqual({
      authToken: 'my-auth-token',
      org: 'my-org',
      project: 'my-project',
      debug: false,
      disable: false,
      release: {
        name: 'my-release',
        finalize: true,
        inject: true,
        create: true,
        vcsRemote: 'origin',
        uploadLegacySourcemaps: './out',
        setCommits: {
          auto: true,
          shouldNotThrowOnFailure: true,
          ignoreEmpty: true,
          ignoreMissing: true,
        },
      },
      silent: false,
      telemetry: true,
      _experiments: {},
      _metaOptions: {
        telemetry: {
          metaFramework: undefined,
        },
      },
      url: 'https://sentry.io',
    });
  });

  test('should hoist top-level include options into include entries', () => {
    const userOptions: Options = {
      org: 'my-org',
      project: 'my-project',
      authToken: 'my-auth-token',
      release: {
        name: 'my-release', // we have to define this even though it is an optional value because of auto discovery
        uploadLegacySourcemaps: {
          paths: ['./output', './files'],
          ignore: ['./files'],
          rewrite: true,
          sourceMapReference: false,
          stripCommonPrefix: true,
          ext: ['js', 'map', '.foo'],
        },
      },
    };

    expect(normalizeUserOptions(userOptions)).toEqual({
      authToken: 'my-auth-token',
      org: 'my-org',
      project: 'my-project',
      debug: false,
      disable: false,
      release: {
        name: 'my-release',
        vcsRemote: 'origin',
        finalize: true,
        create: true,
        inject: true,
        uploadLegacySourcemaps: {
          ext: ['js', 'map', '.foo'],
          ignore: ['./files'],
          paths: ['./output', './files'],
          rewrite: true,
          sourceMapReference: false,
          stripCommonPrefix: true,
        },
        setCommits: {
          auto: true,
          shouldNotThrowOnFailure: true,
          ignoreEmpty: true,
          ignoreMissing: true,
        },
      },
      silent: false,
      telemetry: true,
      _experiments: {},
      _metaOptions: {
        telemetry: {
          metaFramework: undefined,
        },
      },
      url: 'https://sentry.io',
    });
  });

  test.each(['https://sentry.io', undefined])(
    'should enable telemetry if `telemetry` is true and Sentry SaaS URL (%s) is used',
    url => {
      const options = {
        include: '',
        url,
      };

      expect(normalizeUserOptions(options).telemetry).toBe(true);
    },
  );

  describe('Vercel deploy detection', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should automatically create deploy config when Vercel env vars are present', () => {
      process.env['VERCEL'] = '1';
      process.env['VERCEL_TARGET_ENV'] = 'production';
      process.env['VERCEL_URL'] = 'my-app.vercel.app';

      const userOptions: Options = {
        org: 'my-org',
        project: 'my-project',
        authToken: 'my-auth-token',
        release: { name: 'my-release' },
      };

      const normalizedOptions = normalizeUserOptions(userOptions);

      expect(normalizedOptions.release.deploy).toEqual({
        env: 'vercel-production',
        url: 'https://my-app.vercel.app',
      });
    });

    test('should not create deploy config when deploy is explicitly set to false', () => {
      process.env['VERCEL'] = '1';
      process.env['VERCEL_TARGET_ENV'] = 'production';
      process.env['VERCEL_URL'] = 'my-app.vercel.app';

      const userOptions: Options = {
        org: 'my-org',
        project: 'my-project',
        authToken: 'my-auth-token',
        release: { name: 'my-release', deploy: false },
      };

      const normalizedOptions = normalizeUserOptions(userOptions);

      expect(normalizedOptions.release.deploy).toBe(false);
    });

    test('should not override manually provided deploy config', () => {
      process.env['VERCEL'] = '1';
      process.env['VERCEL_TARGET_ENV'] = 'production';
      process.env['VERCEL_URL'] = 'my-app.vercel.app';

      const manualDeployConfig = { env: 'custom-env', name: 'custom-deploy' };
      const userOptions: Options = {
        org: 'my-org',
        project: 'my-project',
        authToken: 'my-auth-token',
        release: { name: 'my-release', deploy: manualDeployConfig },
      };

      const normalizedOptions = normalizeUserOptions(userOptions);

      expect(normalizedOptions.release.deploy).toEqual(manualDeployConfig);
    });

    test('should not create deploy config when Vercel env vars are missing', () => {
      const userOptions: Options = {
        org: 'my-org',
        project: 'my-project',
        authToken: 'my-auth-token',
        release: { name: 'my-release' },
      };

      const normalizedOptions = normalizeUserOptions(userOptions);

      expect(normalizedOptions.release.deploy).toBeUndefined();
    });
  });

  describe('multi-project support', () => {
    test('should accept project as a string array', () => {
      const userOptions: Options = {
        org: 'my-org',
        project: ['project-a', 'project-b', 'project-c'],
        authToken: 'my-auth-token',
        release: { name: 'my-release' },
      };

      const normalized = normalizeUserOptions(userOptions);
      expect(normalized.project).toEqual(['project-a', 'project-b', 'project-c']);
    });

    test('should parse comma-separated SENTRY_PROJECT env var', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      process.env['SENTRY_PROJECT'] = 'proj1,proj2,proj3';

      const userOptions: Options = {
        org: 'my-org',
        authToken: 'my-auth-token',
      };

      const normalized = normalizeUserOptions(userOptions);
      expect(normalized.project).toEqual(['proj1', 'proj2', 'proj3']);

      process.env = originalEnv;
    });

    test('should trim whitespace from comma-separated projects', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      process.env['SENTRY_PROJECT'] = 'proj1 , proj2 , proj3';

      const userOptions: Options = {
        org: 'my-org',
        authToken: 'my-auth-token',
      };

      const normalized = normalizeUserOptions(userOptions);
      expect(normalized.project).toEqual(['proj1', 'proj2', 'proj3']);

      process.env = originalEnv;
    });

    test('should keep single project as string (no comma)', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      process.env['SENTRY_PROJECT'] = 'single-project';

      const userOptions: Options = {
        org: 'my-org',
        authToken: 'my-auth-token',
      };

      const normalized = normalizeUserOptions(userOptions);
      expect(normalized.project).toBe('single-project');

      process.env = originalEnv;
    });
  });
});

describe('validateOptions', () => {
  const mockedLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return `true` if `injectRelease` is `true` and org is provided', () => {
    const options = { injectReleasesMap: true, org: 'my-org' } as Partial<NormalizedOptions>;

    expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(true);
    expect(mockedLogger.error).not.toHaveBeenCalled();
  });

  it('should return `false` if `setCommits` is set but neither auto nor manual options are set', () => {
    const options = { release: { setCommits: {} } } as Partial<NormalizedOptions>;

    expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(false);
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringMatching(/setCommits.*missing.*properties/),
      expect.stringMatching(/set.*either.*auto.*repo.*commit/),
    );
  });

  it('should return `true` but warn if `setCommits` is set and both auto nor manual options are set', () => {
    const options = { release: { setCommits: { auto: true, repo: 'myRepo', commit: 'myCommit' } } };

    expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(true);
    expect(mockedLogger.error).not.toHaveBeenCalled();
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/setCommits.*auto.*repo.*commit/),
      expect.stringMatching(/Ignoring.*repo.*commit/),
      expect.stringMatching(/set.*either.*auto.*repo.*commit/),
    );
  });

  it('should return `false` if `deploy`is set but `env` is not provided', () => {
    const options = { release: { deploy: {} } } as Partial<NormalizedOptions>;

    expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(false);
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringMatching(/deploy.*missing.*property/),
      expect.stringMatching(/set.*env/),
    );
  });

  it('should return `true` if `deploy`is set and `env` is provided', () => {
    const options = { release: { deploy: { env: 'my-env' } } } as Partial<NormalizedOptions>;

    expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(true);
    expect(mockedLogger.error).not.toHaveBeenCalled();
  });

  it('should return `true` if `deploy` is set to `false`', () => {
    const options = { release: { deploy: false } } as Partial<NormalizedOptions>;

    expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(true);
    expect(mockedLogger.error).not.toHaveBeenCalled();
  });

  it('should return `true` for options without special cases', () => {
    const options = {
      org: 'my-org',
      project: 'my-project',
      authToken: 'my-auth-token',
      include: [{}],
      finalize: true,
    } as Partial<NormalizedOptions>;

    expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(true);
    expect(mockedLogger.error).not.toHaveBeenCalled();
  });

  describe('multi-project validation', () => {
    it('should return `false` if project array is empty', () => {
      const options = { project: [] } as Partial<NormalizedOptions>;

      expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(false);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        expect.stringMatching(/project.*array.*empty/i),
        expect.stringMatching(/at least one/i),
      );
    });

    it('should return `false` if project array contains invalid strings', () => {
      const options = { project: ['valid', '', '  ', 'also-valid'] } as Partial<NormalizedOptions>;

      expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(false);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        expect.stringMatching(/invalid.*project/i),
        expect.stringMatching(/non-empty strings/i),
      );
    });

    it('should return `true` for valid project array', () => {
      const options = { project: ['proj-a', 'proj-b'] } as Partial<NormalizedOptions>;

      expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(true);
      expect(mockedLogger.error).not.toHaveBeenCalled();
    });

    it('should return `true` for valid single project string', () => {
      const options = { project: 'single-project' } as Partial<NormalizedOptions>;

      expect(validateOptions(options as unknown as NormalizedOptions, mockedLogger)).toBe(true);
      expect(mockedLogger.error).not.toHaveBeenCalled();
    });
  });
});
