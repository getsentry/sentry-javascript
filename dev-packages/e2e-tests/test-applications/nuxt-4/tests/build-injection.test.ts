import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

function readServerBundle(): string {
  const serverDir = path.join(process.cwd(), '.output/server');
  return readdirSync(serverDir, { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.mjs'))
    .map(file => readFileSync(path.join(serverDir, file), 'utf8'))
    .join('\n');
}

function readClientBundle(): string {
  const serverDir = path.join(process.cwd(), '.output/public');
  return readdirSync(serverDir, { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.js'))
    .map(file => readFileSync(path.join(serverDir, file), 'utf8'))
    .join('\n');
}

test.describe('Orchestrion build-time injection', () => {
  const serverBundle = readServerBundle();
  const clientBundle = readClientBundle();

  test('force-bundles instrumented dependencies', () => {
    expect(serverBundle).not.toMatch(/(from\s*["']mysql["']|require\(["']mysql["']\))/);
    expect(serverBundle).not.toMatch(/(from\s*["']ioredis["']|require\(["']ioredis["']\))/);
    expect(serverBundle).not.toMatch(/(from\s*["']standard-as-callback["']|require\(["']standard-as-callback["']\))/);
  });

  test('injects diagnostics-channel publishers into the server build', () => {
    expect(serverBundle).toContain('__SENTRY_ORCHESTRION__');
    expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:mysql:query["']\)/);
    expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:ioredis:command["']\)/);
    expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:ioredis:connect["']\)/);
  });

  test('does not inject diagnostics-channel publishers into the client build', () => {
    expect(clientBundle).not.toContain('__SENTRY_ORCHESTRION__');
    expect(clientBundle).not.toMatch(/orchestrion:/);
  });
});
