import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CheckModule from '../../src/v3/server/checkInstrumentation';

type Check = typeof CheckModule.checkRemixV3Instrumentation;

const INSTALLED: Record<string, string> = { '@remix-run/fetch-router': '0.21.0' };

let check: Check;
let readInstalledVersion: typeof CheckModule.readInstalledVersion;
let warn: ReturnType<typeof vi.spyOn>;

/** A fresh module per test, since the warning is deduplicated for the life of the process. */
beforeEach(async () => {
  vi.resetModules();
  ({ checkRemixV3Instrumentation: check, readInstalledVersion } =
    await import('../../src/v3/server/checkInstrumentation'));
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@remix-run/fetch-router'] };
});

afterEach(() => {
  warn.mockRestore();
  delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
});

function installed(name: string): string | undefined {
  return INSTALLED[name];
}

function warning(): string {
  expect(warn).toHaveBeenCalledTimes(1);
  return String(warn.mock.calls[0]?.[0]);
}

describe('checkRemixV3Instrumentation', () => {
  it('stays quiet when the hook transformed the router module', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@remix-run/fetch-router'] };

    check(installed);

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not judge the other Remix packages, since remix installs them whether the app uses them or not', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@remix-run/fetch-router'] };

    check(() => '0.1.0');

    expect(warn).not.toHaveBeenCalled();
  });

  it('reports the Node version when the module hook could not be registered', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtimeUnavailable: true };

    check(installed);

    expect(warning()).toContain(`could not be registered on Node ${process.version}`);
  });

  it('points at --import when the installed router module in range was not transformed', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: [] };

    check(installed);

    const message = warning();
    expect(message).toContain('@remix-run/fetch-router was imported before the Sentry module hook');
    expect(message).toContain('--import @sentry/remix/v3/node');
  });

  it('reports a version outside the supported range as that, not as a missing --import', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: [] };

    check(() => '1.0.0');

    const message = warning();
    expect(message).toContain('@remix-run/fetch-router@1.0.0 is outside the supported range >=0.21.0 <1');
    expect(message).not.toContain('--import');
  });

  it('stays quiet when Remix 3 is not installed', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: [] };

    check(() => undefined);

    expect(warn).not.toHaveBeenCalled();
  });

  it('treats no marker at all as nothing transformed', () => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;

    check(installed);

    expect(warning()).toContain('was imported before the Sentry module hook');
  });

  it('warns once', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: [] };

    check(installed);
    check(installed);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('readInstalledVersion', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function writePackage(root: string, name: string, version: string): string {
    const dir = path.join(root, 'node_modules', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version }));
    return dir;
  }

  it('reads the copy next to the real remix package under pnpm, not a hoisted one', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'remix-app-'));
    dirs.push(app);
    // Hoisted at the app root: the wrong copy.
    writePackage(app, '@remix-run/fetch-router', '0.1.0');
    // The pnpm store: remix and its own dependency side by side, reached through a symlink.
    const store = path.join(app, 'node_modules', '.pnpm', 'remix@3.0.0');
    const realRemix = writePackage(store, 'remix', '3.0.0');
    writePackage(store, '@remix-run/fetch-router', '0.21.0');
    fs.mkdirSync(path.join(app, 'node_modules'), { recursive: true });
    fs.symlinkSync(realRemix, path.join(app, 'node_modules', 'remix'), 'dir');

    expect(readInstalledVersion('@remix-run/fetch-router', app)).toBe('0.21.0');
  });

  it('walks up from a nested working directory', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'remix-app-'));
    dirs.push(app);
    writePackage(app, 'remix', '3.0.0');
    writePackage(app, '@remix-run/assets', '0.6.0');

    expect(readInstalledVersion('@remix-run/assets', path.join(app, 'app', 'routes'))).toBe('0.6.0');
  });

  it('is undefined when remix or the package is not installed', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'remix-app-'));
    dirs.push(app);

    expect(readInstalledVersion('@remix-run/assets', app)).toBeUndefined();

    writePackage(app, 'remix', '3.0.0');
    expect(readInstalledVersion('@remix-run/assets', app)).toBeUndefined();
  });
});
