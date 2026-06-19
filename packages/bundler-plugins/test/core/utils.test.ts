import {
  determineReleaseName,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
  getDependencies,
  getPackageJson,
  parseMajorVersion,
  replaceBooleanFlagsInCode,
  serializeIgnoreOptions,
  stringToUUID,
} from '../../src/core/utils';

import childProcess from 'child_process';
import fs from 'fs';
import { describe, it, expect, test, vi } from 'vitest';
import path from 'node:path';

type PackageJson = Record<string, unknown>;

function getCwdFor(dirName: string): string {
  return path.resolve(__dirname + dirName);
}

describe('getPackageJson', () => {
  test('it works for this package', () => {
    const packageJson = getPackageJson();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const expected = require('../../package.json') as PackageJson;

    expect(packageJson).toEqual(expected);
  });

  test('it works with nested folders with invalid package.json format', () => {
    const packageJson = getPackageJson({
      cwd: getCwdFor('/fixtures/deeply-nested-package/deeply/nested'),
    });

    expect(packageJson).toEqual({ name: 'my-deeply-nested-package' });
  });

  test('it works with nested folders with errors in package.json', () => {
    const packageJson = getPackageJson({
      cwd: getCwdFor('/fixtures/nested-error-package/deeply/nested'),
    });

    expect(packageJson).toEqual({ name: 'my-deeply-nested-package' });
  });

  test('it picks first package.json it finds', () => {
    const packageJson = getPackageJson({
      cwd: getCwdFor('/fixtures/nested-package/deeply/nested'),
    });

    expect(packageJson).toEqual({ name: 'my-first-package' });
  });

  test('it stops after reaching too far', () => {
    const packageJson = getPackageJson({
      cwd: getCwdFor('/fixtures/no-valid-package/deeply/nested'),
      stopAt: process.cwd(),
    });

    expect(packageJson).toBeUndefined();
  });
});

describe('parseMajorVersion', () => {
  it.each([
    ['2.0.0', 2],
    ['12.0.0', 12],
    ['12.0', 12],
    ['12', 12],
    ['>12', 12],
    ['<12', 11],
    ['<=12', 12],
    ['>=12', 12],
    ['>12.0.0', 12],
    ['<12.0.0', 11],
    ['<=12.0.0', 12],
    ['>=12.0.0', 12],
    ['>= 12.0.0', 12],
    ['<= 12.0.0', 12],
    ['< 12.0.0', 11],
    ['< 12.0.1', 12],
    ['< 12.1', 12],
    ['< 12.0', 11],
    ['> 2', 2],
    ['< 2', 1],
    ['12.x', 12],
    ['> 10 < 12', 10],
  ])('parses %s', (version, expected) => {
    expect(parseMajorVersion(version)).toBe(expected);

    // Also test with prerelease suffix
    expect(parseMajorVersion(`${version}-alpha.1`)).toBe(expected);

    // Also test with v prefix
    expect(parseMajorVersion(`v${version}`)).toBe(expected);
  });
});

describe('getDependencies', () => {
  test('it works without dependencies', () => {
    const { deps, depsVersions } = getDependencies({});

    expect(deps).toEqual([]);
    expect(depsVersions).toEqual({});
  });

  test('it works with only dependencies', () => {
    const { deps, depsVersions } = getDependencies({
      dependencies: {
        dep1: '1',
        'other-dep': '^2.0.0',
        dep2: '~3.1.0',
      },
    });

    expect(deps).toEqual(['dep1', 'dep2', 'other-dep']);
    expect(depsVersions).toEqual({});
  });

  test('it works with only devDependencies', () => {
    const { deps, depsVersions } = getDependencies({
      devDependencies: {
        dep1: '1',
        'other-dep': '^2.0.0',
        dep2: '~3.1.0',
      },
    });

    expect(deps).toEqual(['dep1', 'dep2', 'other-dep']);
    expect(depsVersions).toEqual({});
  });

  test('it works with both devDependencies & dependencies', () => {
    const { deps, depsVersions } = getDependencies({
      devDependencies: {
        dep1: '1',
        'other-dep': '^2.0.0',
        dep2: '~3.1.0',
      },
      dependencies: {
        dep3: '2',
        'another-dep': '^3.0.0',
      },
    });

    expect(deps).toEqual(['another-dep', 'dep1', 'dep2', 'dep3', 'other-dep']);
    expect(depsVersions).toEqual({});
  });

  test('it extracts versions of packages we care about', () => {
    const { deps, depsVersions } = getDependencies({
      devDependencies: {
        dep1: '1',
        webpack: '5.x',
        react: '^18.2.0',
        'other-dep': '^2.0.0',
        dep2: '~3.1.0',
      },
      dependencies: {
        dep3: '2',
        'another-dep': '^3.0.0',
        vite: '^3.0.0',
      },
    });

    expect(deps).toEqual(['another-dep', 'dep1', 'dep2', 'dep3', 'other-dep', 'react', 'vite', 'webpack']);
    expect(depsVersions).toEqual({
      react: 18,
      vite: 3,
      webpack: 5,
    });
  });
});

