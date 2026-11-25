import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSentryBuildPluginManager } from '../../src/core/build-plugin-manager';
import { getInstalledModules } from '../../src/core/installed-modules';
import { replaceBooleanFlagsInCode } from '../../src/core/utils';
import type { Options } from '../../src/core';
import { createModuleVersionsProject, INJECTED_MODULES } from '../utils/module-versions-project';

describe('replaceBooleanFlagsInCode with server modules', () => {
  const modules = { installed: '1.2.3' };

  it('replaces the `__SENTRY_SERVER_MODULES__` placeholder', () => {
    const code = "if (typeof __SENTRY_SERVER_MODULES__ !== 'undefined') return __SENTRY_SERVER_MODULES__;";

    expect(replaceBooleanFlagsInCode(code, {}, modules)?.code).toBe(
      'if (typeof ({"installed":"1.2.3"}) !== \'undefined\') return ({"installed":"1.2.3"});',
    );
  });

  it('replaces flags and the placeholder in one pass', () => {
    const code = 'if (__SENTRY_DEBUG__) console.log(__SENTRY_SERVER_MODULES__);';

    expect(replaceBooleanFlagsInCode(code, { __SENTRY_DEBUG__: false }, modules)?.code).toBe(
      'if (false) console.log(({"installed":"1.2.3"}));',
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
