import * as fs from 'fs';
import * as path from 'path';
import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

function findFileInDir(dir: string, suffix: string): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileInDir(entryPath, suffix);
      if (found) {
        return found;
      }
    } else if (entryPath.endsWith(suffix)) {
      return entryPath;
    }
  }
  return undefined;
}

test('standalone output contains all meriyah files needed at runtime', () => {
  // meriyah's ESM build sits behind the `module-sync` export condition, which Next.js' output file
  // tracing resolves differently than the Node.js runtime does (https://github.com/vercel/nft/issues/603).
  // Without the SDK force-including it, the standalone server crashes with ERR_MODULE_NOT_FOUND.
  const standaloneDir = path.join(process.cwd(), '.next', 'standalone');
  expect(findFileInDir(standaloneDir, path.join('meriyah', 'dist', 'meriyah.mjs'))).toBeDefined();
  expect(findFileInDir(standaloneDir, path.join('meriyah', 'dist', 'meriyah.cjs'))).toBeDefined();
});

test('sends a server transaction from the standalone server', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-16-standalone', transactionEvent => {
    return transactionEvent.transaction === 'GET /';
  });

  await page.goto('/');

  const transactionEvent = await transactionPromise;
  expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
});

test('captures an error thrown in a route handler', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-16-standalone', errorEvent => {
    return errorEvent.exception?.values?.some(value => value.value === 'nextjs-16-standalone-server-error') ?? false;
  });

  const transactionEventPromise = waitForTransaction('nextjs-16-standalone', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/server-error' && transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  request.get('/api/server-error').catch(() => {
    // expected to fail
  });

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionEventPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('nextjs-16-standalone-server-error');
  expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');
});
