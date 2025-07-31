import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

const esmWarning = `[Sentry] You are using Node.js v${process.versions.node} in ESM mode ("import syntax"). The Sentry Node.js SDK is not compatible with ESM in Node.js versions before 18.19.0 or before 20.6.0. Please either build your application with CommonJS ("require() syntax"), or upgrade your Node.js version.`;

test("warns if using ESM on Node.js versions that don't support `register()`", async () => {
  const nodeMajorVersion = Number(process.versions.node.split('.')[0]);
  if (nodeMajorVersion >= 18) {
    return;
  }

  const runner = createRunner(__dirname, 'server.mjs').ignore('event').start();

  await runner.makeRequest('get', '/test/success');

  expect(runner.getLogs()).toContain(esmWarning);
});

test('does not warn if using ESM on Node.js versions that support `register()`', async () => {
  const nodeMajorVersion = Number(process.versions.node.split('.')[0]);
  if (nodeMajorVersion < 18) {
    return;
  }

  const runner = createRunner(__dirname, 'server.mjs').ignore('event').start();

  await runner.makeRequest('get', '/test/success');

  expect(runner.getLogs()).not.toContain(esmWarning);
});

test('does not warn if using CJS', async () => {
  const runner = createRunner(__dirname, 'server.js').ignore('event').start();

  await runner.makeRequest('get', '/test/success');

  expect(runner.getLogs()).not.toContain(esmWarning);
});
