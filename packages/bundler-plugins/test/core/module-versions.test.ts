import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSentryBuildPluginManager } from '../../src/core/build-plugin-manager';
import { getInstalledModules } from '../../src/core/installed-modules';
import { getServerModulesReplacement, replaceInCode } from '../../src/core/utils';
import type { Options } from '../../src/core';
import { createModuleVersionsProject, INJECTED_MODULES } from '../utils/module-versions-project';

describe('getServerModulesReplacement', () => {
  it('replaces the `__SENTRY_SERVER_MODULES__` placeholder with the versions in parentheses', () => {
    const code = 'const modules = __SENTRY_SERVER_MODULES__;';

    expect(replaceInCode(code, getServerModulesReplacement({ installed: '1.2.3' }))?.code).toBe(
      'const modules = ({"installed":"1.2.3"});',
    );
  });
});

describe('module versions', () => {
  let root: string;

  beforeEach(() => {
    root = createModuleVersionsProject();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function getModuleVersions(options: Options, isServerBuild: boolean): Record<string, string> | undefined {
    return createSentryBuildPluginManager(
      { telemetry: false, silent: true, ...options },
      { buildTool: 'test', loggerPrefix: '[test]' },
    ).getModuleVersions({ root, isServerBuild });
  }

  it('reads installed versions and falls back to declared ranges', () => {
    expect(getInstalledModules(root)).toEqual(INJECTED_MODULES);
  });

  it('returns the versions for server builds by default', () => {
    expect(getModuleVersions({}, true)).toEqual(INJECTED_MODULES);
  });

  it('returns nothing for other builds by default', () => {
    expect(getModuleVersions({}, false)).toBeUndefined();
  });

  it('returns the versions for every build with `injectModuleVersions: true`', () => {
    expect(getModuleVersions({ injectModuleVersions: true }, false)).toEqual(INJECTED_MODULES);
  });

  it('returns nothing with `injectModuleVersions: false`', () => {
    expect(getModuleVersions({ injectModuleVersions: false }, true)).toBeUndefined();
  });

  it('returns nothing when the plugin is disabled', () => {
    expect(getModuleVersions({ disable: true }, true)).toBeUndefined();
  });

  it('returns nothing when the project has no dependencies', () => {
    fs.writeFileSync(`${root}/package.json`, JSON.stringify({ name: 'app' }));

    expect(getModuleVersions({}, true)).toBeUndefined();
  });
});