describe('stringToUUID', () => {
  test('should return a deterministic UUID', () => {
    expect(stringToUUID('Nothing personnel kid')).toBe('95543648-7392-49e4-b46a-67dfd0235986');
  });
});

describe('replaceBooleanFlagsInCode', () => {
  test('it works without a match', () => {
    const code = 'const a = 1;';
    const result = replaceBooleanFlagsInCode(code, { __DEBUG_BUILD__: false });
    expect(result).toBeNull();
  });

  test('it works with matches', () => {
    const code = `const a = 1;
if (__DEBUG_BUILD__ && checkMe()) {
  // do something
}
if (__DEBUG_BUILD__ && __RRWEB_EXCLUDE_CANVAS__) {
  const a = __RRWEB_EXCLUDE_CANVAS__ ? 1 : 2;
}`;
    const result = replaceBooleanFlagsInCode(code, {
      __DEBUG_BUILD__: false,
      __RRWEB_EXCLUDE_CANVAS__: true,
    });
    expect(result).toEqual({
      code: `const a = 1;
if (false && checkMe()) {
  // do something
}
if (false && true) {
  const a = true ? 1 : 2;
}`,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      map: expect.anything(),
    });
  });
});

describe('generateReleaseInjectorCode', () => {
  it('generates code with release', () => {
    const generatedCode = generateReleaseInjectorCode({
      release: '1.2.3',
      injectBuildInformation: false,
    });

    expect(generatedCode.code()).toMatch(/e\.SENTRY_RELEASE=\{id:"1\.2\.3"\};/);
  });

  it('generates code with release and build information', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValueOnce(
      JSON.stringify({
        name: 'test-app',
        dependencies: {
          myDep: '^2.1.4',
        },
        devDependencies: {
          rollup: '^3.1.4',
        },
      }),
    );

    const generatedCode = generateReleaseInjectorCode({
      release: '1.2.3',
      injectBuildInformation: true,
    });

    expect(generatedCode.code()).toMatch(/e\.SENTRY_RELEASE=\{id:"1\.2\.3"\};/);
    // `nodeVersion` is environment-dependent, so match it loosely while asserting the
    // deterministic build-information parts derived from the mocked package.json.
    expect(generatedCode.code()).toMatch(
      /e\.SENTRY_BUILD_INFO=\{"deps":\["myDep","rollup"\],"depsVersions":\{"rollup":3\},"nodeVersion":\d+\};/,
    );
  });
});

describe('generateModuleMetadataInjectorCode', () => {
  it('generates code with empty metadata object', () => {
    const generatedCode = generateModuleMetadataInjectorCode({});
    expect(generatedCode.code()).toMatchSnapshot();
  });

  it('generates code with metadata object', () => {
    const generatedCode = generateModuleMetadataInjectorCode({
      'file1.js': {
        foo: 'bar',
      },
      'file2.js': {
        bar: 'baz',
      },
    });
    expect(generatedCode.code()).toMatchSnapshot();
  });
});

describe('serializeIgnoreOptions', () => {
  it('returns default ignore options when undefined', () => {
    const result = serializeIgnoreOptions(undefined);
    expect(result).toEqual(['--ignore', 'node_modules']);
  });

  it('handles array of ignore patterns', () => {
    const result = serializeIgnoreOptions(['dist', '**/build/**', '*.log']);
    expect(result).toEqual(['--ignore', 'dist', '--ignore', '**/build/**', '--ignore', '*.log']);
  });

  it('handles single string pattern', () => {
    const result = serializeIgnoreOptions('dist');
    expect(result).toEqual(['--ignore', 'dist']);
  });

  it('handles empty array', () => {
    const result = serializeIgnoreOptions([]);
    expect(result).toEqual([]);
  });
});

describe('determineReleaseName', () => {
  it('runs `git rev-parse HEAD` with windowsHide so no console window flashes on Windows', () => {
    // Clear env so the function falls through the CI/git-provider checks to the
    // git fallback (CI runs with GITHUB_SHA set, which would otherwise short-circuit).
    const originalEnv = process.env;
    process.env = {};
    const execSyncSpy = vi.spyOn(childProcess, 'execSync').mockReturnValue(Buffer.from('0'.repeat(40)));

    try {
      determineReleaseName();
      expect(execSyncSpy).toHaveBeenCalledWith('git rev-parse HEAD', expect.objectContaining({ windowsHide: true }));
    } finally {
      process.env = originalEnv;
      execSyncSpy.mockRestore();
    }
  });
});
