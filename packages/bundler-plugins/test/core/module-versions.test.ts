import * as fs from 'fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSentryBuildPluginManager } from '../../src/core/build-plugin-manager';
import { getInstalledModules } from '../../src/core/installed-modules';
import { generateModulesInjectorCode } from '../../src/core/utils';
import type { Options } from '../../src/core';
import { createModuleVersionsProject, INJECTED_MODULES, runAndReadModules } from '../utils/module-versions-project';

describe('generateModulesInjectorCode', () => {
  it('merges the modules into an existing `__SENTRY_SERVER_MODULES__`', () => {
    const context: { __SENTRY_SERVER_MODULES__?: Record<string, string> } = {
      __SENTRY_SERVER_MODULES__: { other: '1.0.0', installed: '0.0.1' },
    };

    runInNewContext(generateModulesInjectorCode({ installed: '1.2.3' }).code(), context);

    expect(context.__SENTRY_SERVER_MODULES__).toEqual({ other: '1.0.0', installed: '1.2.3' });
  });

  it('sets `__SENTRY_SERVER_MODULES__` when nothing set it before', () => {
    const context: { __SENTRY_SERVER_MODULES__?: Record<string, string> } = {};

    runInNewContext(generateModulesInjectorCode({ installed: '1.2.3' }).code(), context);

    expect(context.__SENTRY_SERVER_MODULES__).toEqual({ installed: '1.2.3' });
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

  function getCode(options: Options, isServerBuild: boolean): string {
    return createSentryBuildPluginManager(
      { telemetry: false, silent: true, ...options },
      { buildTool: 'test', loggerPrefix: '[test]' },
    )
      .getModuleVersionsInjectionCode({ root, isServerBuild })
      .code();
  }

  it('reads installed versions and falls back to declared ranges', () => {
    expect(getInstalledModules(root)).toEqual(INJECTED_MODULES);
  });

  it('injects into server builds by default', () => {
    expect(runAndReadModules(getCode({}, true))).toEqual(INJECTED_MODULES);
  });

  it('does not inject into other builds by default', () => {
    expect(getCode({}, false)).toBe('');
  });

  it('injects into every build with `injectModuleVersions: true`', () => {
    expect(runAndReadModules(getCode({ injectModuleVersions: true }, false))).toEqual(INJECTED_MODULES);
  });

  it('does not inject with `injectModuleVersions: false`', () => {
    expect(getCode({ injectModuleVersions: false }, true)).toBe('');
  });

  it('does not inject when the plugin is disabled', () => {
    expect(getCode({ disable: true }, true)).toBe('');
  });

  it('does not inject when the project has no dependencies', () => {
    fs.writeFileSync(`${root}/package.json`, JSON.stringify({ name: 'app' }));

    expect(getCode({}, true)).toBe('');
  });
});
