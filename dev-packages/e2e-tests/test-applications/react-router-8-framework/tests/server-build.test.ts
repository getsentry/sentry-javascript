import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { bundleReferencesModule } from '@sentry-internal/test-utils';
import { RUNTIME } from './constants';

// `@sentry/core` is a direct dependency of this app so that Vite resolves it from the app root and
// keeps it external, as in an npm install. Bundled into the server build, it hides the case where
// bundled CommonJS `require()`s `@sentry/core`: Vite 5-7 turn that into a default import, and
// `@sentry/core` has no default export, so the server crashes at startup.
test.describe('server build', () => {
  test.skip(RUNTIME === 'cloudflare', 'The Cloudflare build bundles all dependencies.');

  test('imports the external @sentry/core by name only', () => {
    const root = path.join(process.cwd(), 'build/server');
    const serverBundle = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter(file => file.endsWith('.js'))
      .map(file => readFileSync(path.join(root, file), 'utf8'))
      .join('\n');

    expect(bundleReferencesModule(serverBundle, '@sentry/core'), 'Vite must keep @sentry/core external').toBe(true);
    expect(serverBundle.match(/\bimport\s+[\w$]+\s*(?:,\s*\{[^}]*\})?\s*from\s*["']@sentry\/[^"']+["']/g)).toBeNull();
  });
});
