import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { bundleReferencesModule } from '@sentry-internal/test-utils';

// Vite 8 emits a `require()` of an external package in bundled CommonJS as `__require()`, and Nitro's
// second bundling pass cannot follow that call. In a flat install (the hoisted variant), Vite keeps
// the dependencies of the instrumented drivers external unless the SDK bundles them, and the server
// then fails with `Cannot find module` outside the project.
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
