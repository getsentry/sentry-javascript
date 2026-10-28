import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { bundleReferencesModule } from '@sentry-internal/test-utils';

// Nitro can't follow the `__require()` calls that Vite 8 emits for external requires in bundled
// CommonJS, so the deployed server fails with `Cannot find module`. Only flat installs (the hoisted
// variant) keep the drivers' dependencies external.
// https://vite.dev/guide/migration#require-calls-for-externalized-modules
test('bundles the CommonJS dependencies of the instrumented drivers', () => {
  const root = path.join(process.cwd(), '.output/server');
  const serverBundle = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(file => /\.m?js$/.test(file) && !file.startsWith('node_modules'))
    .map(file => readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  const driverDependencies = ['sqlstring', 'bignumber.js', 'denque', 'cluster-key-slot', 'standard-as-callback'];

  const externalRequires = [...serverBundle.matchAll(/__require\(["']([^"']+)["']\)/g)].map(match => match[1]);

  expect(bundleReferencesModule(serverBundle, 'mysql'), 'mysql must be bundled to be instrumented').toBe(false);
  expect(externalRequires.filter(name => driverDependencies.includes(name))).toEqual([]);
});
