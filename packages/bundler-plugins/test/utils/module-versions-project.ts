import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInNewContext } from 'node:vm';

/** What `__SENTRY_SERVER_MODULES__` holds for the project from `createModuleVersionsProject`. */
export const INJECTED_MODULES = { 'declared-only': '^2.0.0', installed: '1.2.3' };

/**
 * Creates an app with one installed and one declared-only dependency, and an `entry.js` that the bundler tests
 * build. The entry reads the modules like the Node SDK's `modulesIntegration`.
 */
export function createModuleVersionsProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-module-versions-'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'app', dependencies: { 'declared-only': '^2.0.0', installed: '^1.0.0' } }),
  );
  fs.mkdirSync(path.join(root, 'node_modules', 'installed'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'node_modules', 'installed', 'package.json'),
    JSON.stringify({ name: 'installed', version: '1.2.3' }),
  );
  fs.writeFileSync(
    path.join(root, 'entry.js'),
    [
      '// Reads `__SENTRY_SERVER_MODULES__`, or `globalThis.__SENTRY_SERVER_MODULES__` without a build-time value.',
      "globalThis.modules = typeof __SENTRY_SERVER_MODULES__ !== 'undefined'",
      '  ? __SENTRY_SERVER_MODULES__',
      '  : globalThis.__SENTRY_SERVER_MODULES__;',
      '',
    ].join('\n'),
  );
  return root;
}

/** Runs a bundle of `entry.js` and returns the modules that it read. */
export function runAndReadModules(code: string): unknown {
  const module = { exports: {} };
  const context: Record<string, unknown> = { module, exports: module.exports };
  runInNewContext(code, context);
  return context.modules;
}
